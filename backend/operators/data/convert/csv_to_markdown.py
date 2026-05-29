# -*- coding: utf-8 -*-
"""CSV 转 Markdown 表格算子"""
from __future__ import annotations
import csv
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

def csv_to_markdown(rows: list, max_rows: int = 100) -> str:
    if not rows:
        return ''
    header = rows[0]
    lines = ['| ' + ' | '.join(str(c) for c in header) + ' |']
    lines.append('| ' + ' | '.join(['---'] * len(header)) + ' |')
    for row in rows[1:max_rows + 1]:
        padded = list(row) + [''] * (len(header) - len(row))
        lines.append('| ' + ' | '.join(str(c) for c in padded[:len(header)]) + ' |')
    if len(rows) > max_rows + 1:
        lines.append(f'\n*（共 {len(rows) - 1} 行，仅显示前 {max_rows} 行）*')
    return '\n'.join(lines)

class CsvToMarkdownOperator:
    """将 CSV 文件转换为 Markdown 表格。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        encoding = str(params.get('encoding', 'utf-8'))
        max_rows = max(1, int(params.get('max_rows', 100)))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative.with_suffix('.md')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if file_path.suffix.lower() == '.csv':
                    with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
                        rows = list(csv.reader(f))
                    md = csv_to_markdown(rows, max_rows)
                    output_path.write_text(md, encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(sink_root / relative))
                    results.append(build_process_file_info(operator_id, str(file_path), str(sink_root / relative), 2))
            except Exception as e:
                logger.error('CSV 转 Markdown 失败: %s', e)
        return results
