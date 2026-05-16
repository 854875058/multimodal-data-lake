# -*- coding: utf-8 -*-
"""Registry for migrated operators that now belong to this repository."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from backend.operators_migrated.text.clean.clean_texts_by_regex import CleanTextsByRegexOperator

ROOT_DIR = Path(__file__).resolve().parents[2]


def _repo_rel(path: str) -> str:
    return str((ROOT_DIR / path).resolve().relative_to(ROOT_DIR.resolve())).replace('\\', '/')


MIGRATED_OPERATORS: List[Dict[str, Any]] = [
    {
        'key': 'clean_texts_by_regex',
        'name': '文本正则脱敏',
        'modality': '文本',
        'category': 'clean',
        'status': 'active',
        'migration_status': '已迁移并可执行',
        'runtime': 'CPU',
        'source_code_path': _repo_rel('backend/operators_migrated/text/clean/clean_texts_by_regex.py'),
        'description': '迁移自 dataset_processing_py 的文本清洗算子，当前仓已内置规则脱敏能力。',
        'params_schema': {
            'chunk_size': {'type': 'integer', 'default': 500, 'description': '文本切块长度'},
            'use_ai_detection': {'type': 'boolean', 'default': False, 'description': '迁移版当前固定回退为规则模式'},
        },
    },
    {
        'key': 'normalize_ppt_to_markdown',
        'name': 'PPT 转 Markdown',
        'modality': '文本',
        'category': 'format',
        'status': 'staged',
        'migration_status': '源码已迁入，待补模型与文档转换依赖',
        'runtime': 'CPU / LLM',
        'source_code_path': _repo_rel('backend/operators_migrated/staged/text/format/normalize_ppt_to_markdown.py'),
        'description': '迁移了原始算子源码，后续补齐 LibreOffice 与多模态模型调用后可启用。',
        'params_schema': {},
    },
    {
        'key': 'enhance_video_privacy_blur_operator',
        'name': '视频隐私脱敏',
        'modality': '视频',
        'category': 'enhance',
        'status': 'staged',
        'migration_status': '源码已迁入，待补 OCR 与视频运行依赖',
        'runtime': 'GPU',
        'source_code_path': _repo_rel('backend/operators_migrated/staged/video/enhance/enhance_video_privacy_blur_operator.py'),
        'description': '迁移了视频隐私模糊源码，后续接入 OCR 服务与视频处理环境后启用。',
        'params_schema': {},
    },
    {
        'key': 'enhance_video_redundancy_operator',
        'name': '视频冗余过滤',
        'modality': '视频',
        'category': 'enhance',
        'status': 'staged',
        'migration_status': '源码已迁入，待补 OCR / ffmpeg / OpenCV 运行环境',
        'runtime': 'GPU',
        'source_code_path': _repo_rel('backend/operators_migrated/staged/video/enhance/enhance_video_redundancy_operator.py'),
        'description': '迁移了视频冗余过滤源码，后续补齐运行依赖后纳入执行链路。',
        'params_schema': {},
    },
]


EXECUTABLE_OPERATORS = {
    'clean_texts_by_regex': CleanTextsByRegexOperator,
}


def list_migrated_operators() -> List[Dict[str, Any]]:
    return [dict(item) for item in MIGRATED_OPERATORS]


def get_operator_or_none(operator_key: str) -> Dict[str, Any] | None:
    return next((dict(item) for item in MIGRATED_OPERATORS if item['key'] == operator_key), None)


def build_operator_instance(operator_key: str):
    operator_cls = EXECUTABLE_OPERATORS.get(operator_key)
    return operator_cls() if operator_cls else None
