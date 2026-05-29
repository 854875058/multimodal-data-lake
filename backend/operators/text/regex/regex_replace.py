# -*- coding: utf-8 -*-
"""正则替换算子"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

class RegexReplaceOperator:
    """使用正则表达式批量替换文本内容。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        pattern = str(params.get('pattern', ''))
        replacement = str(params.get('replacement', ''))
        if not pattern:
            logger.warning('未指定正则表达式')
            return results
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        total_replaced = 0
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    new_content, count = re.subn(pattern, replacement, content)
                    output_path.write_text(new_content, encoding='utf-8')
                    total_replaced += count
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('正则替换失败: %s', e)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        logger.info('正则替换完成: 共替换 %d 处', total_replaced)
        return results
