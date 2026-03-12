# -*- coding: utf-8 -*-
"""AI 模型与 LanceDB 连接"""

import logging
from functools import lru_cache

import lancedb
import pyarrow as pa

from config import DEFAULT_AWS_REGION, LANCE_DB_URI, S3_CONFIG

logger = logging.getLogger(__name__)

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitter import RecursiveCharacterTextSplitter


def get_text_splitter(chunk_size=500, chunk_overlap=50):
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def _load_models():
    from sentence_transformers import SentenceTransformer
    import whisper
    import os

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
            logger.info(f"本地缓存未命中，联网加载模型: {name}")
            return SentenceTransformer(name)

    return {
        "text": _load_st("BAAI/bge-small-zh-v1.5"),
        "clip_text": _load_st("sentence-transformers/clip-ViT-B-32-multilingual-v1"),
        "clip_vision": _load_st("clip-ViT-B-32"),
        "whisper": whisper_model,
    }


@lru_cache(maxsize=1)
def load_models_cached():
    """加载 AI 模型并缓存，避免重复重载。"""
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
        "检测到旧表 %s 缺失列 %s，启用兼容表 %s，避免自动删表导致数据丢失",
        table_name,
        [col for col in required_columns if col not in schema_names],
        fallback_name,
    )
    fallback_table = db.create_table(fallback_name, schema=schema, exist_ok=True)

    fallback_schema_names = set(getattr(fallback_table.schema, "names", []))
    if not all(col in fallback_schema_names for col in required_columns):
        raise RuntimeError(f"表 {fallback_name} 结构异常，缺少必需列")
    return fallback_table


def get_lancedb_tables():
    """打开或创建 LanceDB 业务表（安全兼容模式）。"""
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
    """打开或创建 file_entities 表。"""
    db = lancedb.connect(LANCE_DB_URI, storage_options=_storage_options())
    entities_schema = pa.schema([
        pa.field("file_hash", pa.string()),
        pa.field("entity", pa.string()),
        pa.field("entity_type", pa.string()),
    ])
    return db.create_table("file_entities", schema=entities_schema, exist_ok=True)
