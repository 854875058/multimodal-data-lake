# -*- coding: utf-8 -*-
"""语言检测算子"""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

def detect_language(text: str) -> str:
    if not text.strip():
        return 'unknown'
    chinese = sum(1 for c in text if '一' <= c <= '鿿')
    total = len(text.replace(' ', '').replace('\n', ''))
    if total == 0:
        return 'unknown'
    ratio = chinese / total
    if ratio > 0.3:
        return 'zh'
    if ratio > 0.1:
        return 'mixed'
    ascii_count = sum(1 for c in text if ord(c) < 128)
    if ascii_count / max(total, 1) > 0.8:
        return 'en'
    return 'other'

class LanguageDetectionOperator:
    """检测文本文件的语言（中文/英文/混合/其他）。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative.with_suffix('.lang.json')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    lang = detect_language(content)
                    import json
                    output_path.write_text(json.dumps({'file': file_path.name, 'language': lang, 'char_count': len(content)}, ensure_ascii=False, indent=2), encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('语言检测失败: %s', e)
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
