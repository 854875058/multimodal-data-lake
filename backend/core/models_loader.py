# -*- coding: utf-8 -*-
"""Model loading and LanceDB table helpers."""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from functools import lru_cache

import lancedb
import pyarrow as pa

from backend.core.config import DEFAULT_AWS_REGION, LANCE_DB_URI, S3_CONFIG

logger = logging.getLogger(__name__)


def get_text_splitter(chunk_size=500, chunk_overlap=50):
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
    except ImportError:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def _load_models():
    import os

    from sentence_transformers import SentenceTransformer
    import whisper

    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

    whisper_cache = os.path.join(
        os.getenv("XDG_CACHE_HOME", os.path.join(os.path.expanduser("~"), ".cache")),
        "whisper",
    )
    whisper_local = os.path.join(whisper_cache, "base.pt")
    if os.path.isfile(whisper_local):
        whisper_model = whisper.load_model(whisper_local)
    else:
        whisper_model = whisper.load_model("base")

    def _load_st(name):
        try:
            return SentenceTransformer(name, local_files_only=True)
        except Exception:
            logger.info("local cache miss, loading model online: %s", name)
            return SentenceTransformer(name)

    return {
        "text": _load_st("BAAI/bge-small-zh-v1.5"),
        "clip_text": _load_st("sentence-transformers/clip-ViT-B-32-multilingual-v1"),
        "clip_vision": _load_st("clip-ViT-B-32"),
        "whisper": whisper_model,
    }


@lru_cache(maxsize=1)
def load_models_cached():
    """Load AI models once and reuse them."""
    return _load_models()


def _storage_options():
    region = str(S3_CONFIG.get("region") or DEFAULT_AWS_REGION or "us-east-1")
    return {
        "endpoint_url": S3_CONFIG["endpoint_url"],
        "access_key_id": S3_CONFIG["access_key_id"],
        "secret_access_key": S3_CONFIG["secret_access_key"],
        "aws_access_key_id": S3_CONFIG["access_key_id"],
        "aws_secret_access_key": S3_CONFIG["secret_access_key"],
        "region": region,
        "aws_region": region,
        "allow_http": "true",
        "force_path_style": "true",
    }


def _open_or_create_table(db, table_name: str, schema: pa.Schema, required_columns):
    table = db.create_table(table_name, schema=schema, exist_ok=True)
    schema_names = set(getattr(table.schema, "names", []))
    if all(col in schema_names for col in required_columns):
        return table

    fallback_name = f"{table_name}_v2"
    logger.warning(
        "table %s is missing columns %s, using compatibility table %s",
        table_name,
        [col for col in required_columns if col not in schema_names],
        fallback_name,
    )
    fallback_table = db.create_table(fallback_name, schema=schema, exist_ok=True)

    fallback_schema_names = set(getattr(fallback_table.schema, "names", []))
    if not all(col in fallback_schema_names for col in required_columns):
        raise RuntimeError(f"invalid schema for fallback table {fallback_name}")
    return fallback_table


def _get_lancedb_connection():
    """Get LanceDB connection (may block on S3)."""
    return lancedb.connect(LANCE_DB_URI, storage_options=_storage_options())


# ---------------------------------------------------------------------------
# LanceDB tables cache with timeout protection
# ---------------------------------------------------------------------------
_LANCE_CONNECT_TIMEOUT = 8  # seconds
_LANCE_RETRY_COOLDOWN = 30  # seconds after failure before retrying

_lancedb_tables_cache = None
_lancedb_tables_fail_time = 0.0


def _build_lancedb_tables():
    """Build LanceDB tables (blocking S3 call)."""
    db = _get_lancedb_connection()

    text_schema = pa.schema([
        pa.field("id", pa.string()),
        pa.field("vector", lancedb.vector(512)),
        pa.field("text", pa.string()),
        pa.field("source_uri", pa.string()),
        pa.field("doc_name", pa.string()),
        pa.field("doc_type", pa.string()),
        pa.field("file_hash", pa.string()),
    ])
    image_schema = pa.schema([
        pa.field("id", pa.string()),
        pa.field("vector", lancedb.vector(512)),
        pa.field("source_uri", pa.string()),
        pa.field("doc_name", pa.string()),
        pa.field("meta_info", pa.string()),
        pa.field("file_hash", pa.string()),
    ])
    files_schema = pa.schema([
        pa.field("file_hash", pa.string()),
        pa.field("doc_name", pa.string()),
        pa.field("doc_type", pa.string()),
        pa.field("source_uri", pa.string()),
        pa.field("file_bytes", pa.binary()),
        pa.field("text_full", pa.string()),
    ])

    tbl_text = _open_or_create_table(
        db, "text_chunks", text_schema,
        required_columns=["id", "vector", "text", "source_uri", "doc_name", "doc_type", "file_hash"],
    )
    tbl_image = _open_or_create_table(
        db, "image_chunks", image_schema,
        required_columns=["id", "vector", "source_uri", "doc_name", "meta_info", "file_hash"],
    )
    tbl_files = _open_or_create_table(
        db, "files", files_schema,
        required_columns=["file_hash", "doc_name", "doc_type", "source_uri", "file_bytes", "text_full"],
    )
    return tbl_text, tbl_image, tbl_files


def get_lancedb_tables():
    """Open or create LanceDB tables with timeout protection.

    - Returns cached tables on cache hit.
    - On timeout/failure, caches the failure for _LANCE_RETRY_COOLDOWN seconds
      so subsequent calls fail fast instead of blocking again.
    - Raises RuntimeError if S3 is unreachable.
    """
    global _lancedb_tables_cache, _lancedb_tables_fail_time

    # Cache hit
    if _lancedb_tables_cache is not None:
        return _lancedb_tables_cache

    # Cooldown after recent failure — fail fast
    if _lancedb_tables_fail_time > 0:
        elapsed = time.time() - _lancedb_tables_fail_time
        if elapsed < _LANCE_RETRY_COOLDOWN:
            raise RuntimeError(
                f"LanceDB 不可用（{int(_LANCE_RETRY_COOLDOWN - elapsed)}s 后重试）"
            )
        # Cooldown expired, reset and retry
        _lancedb_tables_fail_time = 0.0

    # Try with timeout
    executor = ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(_build_lancedb_tables)
        result = future.result(timeout=_LANCE_CONNECT_TIMEOUT)
        _lancedb_tables_cache = result
        _lancedb_tables_fail_time = 0.0
        return result
    except FutureTimeout:
        _lancedb_tables_fail_time = time.time()
        executor.shutdown(wait=False, cancel_futures=True)
        logger.warning("LanceDB 连接超时（%ds），将在 %ds 后重试", _LANCE_CONNECT_TIMEOUT, _LANCE_RETRY_COOLDOWN)
        raise RuntimeError(f"LanceDB 连接超时（{_LANCE_CONNECT_TIMEOUT}s）")
    except Exception as e:
        _lancedb_tables_fail_time = time.time()
        logger.warning("LanceDB 连接失败: %s", e)
        raise RuntimeError(f"LanceDB 连接失败: {e}") from e
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


# ---------------------------------------------------------------------------
# File entities table (also cached)
# ---------------------------------------------------------------------------
_file_entities_cache = None
_file_entities_fail_time = 0.0


def get_file_entities_table():
    """Open or create the file_entities table (cached with timeout)."""
    global _file_entities_cache, _file_entities_fail_time

    if _file_entities_cache is not None:
        return _file_entities_cache

    if _file_entities_fail_time > 0:
        elapsed = time.time() - _file_entities_fail_time
        if elapsed < _LANCE_RETRY_COOLDOWN:
            raise RuntimeError("file_entities 表不可用")

    def _build():
        db = lancedb.connect(LANCE_DB_URI, storage_options=_storage_options())
        entities_schema = pa.schema([
            pa.field("file_hash", pa.string()),
            pa.field("entity", pa.string()),
            pa.field("entity_type", pa.string()),
        ])
        return db.create_table("file_entities", schema=entities_schema, exist_ok=True)

    executor = ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(_build)
        result = future.result(timeout=_LANCE_CONNECT_TIMEOUT)
        _file_entities_cache = result
        _file_entities_fail_time = 0.0
        return result
    except FutureTimeout:
        _file_entities_fail_time = time.time()
        raise RuntimeError("file_entities 连接超时")
    except Exception as e:
        _file_entities_fail_time = time.time()
        raise RuntimeError(f"file_entities 连接失败: {e}") from e
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


# ---------------------------------------------------------------------------
# Multimodal tables (cached with timeout)
# ---------------------------------------------------------------------------
_multimodal_tables_cache = None
_multimodal_fail_time = 0.0


def get_multimodal_lancedb_tables():
    """Open or create Lance tables used by the multimodal detection demo (cached)."""
    global _multimodal_tables_cache, _multimodal_fail_time

    if _multimodal_tables_cache is not None:
        return _multimodal_tables_cache

    if _multimodal_fail_time > 0:
        elapsed = time.time() - _multimodal_fail_time
        if elapsed < _LANCE_RETRY_COOLDOWN:
            raise RuntimeError("multimodal 表不可用")

    def _build():
        db = lancedb.connect(LANCE_DB_URI, storage_options=_storage_options())

        assets_schema = pa.schema([
            pa.field("asset_id", pa.string()),
            pa.field("dataset_name", pa.string()),
            pa.field("media_type", pa.string()),
            pa.field("file_path", pa.string()),
            pa.field("file_name", pa.string()),
            pa.field("sha256", pa.string()),
            pa.field("width", pa.int64()),
            pa.field("height", pa.int64()),
            pa.field("duration_sec", pa.float64()),
            pa.field("captured_at", pa.string()),
            pa.field("lat", pa.float64()),
            pa.field("lon", pa.float64()),
            pa.field("source", pa.string()),
            pa.field("created_at", pa.string()),
            pa.field("imported_at", pa.string()),
        ])
        events_schema = pa.schema([
            pa.field("event_id", pa.string()),
            pa.field("asset_id", pa.string()),
            pa.field("dataset_name", pa.string()),
            pa.field("event_type", pa.string()),
            pa.field("alarm_level", pa.string()),
            pa.field("alarm_source", pa.string()),
            pa.field("alarm_time", pa.string()),
            pa.field("lat", pa.float64()),
            pa.field("lon", pa.float64()),
            pa.field("region", pa.string()),
            pa.field("extra_json", pa.string()),
            pa.field("summary", pa.string()),
            pa.field("description", pa.string()),
            pa.field("address", pa.string()),
            pa.field("device_name", pa.string()),
            pa.field("confidence_level", pa.float64()),
            pa.field("province_name", pa.string()),
            pa.field("city_name", pa.string()),
            pa.field("county_name", pa.string()),
            pa.field("town_code", pa.string()),
            pa.field("town_name", pa.string()),
            pa.field("device_code", pa.string()),
            pa.field("channel_code", pa.string()),
            pa.field("channel_name", pa.string()),
            pa.field("warning_order_id", pa.string()),
            pa.field("warning_type_id", pa.string()),
            pa.field("alarm_body", pa.string()),
            pa.field("algorithm_code", pa.string()),
            pa.field("algorithm_name", pa.string()),
            pa.field("emergency_level", pa.string()),
            pa.field("importance_level", pa.string()),
            pa.field("order_status", pa.string()),
            pa.field("confidence_level_max", pa.float64()),
            pa.field("tenant_name", pa.string()),
            pa.field("video_path", pa.string()),
            pa.field("img_src_path", pa.string()),
            pa.field("img_icon_path", pa.string()),
            pa.field("created_at", pa.string()),
            pa.field("imported_at", pa.string()),
        ])
        detections_schema = pa.schema([
            pa.field("detection_id", pa.string()),
            pa.field("asset_id", pa.string()),
            pa.field("dataset_name", pa.string()),
            pa.field("model_name", pa.string()),
            pa.field("label", pa.string()),
            pa.field("confidence", pa.float64()),
            pa.field("bbox_x", pa.float64()),
            pa.field("bbox_y", pa.float64()),
            pa.field("bbox_w", pa.float64()),
            pa.field("bbox_h", pa.float64()),
            pa.field("frame_index", pa.int64()),
            pa.field("timestamp_sec", pa.float64()),
            pa.field("created_at", pa.string()),
            pa.field("imported_at", pa.string()),
        ])
        annotations_schema = pa.schema([
            pa.field("annotation_id", pa.string()),
            pa.field("asset_id", pa.string()),
            pa.field("dataset_name", pa.string()),
            pa.field("label", pa.string()),
            pa.field("bbox_x", pa.float64()),
            pa.field("bbox_y", pa.float64()),
            pa.field("bbox_w", pa.float64()),
            pa.field("bbox_h", pa.float64()),
            pa.field("origin", pa.string()),
            pa.field("reviewer", pa.string()),
            pa.field("reviewed_at", pa.string()),
            pa.field("created_at", pa.string()),
            pa.field("imported_at", pa.string()),
        ])

        return (
            _open_or_create_table(db, "multimodal_assets", assets_schema, [f.name for f in assets_schema]),
            _open_or_create_table(db, "multimodal_events", events_schema, [f.name for f in events_schema]),
            _open_or_create_table(db, "multimodal_detections", detections_schema, [f.name for f in detections_schema]),
            _open_or_create_table(db, "multimodal_annotations", annotations_schema, [f.name for f in annotations_schema]),
        )

    executor = ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(_build)
        result = future.result(timeout=_LANCE_CONNECT_TIMEOUT)
        _multimodal_tables_cache = result
        _multimodal_fail_time = 0.0
        return result
    except FutureTimeout:
        _multimodal_fail_time = time.time()
        raise RuntimeError("multimodal 表连接超时")
    except Exception as e:
        _multimodal_fail_time = time.time()
        raise RuntimeError(f"multimodal 表连接失败: {e}") from e
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
