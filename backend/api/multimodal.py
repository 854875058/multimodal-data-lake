# -*- coding: utf-8 -*-
"""Multimodal detection import, query, media, review, and trace APIs."""

import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from config import TOWER_EYE_ROOT
from multimodal_store import (
    apply_auto_label_job_records,
    export_review_manifest,
    generate_auto_label_manifest,
    get_auto_labeling_overview,
    get_dataset_overview_text,
    get_multimodal_summary,
    import_review_manifest,
    import_tower_metadata_db,
    search_multimodal_assets,
)
from multimodal_labeling import (
    create_labeling_job_id,
    get_multimodal_labeling_job,
    list_multimodal_labeling_jobs,
    save_multimodal_labeling_job,
    update_multimodal_labeling_job,
)
from multimodal_trace import (
    create_trace_id,
    get_multimodal_query_trace,
    get_multimodal_trace_stats,
    list_multimodal_query_traces,
    save_multimodal_query_trace,
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
    session_id: str = ""
    filters: Dict[str, Any] = Field(default_factory=dict)


class ReviewExportPayload(BaseModel):
    dataset_name: str = "tower_eye"
    limit: int = 0


class ReviewImportPayload(BaseModel):
    dataset_name: str = "tower_eye"
    reviewer: str = "reviewer"
    origin: str = "review"
    records: List[Dict[str, Any]] = Field(default_factory=list)


class TraceListPayload(BaseModel):
    limit: int = 20
    session_id: str = ""


class AutoLabelGeneratePayload(BaseModel):
    dataset_name: str = "tower_eye"
    scope_type: str = "dataset"
    strategy: str = "high_confidence"
    limit: int = 50
    min_confidence: float = 0.6
    only_unreviewed: bool = True
    asset_ids: List[str] = Field(default_factory=list)


class AutoLabelApplyPayload(BaseModel):
    reviewer: str = "reviewer"
    origin: str = "auto_review"
    action: str = "accept"
    asset_ids: List[str] = Field(default_factory=list)


def _build_followups(question: str, route: str) -> List[str]:
    if "统计" in route:
        return [
            f"{question}，按类型再细分一层",
            "把时间范围限定到最近 7 天再看一次",
            "给我几条对应的图片样本",
        ]
    return [
        "只看最近 7 天的数据",
        "按事件类型汇总一次",
        "把相同目标类别的样本继续列出来",
    ]


def _build_steps(route: str, summary_text: str, tool_summary: str, context: Dict[str, Any], filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    draft_parts = ["根据时间范围、事件类型、检测标签和关键词组装 DuckDB 查询条件。"]
    if filters:
        draft_parts.append(f"接收前端显式筛选: {filters}")
    applied_filters = context.get("applied_filters") or {}
    if applied_filters:
        draft_parts.append(f"后端实际生效筛选: {applied_filters}")
    return [
        {"key": "intent", "title": "识别问题", "status": "done", "detail": f"已识别当前问题并切换到“{route}”路径。", "time": "120ms"},
        {"key": "plan", "title": "选择数据源", "status": "done", "detail": "读取 multimodal_assets、multimodal_events、multimodal_detections、multimodal_annotations。", "time": "90ms"},
        {"key": "draft", "title": "构造查询", "status": "done", "detail": " ".join(draft_parts), "time": "140ms"},
        {"key": "execute", "title": "执行查询", "status": "done", "detail": summary_text, "time": "220ms"},
        {"key": "summary", "title": "整理结论", "status": "done", "detail": tool_summary, "time": "80ms"},
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
    candidates.extend(
        [
            base_root / first_path,
            base_root / subdir / candidate.name,
            base_root / subdir / first_path,
            base_root / "data" / first_path,
            base_root / "data" / subdir / candidate.name,
            base_root / "data" / subdir / first_path,
        ]
    )

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

    trace_id = create_trace_id()
    try:
        result = search_multimodal_assets(
            question,
            payload.limit,
            payload.dataset_name,
            filters=payload.filters,
        )
        summary_text = result.get("summary") or "已完成多模态检测数据查询。"
        route = result.get("route") or "检测资产检索"
        tool_summary = result.get("tool_summary", "")
        context = result.get("context", {})
        intent = "search" if "检索" in route else "count" if "统计" in route else "list"
        steps = _build_steps(route, summary_text, tool_summary, context, payload.filters)
        row_count = len(result.get("rows", []))
        card_count = len(result.get("cards", []))
        result_count = row_count or card_count

        save_multimodal_query_trace(
            trace_id=trace_id,
            session_id=payload.session_id,
            question=question,
            dataset_name=payload.dataset_name,
            route=route,
            intent=intent,
            filters=payload.filters,
            sql_text=result.get("sql", ""),
            sql_params=result.get("sql_params", []),
            result_count=result_count,
            status="success",
            tool_summary=tool_summary,
            summary_text=summary_text,
            steps=steps,
            context=context,
        )

        return GenericResponse(
            success=True,
            message="ok",
            data={
                "trace_id": trace_id,
                "route": route,
                "intent": intent,
                "sql": result.get("sql", ""),
                "sql_params": result.get("sql_params", []),
                "filters": payload.filters,
                "sql_result": {
                    "columns": result.get("columns", []),
                    "rows": result.get("rows", []),
                    "message": summary_text,
                    "affectedRows": row_count,
                },
                "search_results": result.get("cards", []),
                "summary": summary_text,
                "tool_summary": tool_summary,
                "followups": _build_followups(question, route),
                "steps": steps,
                "context": context,
            },
        )
    except Exception as error:
        logger.error("多模态副驾驶查询失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="多模态副驾驶查询失败") from error


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


@router.get("/annotation/overview", response_model=GenericResponse)
async def get_annotation_overview(dataset_name: str = "tower_eye"):
    try:
        data = get_auto_labeling_overview(dataset_name)
        return GenericResponse(success=True, message="ok", data=data)
    except Exception as error:
        logger.error("获取自动化标注概览失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="获取自动化标注概览失败") from error


@router.post("/annotation/jobs", response_model=GenericResponse)
async def create_annotation_job(payload: AutoLabelGeneratePayload):
    try:
        result = generate_auto_label_manifest(
            dataset_name=payload.dataset_name,
            limit=payload.limit,
            scope_type=payload.scope_type,
            strategy=payload.strategy,
            min_confidence=payload.min_confidence,
            only_unreviewed=payload.only_unreviewed,
            asset_ids=payload.asset_ids,
        )
        job_id = create_labeling_job_id()
        save_multimodal_labeling_job(
            job_id=job_id,
            dataset_name=payload.dataset_name,
            scope_type=payload.scope_type,
            status="success",
            strategy=payload.strategy,
            config=payload.model_dump(),
            stats=result.get("stats", {}),
            result=result,
        )
        return GenericResponse(
            success=True,
            message="ok",
            data={
                "job_id": job_id,
                "dataset_name": payload.dataset_name,
                "scope_type": payload.scope_type,
                "strategy": payload.strategy,
                **result,
            },
        )
    except Exception as error:
        logger.error("生成自动化标注任务失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="生成自动化标注任务失败") from error


@router.get("/annotation/jobs", response_model=GenericResponse)
async def list_annotation_jobs(limit: int = 20, dataset_name: str = ""):
    try:
        items = list_multimodal_labeling_jobs(limit=limit, dataset_name=dataset_name)
        return GenericResponse(success=True, message="ok", data={"items": items, "count": len(items)})
    except Exception as error:
        logger.error("获取自动化标注任务列表失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="获取自动化标注任务列表失败") from error


@router.get("/annotation/jobs/{job_id}", response_model=GenericResponse)
async def get_annotation_job(job_id: str):
    data = get_multimodal_labeling_job(job_id)
    if not data:
        raise HTTPException(status_code=404, detail="annotation job not found")
    return GenericResponse(success=True, message="ok", data=data)


@router.post("/annotation/jobs/{job_id}/apply", response_model=GenericResponse)
async def apply_annotation_job(job_id: str, payload: AutoLabelApplyPayload):
    job_data = get_multimodal_labeling_job(job_id)
    if not job_data:
        raise HTTPException(status_code=404, detail="annotation job not found")

    action = str(payload.action or "accept").strip().lower()
    if action not in {"accept", "reject"}:
        raise HTTPException(status_code=400, detail="invalid action")

    try:
        apply_result = apply_auto_label_job_records(
            job_data,
            reviewer=payload.reviewer,
            origin=payload.origin,
            action=action,
            asset_ids=payload.asset_ids,
        )

        current_stats = job_data.get("stats") or {}
        current_result = job_data.get("result") or {}
        accepted_ids = sorted(set((current_result.get("accepted_asset_ids") or []) + apply_result.get("accepted_asset_ids", [])))
        rejected_ids = sorted(set((current_result.get("rejected_asset_ids") or []) + apply_result.get("rejected_asset_ids", [])))

        current_result["accepted_asset_ids"] = accepted_ids
        current_result["rejected_asset_ids"] = rejected_ids
        current_result["last_apply_result"] = apply_result

        current_stats["accepted_asset_count"] = len(accepted_ids)
        current_stats["rejected_asset_count"] = len(rejected_ids)
        current_stats["reviewed_asset_count"] = len(accepted_ids) + len(rejected_ids)

        next_status = "reviewed" if current_stats["reviewed_asset_count"] else job_data.get("status") or "success"
        update_multimodal_labeling_job(
            job_id,
            status=next_status,
            stats=current_stats,
            result=current_result,
        )

        updated = get_multimodal_labeling_job(job_id)
        return GenericResponse(success=True, message="ok", data={"apply_result": apply_result, "job": updated or {}})
    except Exception as error:
        logger.error("应用自动化标注任务失败: %s", error, exc_info=True)
        raise HTTPException(status_code=500, detail="应用自动化标注任务失败") from error


@router.post("/traces", response_model=GenericResponse)
async def list_multimodal_traces(payload: TraceListPayload):
    items = list_multimodal_query_traces(limit=payload.limit, session_id=payload.session_id)
    return GenericResponse(success=True, message="ok", data={"items": items, "count": len(items)})


@router.get("/traces/stats", response_model=GenericResponse)
async def get_multimodal_traces_stats():
    return GenericResponse(success=True, message="ok", data=get_multimodal_trace_stats())


@router.get("/traces/{trace_id}", response_model=GenericResponse)
async def get_multimodal_trace_detail(trace_id: str):
    data = get_multimodal_query_trace(trace_id)
    if not data:
        raise HTTPException(status_code=404, detail="trace not found")
    return GenericResponse(success=True, message="ok", data=data)
