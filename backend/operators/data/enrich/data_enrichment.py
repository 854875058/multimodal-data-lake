# -*- coding: utf-8 -*-
"""数据丰富算子"""

from __future__ import annotations
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, is_text_file, parse_operator_params, walk_files

class DataEnrichmentOperator:
    """为数据文件添加丰富元信息：处理时间、文件哈希、行数统计等。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        all_enriched = []
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                copy_file(str(file_path), str(output_path))
                stat = file_path.stat()
                enrichment = {
                    'file': file_path.name,
                    'relative_path': str(relative),
                    'size_bytes': stat.st_size,
                    'modified_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'processed_at': datetime.now().isoformat(),
                    'extension': file_path.suffix.lower(),
                    'operator': operator_id,
                }
                if is_text_file(str(file_path)):
                    content = file_path.read_text(encoding='utf-8', errors='ignore')
                    enrichment['char_count'] = len(content)
                    enrichment['line_count'] = len(content.splitlines())
                    enrichment['hash_md5'] = hashlib.md5(content.encode()).hexdigest()
                all_enriched.append(enrichment)
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
            except Exception as e:
                logger.error('丰富失败: %s', e)
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        report_path = sink_root / '_enrichment_report.json'
        report_path.write_text(json.dumps({'total': len(all_enriched), 'files': all_enriched}, ensure_ascii=False, indent=2), encoding='utf-8')
        return results
