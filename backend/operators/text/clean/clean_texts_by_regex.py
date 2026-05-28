# -*- coding: utf-8 -*-
"""Migrated from dataset_processing_py: text clean operator with regex-first runtime."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List

from backend.operators.runtime import (
    build_process_file_info,
    copy_file,
    is_dir_empty,
    is_directory_ready,
    is_text_file,
    parse_operator_params,
    walk_files,
)


class CleanTextsByRegexOperator:
    """Migrated privacy cleaning operator.

    This version keeps the core local cleaning capability in-repo.
    AI-assisted privacy detection from the original codebase is intentionally
    disabled until the current repository gains an internal model gateway.
    """

    PRIVACY_PATTERNS = {
        'phone': r'(?<!\d)1[3-9]\d{9}(?!\d)',
        'email': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
        'ip': r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b',
        'landline': r'0\d{2,3}-\d{7,8}',
        'id_card': r'(?<!\d)(?:\d{18}|\d{17}[\dXx])(?!\d)',
        'postcode': r'(?<!\d)\d{6}(?!\d)',
    }

    def process(
        self,
        operator_id: str,
        source_path: str,
        sink_path: str,
        param: Any,
        logger,
        config_dict: Dict[str, Any] | None = None,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            logger.warning('算子输入目录不可用: %s', source_path)
            return results

        params = parse_operator_params(param)
        chunk_size = max(100, int(params.get('chunk_size', 500)))
        use_ai_detection = bool(params.get('use_ai_detection', False))
        if use_ai_detection:
            logger.info('迁移版 clean_texts_by_regex 暂未启用 AI 识别，自动回退到纯规则模式')

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    cleaned = self._clean_text(content, chunk_size=chunk_size)
                    output_path.write_text(cleaned, encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as error:  # pragma: no cover - defensive file processing
                logger.error('清洗文件失败: %s, error=%s', file_path, error, exc_info=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results

    def _clean_text(self, text: str, chunk_size: int = 500) -> str:
        chunks = self._split_text(text, chunk_size)
        return ''.join(self._replace_privacy(chunk) for chunk in chunks)

    @staticmethod
    def _split_text(text: str, chunk_size: int) -> List[str]:
        if not text:
            return []
        parts = re.split(r'([\n])', text)
        chunks: List[str] = []
        current = ''
        for item in parts:
            if len(current) + len(item) > chunk_size and current:
                chunks.append(current)
                current = item
            else:
                current += item
        if current:
            chunks.append(current)
        return chunks

    def _replace_privacy(self, chunk: str) -> str:
        cleaned = chunk
        for name, pattern in self.PRIVACY_PATTERNS.items():
            matches = sorted(set(re.findall(pattern, cleaned)), key=len, reverse=True)
            for value in matches:
                cleaned = cleaned.replace(value, self._mask_value(name, value))
        return cleaned

    @staticmethod
    def _mask_value(kind: str, value: str) -> str:
        if kind == 'phone':
            return value[:3] + '****' + value[7:]
        if kind == 'email':
            if '@' not in value:
                return '*' * len(value)
            user, domain = value.split('@', 1)
            if len(user) <= 2:
                return user[:1] + '*@' + domain
            return user[:2] + '*' + user[-1:] + '@' + domain
        if kind == 'ip':
            return '*.*.*.*'
        if kind == 'landline':
            if '-' not in value:
                return '*' * len(value)
            area, number = value.split('-', 1)
            return area + '-' + ('*' * len(number))
        if kind == 'id_card':
            return value[:6] + '********' + value[-4:]
        if kind == 'postcode':
            return '******'
        return '*' * len(value)
