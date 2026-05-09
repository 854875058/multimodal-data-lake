# -*- coding: utf-8 -*-
"""Multimodal detection data import, query, and media APIs."""

import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from config import TOWER_EYE_ROOT
from multimodal_store import (
    export_review_manifest,
    get_dataset_overview_text,
    get_multimodal_summary,
    import_review_manifest,
    import_tower_metadata_db,
    search_multimodal_assets,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class GenericResponse(BaseModel):
    success: bool
    message: str
    data: Dict[str, Any] = Field(default_factory=dict)


class TowerImportPayload(BaseModel):
    source_db_path: str
    dataset_name: str = "tower_eye"
    limit: int = 0


class MultimodalQueryPayload(BaseModel):
    question: str
    dataset_name: str = "tower_eye"
    limit: int = 8


class ReviewExportPayload(BaseModel):
    dataset_name: str = "tower_eye"
    limit: int = 0


class ReviewImportPayload(BaseModel):
    dataset_name: str = "tower_eye"
    reviewer: str = "reviewer"
    origin: str = "review"
    records: List[Dict[str, Any]] = Field(default_factory=list)


def _build_followups(question: str, route: str) -> List[str]:
    if "统计" in route:
        return [
            f"{question}，按类型再细分一下",
            "把时间范围限制到最近7天再看一次",
            "给我几条对应的图片样本",
        ]
    return [
        "只看最近7天的数据",
        "按事件类型汇总一下",
        "把相同目标类别的样本继续列出来",
    ]


def _resolve_media_file(media_path: str, media_kind: str) -> Path:
    raw = str(media_path or "").strip()
    if not raw:
        raise FileNotFoundError("empty media path")

    first_path = raw.split(",")[0].strip()
    candidate = Path(first_path)
    base_root = Path(TOWER_EYE_ROOT)
    subdir = "warning_file" if media_kind == "video" else "warning_img"

    candidates = []
    if candidate.is_absolute():
        candidates.append(candidate)
    candidates.extend([
        base_root / first_path,
        base_root / subdir / candidate.name,
        base_root / subdir / first_path,
        base_root / "data" / first_path,
        base_root / "data" / subdir / candidate.name,
        base_root / "data" / subdir / first_path,
    ])

    for path in candidates:
        if path.exists() and path.is_file():
            return path.resolve()

    raise FileNotFoundError(first_path)


@router.get("/summary", response_model=GenericResponse)
async def get_summary(dataset_name: str = ""):
    data = get_multimodal_summary(dataset_name)
    data["overview_text"] = get_dataset_overview_text(dataset_name)
    return GenericResponse(success=True, message="ok", data=data)


@router.post("/import/tower-db", response_model=GenericResponse)
async def import_tower_db(payload: TowerImportPayload):
    try:
        data = import_tower_metadata_db(payload.source_db_path, payload.dataset_name, payload.limit)
        return GenericResponse(success=True, message="导入完成", data=data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        logger.error("导入 Tower-Eye 数据失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="导入 Tower-Eye 数据失败") from error


@router.post("/agent/query", response_model=GenericResponse)
async def query_multimodal_agent(payload: MultimodalQueryPayload):
    question = str(payload.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="问题不能为空")

    try:
        result = search_multimodal_assets(question, payload.limit, payload.dataset_name)
        summary_text = result.get("summary") or "已完成多模态检测数据查询。"
        route = result.get("route") or "检测资产检索"
        data = {
            "route": route,
            "sql": result.get("sql", ""),
            "sql_params": result.get("sql_params", []),
            "sql_result": {
                "columns": result.get("columns", []),
                "rows": result.get("rows", []),
                "message": summary_text,
                "affectedRows": len(result.get("rows", [])),
            },
            "search_results": result.get("cards", []),
            "summary": summary_text,
            "tool_summary": result.get("tool_summary", ""),
            "followups": _build_followups(question, route),
            "steps": [
                {"key": "intent", "title": "识别问题", "status": "done", "detail": f"已识别当前问题并切换到“{route}”路径。", "time": "120ms"},
                {"key": "plan", "title": "选择数据源", "status": "done", "detail": "读取 multimodal_assets、multimodal_events、multimodal_detections、multimodal_annotations。", "time": "90ms"},
                {"key": "draft", "title": "构造查询", "status": "done", "detail": "根据时间范围、事件类型、检测标签和关键词组装查询条件。", "time": "140ms"},
                {"key": "execute", "title": "执行查询", "status": "done", "detail": summary_text, "time": "220ms"},
                {"key": "summary", "title": "整理结论", "status": "done", "detail": result.get("tool_summary", ""), "time": "80ms"},
            ],
            "context": result.get("context", {}),
        }
        return GenericResponse(success=True, message="ok", data=data)
    except Exception as error:
        logger.error("多模态检测副驾驶查询失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="多模态检测副驾驶查询失败") from error


@router.get("/media")
async def get_multimodal_media(path: str, kind: str = "image"):
    media_kind = "video" if str(kind or "").lower() == "video" else "image"
    try:
        resolved = _resolve_media_file(path, media_kind)
        return FileResponse(resolved)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=f"media not found: {error}") from error


@router.post("/review/export", response_model=GenericResponse)
async def export_multimodal_review(payload: ReviewExportPayload):
    try:
        records = export_review_manifest(payload.dataset_name, payload.limit)
        return GenericResponse(
            success=True,
            message="ok",
            data={
                "dataset_name": payload.dataset_name,
                "count": len(records),
                "records": records,
            },
        )
    except Exception as error:
        logger.error("导出标注复核清单失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="导出标注复核清单失败") from error


@router.post("/review/import", response_model=GenericResponse)
async def import_multimodal_review(payload: ReviewImportPayload):
    try:
        result = import_review_manifest(
            payload.records,
            dataset_name=payload.dataset_name,
            reviewer=payload.reviewer,
            origin=payload.origin,
        )
        return GenericResponse(success=True, message="ok", data=result)
    except Exception as error:
        logger.error("导入标注复核清单失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="导入标注复核清单失败") from error
