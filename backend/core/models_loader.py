# -*- coding: utf-8 -*-
"""Model loading and LanceDB table helpers."""

import logging
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


def get_lancedb_tables():
    """Open or create the existing business tables in LanceDB."""
    db = lancedb.connect(LANCE_DB_URI, storage_options=_storage_options())

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
        db,
        "text_chunks",
        text_schema,
        required_columns=["id", "vector", "text", "source_uri", "doc_name", "doc_type", "file_hash"],
    )
    tbl_image = _open_or_create_table(
        db,
        "image_chunks",
        image_schema,
        required_columns=["id", "vector", "source_uri", "doc_name", "meta_info", "file_hash"],
    )
    tbl_files = _open_or_create_table(
        db,
        "files",
        files_schema,
        required_columns=["file_hash", "doc_name", "doc_type", "source_uri", "file_bytes", "text_full"],
    )
    return tbl_text, tbl_image, tbl_files


def get_file_entities_table():
    """Open or create the file_entities table."""
    db = lancedb.connect(LANCE_DB_URI, storage_options=_storage_options())
    entities_schema = pa.schema([
        pa.field("file_hash", pa.string()),
        pa.field("entity", pa.string()),
        pa.field("entity_type", pa.string()),
    ])
    return db.create_table("file_entities", schema=entities_schema, exist_ok=True)


def get_multimodal_lancedb_tables():
    """Open or create Lance tables used by the multimodal detection demo."""
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

    tbl_assets = _open_or_create_table(
        db,
        "multimodal_assets",
        assets_schema,
        required_columns=[field.name for field in assets_schema],
    )
    tbl_events = _open_or_create_table(
        db,
        "multimodal_events",
        events_schema,
        required_columns=[field.name for field in events_schema],
    )
    tbl_detections = _open_or_create_table(
        db,
        "multimodal_detections",
        detections_schema,
        required_columns=[field.name for field in detections_schema],
    )
    tbl_annotations = _open_or_create_table(
        db,
        "multimodal_annotations",
        annotations_schema,
        required_columns=[field.name for field in annotations_schema],
    )
    return tbl_assets, tbl_events, tbl_detections, tbl_annotations
