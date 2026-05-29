# -*- coding: utf-8 -*-
"""JSON 转换算子"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

class JsonTransformOperator:
    """JSON 数据转换：扁平化、筛选字段、格式化。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        mode = str(params.get('mode', 'format')).lower()  # format / flatten / filter
        fields = params.get('fields', [])  # filter mode 使用
        indent = int(params.get('indent', 2))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if file_path.suffix.lower() == '.json':
                    data = json.loads(file_path.read_text(encoding='utf-8', errors='ignore'))
                    if mode == 'flatten':
                        data = self._flatten(data)
                    elif mode == 'filter' and fields and isinstance(data, list):
                        data = [{k: item.get(k) for k in fields if k in item} for item in data]
                    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(output_path))
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 2))
            except Exception as e:
                logger.error('JSON 转换失败: %s', e)
                copy_file(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 1))
        return results

    @staticmethod
    def _flatten(obj, parent_key='', sep='.'):
        items = {}
        if isinstance(obj, dict):
            for k, v in obj.items():
                new_key = f"{parent_key}{sep}{k}" if parent_key else k
                items.update(JsonTransformOperator._flatten(v, new_key, sep))
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                new_key = f"{parent_key}[{i}]"
                items.update(JsonTransformOperator._flatten(v, new_key, sep))
        else:
            items[parent_key] = obj
        return items
