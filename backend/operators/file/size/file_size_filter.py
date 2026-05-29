# -*- coding: utf-8 -*-
"""文件大小筛选算子"""
from __future__ import annotations
import shutil
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import is_dir_empty, is_directory_ready, parse_operator_params, walk_files

class FileSizeFilterOperator:
    """按文件大小筛选文件。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        min_kb = max(0, int(params.get('min_kb', 0)))
        max_kb = max(0, int(params.get('max_kb', 0)))
        mode = str(params.get('mode', 'between')).lower()
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        kept = 0
        for file_path in walk_files(source_path):
            size_kb = file_path.stat().st_size / 1024
            if mode == 'between' and (size_kb < min_kb or (max_kb > 0 and size_kb > max_kb)):
                continue
            if mode == 'smaller' and size_kb >= min_kb:
                continue
            if mode == 'larger' and size_kb <= min_kb:
                continue
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(file_path), str(output_path))
            results.append({'file': file_path.name, 'size_kb': round(size_kb, 2), 'action': 'kept'})
            kept += 1
        logger.info('文件大小筛选: 保留 %d 个文件', kept)
        return results
