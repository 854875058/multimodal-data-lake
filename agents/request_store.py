# -*- coding: utf-8 -*-
"""Persistence helpers for Agent Team user requests."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

REQUEST_FILE_NAME = 'user_requests.json'


def _timestamp() -> str:
    return datetime.now().isoformat()


def _request_file(workspace_dir: Path) -> Path:
    workspace_dir.mkdir(parents=True, exist_ok=True)
    return workspace_dir / REQUEST_FILE_NAME


def load_requests(workspace_dir: Path) -> List[Dict[str, Any]]:
    path = _request_file(workspace_dir)
    if not path.exists():
        return []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_requests(workspace_dir: Path, requests: List[Dict[str, Any]]):
    path = _request_file(workspace_dir)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(requests, f, ensure_ascii=False, indent=2)


def create_request(
    workspace_dir: Path,
    title: str,
    description: str,
    priority: int = 3,
    acceptance_criteria: str = '',
) -> Dict[str, Any]:
    requests = load_requests(workspace_dir)
    request = {
        'id': len(requests) + 1,
        'title': str(title or '').strip(),
        'description': str(description or '').strip(),
        'acceptance_criteria': str(acceptance_criteria or '').strip(),
        'priority': max(1, min(int(priority or 3), 5)),
        'status': 'pending',
        'task_id': None,
        'created_at': _timestamp(),
        'updated_at': _timestamp(),
        'result_message': '',
    }
    requests.append(request)
    save_requests(workspace_dir, requests)
    return request


def update_request(workspace_dir: Path, request_id: int, **changes) -> Optional[Dict[str, Any]]:
    requests = load_requests(workspace_dir)
    for request in requests:
        if int(request.get('id', 0) or 0) == int(request_id):
            request.update(changes)
            request['updated_at'] = _timestamp()
            save_requests(workspace_dir, requests)
            return request
    return None
