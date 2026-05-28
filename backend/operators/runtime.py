# -*- coding: utf-8 -*-
"""Shared runtime helpers for migrated operators."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, Iterable

TEXT_EXTENSIONS = {
    '.txt', '.md', '.markdown', '.csv', '.json', '.jsonl', '.log',
    '.py', '.js', '.ts', '.java', '.go', '.html', '.xml', '.yaml', '.yml',
}


def is_directory_ready(path: str) -> bool:
    target = Path(path)
    return target.exists() and target.is_dir()


def is_dir_empty(path: str) -> bool:
    return not any(Path(path).iterdir())


def is_text_file(path: str) -> bool:
    return Path(path).suffix.lower() in TEXT_EXTENSIONS


def ensure_parent(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)


def copy_file(src: str, dst: str) -> None:
    ensure_parent(dst)
    shutil.copy2(src, dst)


def parse_operator_params(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict):
        return dict(payload)
    if isinstance(payload, str) and payload.strip():
        try:
            data = json.loads(payload)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            return {}
    return {}


def build_process_file_info(operator_id: str, input_file: str, output_file: str, result: int) -> Dict[str, Any]:
    output_path = Path(output_file)
    input_path = Path(input_file)
    size = output_path.stat().st_size if output_path.exists() else input_path.stat().st_size
    return {
        'file_name': output_path.name,
        'originFileName': input_path.name,
        'id': operator_id,
        'size': size,
        'result': result,
        'input_path': str(input_path),
        'output_path': str(output_path),
    }


def walk_files(root: str) -> Iterable[Path]:
    for current_root, _, files in os.walk(root):
        for name in files:
            yield Path(current_root) / name

