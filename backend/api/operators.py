# -*- coding: utf-8 -*-
"""Operator catalog and execution APIs."""

from __future__ import annotations

from datetime import date
import logging
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend.operators_migrated.registry import (
    OperatorValidationError,
    build_operator_instance,
    get_operator_catalog_summary,
    get_operator_or_none,
    list_migrated_operators,
    validate_operator_params,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class OperatorExecutePayload(BaseModel):
    operator_key: str
    source_path: str
    sink_path: str
    params: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("operator_key", "source_path", "sink_path", mode="before")
    @classmethod
    def normalize_string(cls, value):
        return str(value or "").strip()


class OperatorValidatePayload(BaseModel):
    params: Dict[str, Any] = Field(default_factory=dict)


def _require_operator(operator_key: str) -> Dict[str, Any]:
    operator_meta = get_operator_or_none(operator_key)
    if not operator_meta:
        raise HTTPException(status_code=404, detail="operator not found")
    return operator_meta


def _ensure_runnable(operator_meta: Dict[str, Any]) -> None:
    health = operator_meta.get("health") or {}
    if health.get("can_execute"):
        return
    state = health.get("state") or "blocked"
    issue_messages = [issue.get("message", "") for issue in health.get("issues") or [] if issue.get("message")]
    detail = f"operator is not runnable: {state}"
    if issue_messages:
        detail = f"{detail}; {'; '.join(issue_messages)}"
    raise HTTPException(status_code=409, detail=detail)


@router.get("/catalog")
async def get_operator_catalog():
    operators = list_migrated_operators()
    return {
        "success": True,
        "snapshot_date": date.today().isoformat(),
        "summary": get_operator_catalog_summary(),
        "operators": operators,
    }


@router.get("/{operator_key}")
async def get_operator_detail(operator_key: str):
    return {
        "success": True,
        "operator": _require_operator(operator_key),
    }


@router.post("/{operator_key}/validate")
async def validate_operator(operator_key: str, payload: OperatorValidatePayload):
    operator_meta = _require_operator(operator_key)
    try:
        normalized_params = validate_operator_params(operator_key, payload.params)
    except OperatorValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "success": True,
        "operator": operator_meta,
        "validation": {
            "valid": True,
            "params": normalized_params,
            "can_execute": bool(operator_meta.get("health", {}).get("can_execute")),
        },
    }


@router.post("/execute")
async def execute_operator(payload: OperatorExecutePayload):
    operator_meta = _require_operator(payload.operator_key)
    _ensure_runnable(operator_meta)

    source = Path(payload.source_path).expanduser()
    sink = Path(payload.sink_path).expanduser()
    if not source.exists() or not source.is_dir():
        raise HTTPException(status_code=400, detail="source_path must be an existing directory")
    sink.mkdir(parents=True, exist_ok=True)

    try:
        validated_params = validate_operator_params(payload.operator_key, payload.params)
    except OperatorValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    operator = build_operator_instance(payload.operator_key)
    if operator is None:
        raise HTTPException(status_code=500, detail="operator could not be instantiated")

    results = operator.process(
        operator_id=payload.operator_key,
        source_path=str(source),
        sink_path=str(sink),
        param=validated_params,
        logger=logger,
        config_dict={},
    )
    success_count = len([item for item in results if item.get("result") == 0])
    copied_count = len([item for item in results if item.get("result") == 2])
    failed_count = len(results) - success_count - copied_count

    return {
        "success": True,
        "message": "operator execution completed",
        "data": {
            "operator_key": payload.operator_key,
            "operator_name": operator_meta.get("name"),
            "source_path": str(source),
            "sink_path": str(sink),
            "validated_params": validated_params,
            "summary": {
                "total_files": len(results),
                "success_files": success_count,
                "copied_files": copied_count,
                "failed_files": failed_count,
            },
            "items": results,
        },
    }
