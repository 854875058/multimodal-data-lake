# -*- coding: utf-8 -*-
"""文件校验算子"""

from __future__ import annotations
import hashlib
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

class FileValidationOperator:
    """校验文件完整性：计算哈希值、检查文件大小、检测编码。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        algorithm = str(params.get('algorithm', 'md5')).lower()
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        import json
        all_reports = []
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            try:
                data = file_path.read_bytes()
                file_hash = hashlib.new(algorithm, data).hexdigest()
                report = {
                    'file': file_path.name,
                    'path': str(relative),
                    'size_bytes': len(data),
                    'hash_algorithm': algorithm,
                    'hash': file_hash,
                    'extension': file_path.suffix.lower(),
                }
                # 检测编码
                for enc in ('utf-8', 'gbk', 'latin-1'):
                    try:
                        data.decode(enc)
                        report['encoding'] = enc
                        break
                    except UnicodeDecodeError:
                        continue
                all_reports.append(report)
                # 拷贝文件
                output_path = sink_root / relative
                output_path.parent.mkdir(parents=True, exist_ok=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
            except Exception as e:
                logger.error('校验失败: %s', e)
        # 写入汇总报告
        report_path = sink_root / '_validation_report.json'
        report_path.write_text(json.dumps({'total': len(all_reports), 'files': all_reports}, ensure_ascii=False, indent=2), encoding='utf-8')
        return results
