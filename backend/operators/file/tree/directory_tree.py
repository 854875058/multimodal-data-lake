# -*- coding: utf-8 -*-
"""目录树生成算子"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List
from backend.operators.runtime import build_process_file_info, is_dir_empty, is_directory_ready, parse_operator_params, walk_files

def build_tree(root: Path, max_depth: int = 3, current_depth: int = 0) -> dict:
    if current_depth >= max_depth:
        return {'name': root.name, 'type': 'directory', 'truncated': True}
    items = []
    try:
        for child in sorted(root.iterdir()):
            if child.is_dir() and not child.name.startswith('.'):
                items.append(build_tree(child, max_depth, current_depth + 1))
            elif child.is_file():
                items.append({'name': child.name, 'type': 'file', 'size': child.stat().st_size})
    except PermissionError:
        pass
    return {'name': root.name, 'type': 'directory', 'children': items}

class DirectoryTreeOperator:
    """生成目录树结构的 JSON 报告。"""
    def process(self, operator_id, source_path, sink_path, param, logger, config_dict=None):
        results = []
        if not is_directory_ready(source_path):
            return results
        params = parse_operator_params(param)
        max_depth = max(1, min(10, int(params.get('max_depth', 3))))
        source_root = Path(source_path)
        sink_root = Path(sink_path)
        sink_root.mkdir(parents=True, exist_ok=True)
        tree = build_tree(source_root, max_depth)
        report_path = sink_root / '_directory_tree.json'
        report_path.write_text(json.dumps(tree, ensure_ascii=False, indent=2), encoding='utf-8')
        # 拷贝所有文件
        for file_path in walk_files(source_path):
            relative = file_path.relative_to(source_root)
            output_path = sink_root / relative
            output_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                import shutil
                shutil.copy2(str(file_path), str(output_path))
                results.append(build_process_file_info(operator_id, str(file_path), str(output_path), 0))
            except Exception:
                pass
        return results
