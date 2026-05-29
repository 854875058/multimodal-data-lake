# -*- coding: utf-8 -*-
"""YAML 转 JSON 算子"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, copy_file, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

class YamlToJsonOperator:
    """将 YAML 文件转换为 JSON 格式。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path) or is_dir_empty(source_path):
            return results
        params = parse_operator_params(param)
        indent = int(params.get('indent', 2))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        try:
            import yaml
        except ImportError:
            logger.error('PyYAML 未安装')
            return results
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative.with_suffix('.json')
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                if file_path.suffix.lower() in ('.yaml', '.yml'):
                    data = yaml.safe_load(file_path.read_text(encoding='utf-8', errors='ignore'))
                    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding='utf-8')
                    results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
                else:
                    copy_file(str(file_path), str(sink_root / relative))
                    results.append(build_process_file_info(operator_id, str(file_path), str(sink_root / relative), 2))
            except Exception as e:
                logger.error('YAML 转换失败: %s', e)
        return results
