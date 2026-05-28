# -*- coding: utf-8 -*-
"""Agent Team status and task APIs."""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agents.request_store import create_request, load_requests
from backend.core.config import SYSTEM_API_LOCAL_ONLY

logger = logging.getLogger(__name__)
router = APIRouter()

ROOT_DIR = Path(__file__).resolve().parents[2]
WORKSPACE_DIR = ROOT_DIR / 'agents' / 'workspace'
STATUS_FILE = WORKSPACE_DIR / 'agent_team_status.json'
TASK_QUEUE_FILE = WORKSPACE_DIR / 'tasks' / 'task_queue.json'
TASK_PLAN_DIR = WORKSPACE_DIR / 'task_plans'


class GenericResponse(BaseModel):
    success: bool
    message: str
    data: Dict[str, Any] = Field(default_factory=dict)


class TaskListResponse(BaseModel):
    success: bool
    tasks: List[Dict[str, Any]] = Field(default_factory=list)


class RequestPayload(BaseModel):
    title: str
    description: str
    priority: int = 3
    acceptance_criteria: str = ''


def _get_client_host(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return ""


def _ensure_local_access(request: Request):
    if not SYSTEM_API_LOCAL_ONLY:
        return
    client_host = _get_client_host(request)
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="该接口仅允许本机访问")


def _load_json(path: Path, default: Any):
    if not path.exists():
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as error:
        logger.error('读取 JSON 失败: %s', error)
        return default


def _derive_status_from_tasks(tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        'running': False,
        'mode': 'unknown',
        'mode_reason': 'Agent Team 状态快照不存在，以下统计由任务队列推导。',
        'brain': {
            'agent': 'BrainAgent',
            'total_tasks': len(tasks),
            'pending_tasks': len([task for task in tasks if task.get('status') == 'pending']),
            'in_progress_tasks': len([task for task in tasks if task.get('status') == 'in_progress']),
            'ready_tasks': len([task for task in tasks if task.get('status') == 'ready']),
            'completed_tasks': len([task for task in tasks if task.get('status') == 'completed']),
        },
        'code': {
            'agent': 'CodeAgent',
            'current_task': None,
            'task_status': None,
        },
        'test': {
            'agent': 'TestAgent',
            'total_test_runs': 0,
            'total_tests': 0,
            'total_passed': 0,
            'pass_rate': 0,
        },
    }


def _load_status(tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    status = _load_json(STATUS_FILE, {})
    if isinstance(status, dict) and status:
        return status
    return _derive_status_from_tasks(tasks)


def _read_plan(task_id: int) -> Dict[str, Any]:
    plan_file = TASK_PLAN_DIR / f'task_{int(task_id):03d}.json'
    plan = _load_json(plan_file, {})
    return plan if isinstance(plan, dict) else {}


def _load_tasks() -> List[Dict[str, Any]]:
    tasks = _load_json(TASK_QUEUE_FILE, [])
    if not isinstance(tasks, list):
        return []

    normalized: List[Dict[str, Any]] = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        next_task = dict(task)
        details = next_task.get('details')
        next_task['details'] = details if isinstance(details, dict) else {}
        next_task['plan'] = _read_plan(int(next_task.get('id', 0) or 0))
        normalized.append(next_task)

    return normalized


def _load_request_items() -> List[Dict[str, Any]]:
    items = load_requests(WORKSPACE_DIR)
    return [item for item in items if isinstance(item, dict)]


@router.get('/status', response_model=GenericResponse)
async def get_agent_status(request: Request):
    _ensure_local_access(request)
    tasks = _load_tasks()
    status = _load_status(tasks)
    requests = _load_request_items()
    status['requests'] = {
        'total': len(requests),
        'pending': len([item for item in requests if item.get('status') == 'pending']),
        'queued': len([item for item in requests if item.get('status') == 'queued']),
        'ready': len([item for item in requests if item.get('status') == 'ready']),
        'completed': len([item for item in requests if item.get('status') == 'completed']),
        'failed': len([item for item in requests if item.get('status') == 'failed']),
    }
    return GenericResponse(success=True, message='ok', data=status)


@router.get('/tasks', response_model=TaskListResponse)
async def list_agent_tasks(request: Request):
    _ensure_local_access(request)
    return TaskListResponse(success=True, tasks=_load_tasks())


@router.get('/tasks/{task_id}', response_model=GenericResponse)
async def get_agent_task(task_id: int, request: Request):
    _ensure_local_access(request)
    tasks = _load_tasks()
    task = next((item for item in tasks if int(item.get('id', 0) or 0) == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail='任务不存在')
    return GenericResponse(success=True, message='ok', data=task)


@router.get('/requests', response_model=GenericResponse)
async def list_agent_requests(request: Request):
    _ensure_local_access(request)
    return GenericResponse(success=True, message='ok', data={'items': _load_request_items()})


@router.post('/requests', response_model=GenericResponse)
async def create_agent_request(payload: RequestPayload, request: Request):
    _ensure_local_access(request)
    request_item = create_request(
        WORKSPACE_DIR,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        acceptance_criteria=payload.acceptance_criteria,
    )
    return GenericResponse(success=True, message='需求已提交给 Agent Team', data=request_item)
