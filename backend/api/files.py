# -*- coding: utf-8 -*-
"""文件管理 API"""

import logging
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

from backend.core.config import FILE_DELETE_LOCAL_ONLY
from backend.core.database import delete_file_from_registry
from backend.core.models_loader import get_lancedb_tables
from backend.services.s3_utils import delete_from_s3
from backend.utils.text_codec import decode_text_from_storage

logger = logging.getLogger(__name__)
router = APIRouter()

IMAGE_TYPES = {"jpg", "jpeg", "png", "gif", "bmp", "webp"}
AUDIO_TYPES = {"mp3", "wav", "ogg", "m4a", "flac"}
VIDEO_TYPES = {"mp4", "avi", "mov", "mkv", "webm"}


class FileItem(BaseModel):
    file_hash: str
    doc_name: str
    doc_type: str
    source_uri: str


class FilesListResponse(BaseModel):
    success: bool
    files: List[FileItem]
    total: int
    page: int
    page_size: int


class FilePreviewResponse(BaseModel):
    success: bool
    file_hash: str
    doc_name: str
    doc_type: str
    content_type: str
    content: Optional[str] = None
    content_url: Optional[str] = None
    text_full: Optional[str] = None


class DeleteResponse(BaseModel):
    success: bool
    message: str


def _escape_lancedb_value(value: str) -> str:
    return value.replace("'", "''")


def _build_eq_filter(field_name: str, value: str) -> str:
    return f"{field_name} = '{_escape_lancedb_value(value)}'"


def _resolve_preview_type(doc_type: str) -> str:
    ext = (doc_type or "").lower()
    if ext in IMAGE_TYPES:
        return "image"
    if ext in AUDIO_TYPES:
        return "audio"
    if ext in VIDEO_TYPES:
        return "video"
    return "text"


def _resolve_media_type(doc_type: str) -> str:
    ext = (doc_type or "").lower()
    if ext in IMAGE_TYPES:
        return f"image/{'jpeg' if ext == 'jpg' else ext}"
    if ext in AUDIO_TYPES:
        return f"audio/{ext}"
    if ext in VIDEO_TYPES:
        return f"video/{ext}"
    return "application/octet-stream"


def _get_client_host(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return ""


def _ensure_delete_access(request: Request):
    if not FILE_DELETE_LOCAL_ONLY:
        return
    client_host = _get_client_host(request)
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="删除接口仅允许本机访问")


@router.get("/list", response_model=FilesListResponse)
async def list_files(page: int = 1, page_size: int = 20, doc_type: str = None):
    """获取文件列表（分页）"""
    try:
        _, _, tbl_files = get_lancedb_tables()

        safe_page = max(1, page)
        safe_page_size = min(max(1, page_size), 200)
        offset = (safe_page - 1) * safe_page_size

        filter_expr = None
        if doc_type and doc_type != "all":
            filter_expr = _build_eq_filter("doc_type", doc_type)

        total = tbl_files.count_rows(filter=filter_expr)

        query = tbl_files.search()
        if filter_expr:
            query = query.where(filter_expr)

        df_page = (
            query
            .select(["file_hash", "doc_name", "doc_type", "source_uri"])
            .offset(offset)
            .limit(safe_page_size)
            .to_pandas()
        )

        files = [
            FileItem(
                file_hash=row["file_hash"],
                doc_name=row["doc_name"],
                doc_type=row["doc_type"],
                source_uri=row["source_uri"],
            )
            for _, row in df_page.iterrows()
        ]

        return FilesListResponse(
            success=True,
            files=files,
            total=total,
            page=safe_page,
            page_size=safe_page_size,
        )

    except Exception as e:
        logger.error(f"获取文件列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="获取文件列表失败")


@router.get("/preview/{file_hash}", response_model=FilePreviewResponse)
async def preview_file(file_hash: str):
    """获取文件预览信息（文本内容或媒体访问地址）"""
    try:
        _, _, tbl_files = get_lancedb_tables()
        hash_filter = _build_eq_filter("file_hash", file_hash)

        df = (
            tbl_files.search()
            .where(hash_filter)
            .select(["file_hash", "doc_name", "doc_type", "file_bytes", "text_full"])
            .limit(1)
            .to_pandas()
        )

        if df.empty:
            raise HTTPException(status_code=404, detail="文件不存在")

        row = df.iloc[0]
        doc_name = row["doc_name"]
        doc_type = row["doc_type"]
        preview_type = _resolve_preview_type(doc_type)

        if preview_type == "text":
            return FilePreviewResponse(
                success=True,
                file_hash=file_hash,
                doc_name=doc_name,
                doc_type=doc_type,
                content_type="text",
                text_full=decode_text_from_storage(row.get("text_full", "")) or "无文本内容",
            )

        file_bytes = row.get("file_bytes", b"") or b""
        if len(file_bytes) == 0:
            raise HTTPException(status_code=404, detail="该文件未存储二进制内容，无法预览")

        return FilePreviewResponse(
            success=True,
            file_hash=file_hash,
            doc_name=doc_name,
            doc_type=doc_type,
            content_type=preview_type,
            content_url=f"/api/files/content/{quote(file_hash, safe='')}",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"预览文件失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="预览文件失败")


@router.get("/content/{file_hash}")
async def get_file_content(file_hash: str):
    """按文件 hash 返回原始二进制内容，用于流式预览。"""
    try:
        _, _, tbl_files = get_lancedb_tables()
        hash_filter = _build_eq_filter("file_hash", file_hash)

        df = (
            tbl_files.search()
            .where(hash_filter)
            .select(["doc_name", "doc_type", "file_bytes"])
            .limit(1)
            .to_pandas()
        )

        if df.empty:
            raise HTTPException(status_code=404, detail="文件不存在")

        row = df.iloc[0]
        file_bytes = row.get("file_bytes", b"") or b""
        if len(file_bytes) == 0:
            raise HTTPException(status_code=404, detail="文件二进制内容不存在")

        doc_name = row.get("doc_name", "file")
        doc_type = row.get("doc_type", "")
        media_type = _resolve_media_type(doc_type)

        headers = {
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(doc_name)}",
            "Cache-Control": "private, max-age=60",
        }
        return Response(content=file_bytes, media_type=media_type, headers=headers)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取文件内容失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="获取文件内容失败")


@router.delete("/{file_hash}", response_model=DeleteResponse)
async def delete_file(file_hash: str, request: Request):
    """删除文件"""
    try:
        _ensure_delete_access(request)
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()
        hash_filter = _build_eq_filter("file_hash", file_hash)

        df = (
            tbl_files.search()
            .where(hash_filter)
            .select(["file_hash", "source_uri"])
            .limit(1)
            .to_pandas()
        )

        if df.empty:
            return DeleteResponse(success=False, message="文件不存在")

        source_uri = df.iloc[0].get("source_uri", "")

        tbl_text.delete(hash_filter)
        tbl_image.delete(hash_filter)
        tbl_files.delete(hash_filter)

        delete_file_from_registry(file_hash)

        if isinstance(source_uri, str) and source_uri.startswith("s3://"):
            delete_from_s3(source_uri)

        logger.info(f"文件已删除: {file_hash}")
        return DeleteResponse(success=True, message="文件删除成功")

    except Exception as e:
        logger.error(f"删除文件失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="删除文件失败")
