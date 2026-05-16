# -*- coding: utf-8 -*-
"""Migrated operator APIs."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend.operators_migrated.registry import (
    build_operator_instance,
    get_operator_or_none,
    list_migrated_operators,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class OperatorExecutePayload(BaseModel):
    operator_key: str
    source_path: str
    sink_path: str
    params: Dict[str, Any] = Field(default_factory=dict)

    @field_validator('operator_key', 'source_path', 'sink_path', mode='before')
    @classmethod
    def normalize_string(cls, value):
        return str(value or '').strip()


@router.get('/catalog')
async def get_operator_catalog():
    operators = list_migrated_operators()
    active_count = len([item for item in operators if item['status'] == 'active'])
    staged_count = len([item for item in operators if item['status'] == 'staged'])
    return {
        'success': True,
        'snapshot_date': '2026-05-14',
        'summary': {
            'total': len(operators),
            'active': active_count,
            'staged': staged_count,
        },
        'operators': operators,
    }


@router.post('/execute')
async def execute_operator(payload: OperatorExecutePayload):
    operator_meta = get_operator_or_none(payload.operator_key)
    if not operator_meta:
        raise HTTPException(status_code=404, detail='算子不存在')

    if operator_meta['status'] != 'active':
        raise HTTPException(status_code=409, detail='该算子源码已迁移，但当前尚未启用执行')

    source = Path(payload.source_path).expanduser()
    sink = Path(payload.sink_path).expanduser()
    if not source.exists() or not source.is_dir():
        raise HTTPException(status_code=400, detail='source_path 必须是已存在的目录')
    sink.mkdir(parents=True, exist_ok=True)

    operator = build_operator_instance(payload.operator_key)
    if operator is None:
        raise HTTPException(status_code=500, detail='算子实例构建失败')

    results = operator.process(
        operator_id=payload.operator_key,
        source_path=str(source),
        sink_path=str(sink),
        param=payload.params,
        logger=logger,
        config_dict={},
    )
    success_count = len([item for item in results if item.get('result') == 0])
    copied_count = len([item for item in results if item.get('result') == 2])
    failed_count = len(results) - success_count - copied_count

    return {
        'success': True,
        'message': '算子执行完成',
        'data': {
            'operator_key': payload.operator_key,
            'source_path': str(source),
            'sink_path': str(sink),
            'summary': {
                'total_files': len(results),
                'success_files': success_count,
                'copied_files': copied_count,
                'failed_files': failed_count,
            },
            'items': results,
        },
    }
