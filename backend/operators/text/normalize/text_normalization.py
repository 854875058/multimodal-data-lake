# -*- coding: utf-8 -*-
"""文本标准化算子"""

from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

class TextNormalizationOperator:
    """标准化文本：去除多余空白、统一换行符、去除特殊字符。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        remove_extra_spaces = bool(params.get('remove_extra_spaces', True))
        normalize_newlines = bool(params.get('normalize_newlines', True))
        remove_special_chars = bool(params.get('remove_special_chars', False))
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
                    if normalize_newlines:
                        content = content.replace('\r\n', '\n').replace('\r', '\n')
                    if remove_extra_spaces:
                        content = re.sub(r'[^\S\n]+', ' ', content)
                        content = re.sub(r'\n{3,}', '\n\n', content)
                    if remove_special_chars:
                        content = re.sub(r'[^\w\s\n一-鿿.,!?;:\'"-]', '', content)
                    output_path.write_text(content.strip(), encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('标准化失败: %s', e)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
