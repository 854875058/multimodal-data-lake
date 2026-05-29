# -*- coding: utf-8 -*-
"""文件时间筛选算子"""
from __future__ import annotations
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import is_dir_empty, is_directory_ready, parse_operator_params, walk_files

class FileAgeFilterOperator:
    """按文件修改时间筛选文件。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        max_age_days = max(0, int(params.get('max_age_days', 30)))
        mode = str(params.get('mode', 'newer')).lower()
        cutoff = time.time() - max_age_days * 86400
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        kept = 0
        for file_path in walk_files(source_path):
            mtime = file_path.stat().st_mtime
            is_newer = mtime > cutoff
            should_keep = is_newer if mode == 'newer' else not is_newer
            if should_keep:
                relative = file_path.relative_to(source_root)
                output_path = sink_root / relative
                output_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(str(file_path), str(output_path))
                results.append({'file': file_path.name, 'action': 'kept', 'mtime': mtime})
                kept += 1
        logger.info('文件时间筛选: 保留 %d 个文件 (模式=%s, 天数=%d)', kept, mode, max_age_days)
        return results
