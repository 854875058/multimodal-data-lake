# -*- coding: utf-8 -*-
"""文件压缩算子"""

from __future__ import annotations
import gzip
import zipfile
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

class FileCompressionOperator:
    """压缩文件：支持 gzip 和 zip 格式。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        fmt = str(params.get('format', 'gzip')).lower()
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            try:
                if fmt == 'gzip':
                    output_path = sink_root / (str(relative) + '.gz')
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(file_path, 'rb') as f_in, gzip.open(output_path, 'wb') as f_out:
                        f_out.write(f_in.read())
                elif fmt == 'zip':
                    output_path = sink_root / (relative.stem + '.zip')
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                        zf.write(file_path, relative.name)
                else:
                    output_path = sink_root / relative
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
            except Exception as e:
                logger.error('压缩失败: %s', e)
                output_path = sink_root / relative
                output_path.parent.mkdir(parents=True, exist_ok=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
