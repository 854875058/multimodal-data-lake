# -*- coding: utf-8 -*-
"""文件分割算子"""

from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

class FileSplitterOperator:
    """将大文件按行数或大小分割为多个小文件。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        max_lines = max(100, int(params.get('max_lines', 10000)))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            try:
                if is_text_file(str(file_path)):
                    lines = file_path.read_text(encoding='utf-8', errors='ignore').splitlines(keepends=True)
                    part_idx = 0
                    for start in range(0, len(lines), max_lines):
                        chunk = lines[start:start + max_lines]
                        part_path = sink_root / relative.parent / f"{relative.stem}_part{part_idx:04d}{relative.suffix}"
                        part_path.parent.mkdir(parents=True, exist_ok=True)
                        part_path.write_text(''.join(chunk), encoding='utf-8')
                        results.append(build_process_file_info(operator_id, str(file_path), str(part_path), 0))
                        part_idx += 1
                    logger.info('文件 %s 分割为 %d 部分', file_path.name, part_idx)
                else:
                    output_path = sink_root / relative
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('分割失败: %s', e)
        return results
