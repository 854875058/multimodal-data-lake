# -*- coding: utf-8 -*-
"""Multimodal detection data import and copilot query APIs."""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from multimodal_store import (
    get_dataset_overview_text,
    get_multimodal_summary,
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


def _build_followups(question: str, route: str) -> List[str]:
    if "统计" in route:
        return [
            f"{question}，按类型再细分一下",
            "把时间范围限制到近7天再看一次",
            "给我几条对应的图片样本",
        ]
    return [
        "只看近7天的数据",
        "按事件类型汇总一下",
        "把相同目标类别的样本继续列出来",
    ]


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
                {"key": "intent", "title": "识别问题", "status": "done", "detail": f"已识别问题并切换到「{route}」路径。", "time": "120ms"},
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
