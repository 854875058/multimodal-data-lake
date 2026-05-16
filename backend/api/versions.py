# -*- coding: utf-8 -*-
"""数据集版本管理 API - 基于 Lance 版本历史"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from models_loader import get_lancedb_tables

logger = logging.getLogger(__name__)
router = APIRouter()


class VersionItem(BaseModel):
    version: int
    timestamp: Optional[str] = None
    num_rows: Optional[int] = None
    tag: Optional[str] = None


class VersionListResponse(BaseModel):
    success: bool
    table: str
    versions: List[VersionItem]
    current_version: int


class RollbackRequest(BaseModel):
    table: str   # text | image | files
    version: int


class RollbackResponse(BaseModel):
    success: bool
    message: str
    version: int


class TableStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    table: str
    num_rows: int
    version: int
    schema_fields: List[str] = Field(alias="schema", serialization_alias="schema")


class StatsResponse(BaseModel):
    success: bool
    stats: List[TableStats]


def _get_table(name: str):
    tbl_text, tbl_image, tbl_files = get_lancedb_tables()
    mapping = {"text": tbl_text, "image": tbl_image, "files": tbl_files}
    tbl = mapping.get(name)
    if tbl is None:
        raise HTTPException(status_code=400, detail=f"未知表名: {name}，可选值: text, image, files")
    return tbl


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """获取各 Lance 表当前统计信息"""
    try:
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()
        tables = [
            ("text", tbl_text),
            ("image", tbl_image),
            ("files", tbl_files),
        ]
        stats = []
        for name, tbl in tables:
            try:
                schema_fields = [f.name for f in tbl.schema]
                version = tbl.version()
                num_rows = tbl.count_rows()
                stats.append(TableStats(
                    table=name,
                    num_rows=num_rows,
                    version=version,
                    schema_fields=schema_fields,
                ))
            except Exception as e:
                logger.warning(f"获取表 {name} 统计失败: {e}")
                stats.append(TableStats(table=name, num_rows=0, version=0, schema_fields=[]))
        return StatsResponse(success=True, stats=stats)
    except Exception as e:
        logger.error(f"获取统计信息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="获取统计信息失败")


@router.get("/{table_name}", response_model=VersionListResponse)
async def list_versions(table_name: str):
    """列出指定 Lance 表的所有历史版本"""
    try:
        tbl = _get_table(table_name)
        current = tbl.version()

        try:
            history = tbl.list_versions()
        except Exception:
            history = []

        versions = []
        for v in history:
            ver_num = v.get("version", 0) if isinstance(v, dict) else getattr(v, "version", 0)
            ts = v.get("timestamp", None) if isinstance(v, dict) else getattr(v, "timestamp", None)
            num_rows = v.get("metadata", {}).get("num_rows") if isinstance(v, dict) else None
            versions.append(VersionItem(
                version=ver_num,
                timestamp=str(ts) if ts else None,
                num_rows=num_rows,
            ))

        if not versions:
            versions = [VersionItem(version=current)]

        return VersionListResponse(
            success=True,
            table=table_name,
            versions=sorted(versions, key=lambda x: x.version, reverse=True),
            current_version=current,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取版本列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="获取版本列表失败")


@router.post("/rollback", response_model=RollbackResponse)
async def rollback_version(req: RollbackRequest):
    """回滚指定 Lance 表到历史版本"""
    try:
        tbl = _get_table(req.table)
        current = tbl.version()

        if req.version == current:
            return RollbackResponse(success=True, message="已经是该版本，无需回滚", version=current)

        tbl.restore(req.version)
        logger.info(f"表 {req.table} 已回滚到版本 {req.version}")
        return RollbackResponse(success=True, message=f"已回滚到版本 {req.version}", version=req.version)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"回滚失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"回滚失败: {str(e)}")


@router.post("/compact/{table_name}")
async def compact_table(table_name: str):
    """对指定表执行 Lance compaction，优化存储性能"""
    try:
        tbl = _get_table(table_name)
        try:
            tbl.compact_files()
            msg = f"表 {table_name} compaction 完成"
        except AttributeError:
            msg = f"当前 Lance 版本不支持 compact_files，已跳过"
        return {"success": True, "message": msg}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Compaction 失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Compaction 失败: {str(e)}")
