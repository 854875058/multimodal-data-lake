# -*- coding: utf-8 -*-
"""编码转换算子"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

class EncodingConvertOperator:
    """批量转换文本文件编码。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        source_encoding = str(params.get('source_encoding', 'auto'))
        target_encoding = str(params.get('target_encoding', 'utf-8'))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if is_text_file(str(file_path)):
                    raw = file_path.read_bytes()
                    if source_encoding == 'auto':
                        for enc in ('utf-8', 'gbk', 'gb2312', 'latin-1'):
                            try:
                                text = raw.decode(enc)
                                break
                            except UnicodeDecodeError:
                                continue
                        else:
                            text = raw.decode('utf-8', errors='ignore')
                    else:
                        text = raw.decode(source_encoding, errors='ignore')
                    output_path.write_text(text, encoding=target_encoding)
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('编码转换失败: %s', e)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
