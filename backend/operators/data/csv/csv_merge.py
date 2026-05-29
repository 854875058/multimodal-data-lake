# -*- coding: utf-8 -*-
"""CSV 合并算子"""
from __future__ import annotations
import csv
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

class CsvMergeOperator:
    """合并多个 CSV 文件（要求表头一致）。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        encoding = str(params.get('encoding', 'utf-8'))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        csv_files = [f for f in walk_files(source_path) if f.suffix.lower() == '.csv']
        if not csv_files:
            logger.warning('未找到 CSV 文件')
            return results
        merged_rows = []
        header = None
        for csv_path in csv_files:
            try:
                with open(csv_path, 'r', encoding=encoding, errors='ignore') as f:
                    reader = csv.reader(f)
                    rows = list(reader)
                    if rows:
                        if header is None:
                            header = rows[0]
                        merged_rows.extend(rows[1:] if len(rows) > 1 and rows[0] == header else rows)
            except Exception as e:
                logger.error('读取 CSV 失败: %s', e)
        if header or merged_rows:
            output_path = sink_root / 'merged.csv'
            with open(output_path, 'w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                if header:
                    writer.writerow(header)
                writer.writerows(merged_rows)
            results.append({'file': 'merged.csv', 'rows': len(merged_rows), 'action': 'merged'})
            logger.info('CSV 合并完成: %d 行', len(merged_rows))
        return results
