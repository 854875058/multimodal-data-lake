# -*- coding: utf-8 -*-
"""文本合并算子"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

class TextMergeOperator:
    """将多个文本文件合并为一个文件。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        separator = str(params.get('separator', '\n\n'))
        add_filename = bool(params.get('add_filename', True))
        output_name = str(params.get('output_name', 'merged.txt'))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        merged_parts = []
        for file_path in walk_files(source_path):
            try:
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    if add_filename:
                        merged_parts.append(f'[{file_path.name}]\n{content}')
                    else:
                        merged_parts.append(content)
                    # 拷贝原文件
                    relative = file_path.relative_to(source_root)
                    output_path = sink_root / relative
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
            except Exception as e:
                logger.error('合并读取失败: %s', e)
        if merged_parts:
            merged_path = sink_root / output_name
            merged_path.write_text(separator.join(merged_parts), encoding='utf-8')
            logger.info('合并完成: %d 个文件 -> %s', len(merged_parts), output_name)
        return results
