# -*- coding: utf-8 -*-
"""文件拷贝算子"""
from __future__ import annotations
import shutil
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

class FileCopyOperator:
    """按条件筛选并拷贝文件。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        extensions = params.get('extensions', [])
        if isinstance(extensions, str):
            extensions = [e.strip() for e in extensions.split(',') if e.strip()]
        min_size_kb = max(0, int(params.get('min_size_kb', 0)))
        max_size_kb = max(0, int(params.get('max_size_kb', 0)))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            size_kb = file_path.stat().st_size / 1024
            if extensions and file_path.suffix.lower() not in extensions:
                continue
            if min_size_kb and size_kb < min_size_kb:
                continue
            if max_size_kb and size_kb > max_size_kb:
                continue
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
            except Exception as e:
                logger.error('拷贝失败: %s', e)
        return results
