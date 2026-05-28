# -*- coding: utf-8 -*-
"""CSV 转 JSON 算子"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any, Dict, List

from backend.operators_migrated.runtime import (
    build_process_file_info,
    copy_file,
    is_dir_empty,
    is_directory_ready,
    parse_operator_params,
    walk_files,
)


class ConvertCsvToJsonOperator:
    """将 CSV 文件逐行转为 JSON 数组文件。"""

    def process(
        self,
        operator_id: str,
        source_path: str,
        sink_path: str,
        param: Any,
        logger,
        config_dict: Dict[str, Any] | None = None,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            logger.warning('算子输入目录不可用: %s', source_path)
            return results

        params = parse_operator_params(param)
        encoding = str(params.get('encoding', 'utf-8'))

        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)

        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            if file_path.suffix.lower() != '.csv':
                output_path = sink_root / relative
                output_path.parent.mkdir(parents=True, exist_ok=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
                continue

            output_path = sink_root / relative.with_suffix('.json')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                rows = []
                with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        rows.append(dict(row))

                output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                logger.info('CSV 转换完成: %s -> %s (%d 行)', file_path.name, output_path.name, len(rows))
            except Exception as error:
                logger.error('转换 CSV 失败: %s, error=%s', file_path, error, exc_info=True)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results
