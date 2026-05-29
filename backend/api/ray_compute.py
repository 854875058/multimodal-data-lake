# -*- coding: utf-8 -*-
"""Ray 计算编排 API"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Ray 集群状态缓存
_ray_status_cache: Dict[str, Any] = {}


class RayJobSubmit(BaseModel):
    """Ray 任务提交模型"""
    name: str
    entrypoint: str
    runtime_env: Optional[Dict[str, Any]] = None
    num_cpus: Optional[float] = 1.0
    num_gpus: Optional[float] = 0.0


class RayJobResponse(BaseModel):
    job_id: str
    name: str
    status: str
    entrypoint: str
    created_at: str


def _get_ray_dashboard_url() -> str:
    """获取 Ray Dashboard URL"""
    import os
    try:
        from backend.api.platform import _get_platform_settings
        url = (_get_platform_settings() or {}).get('ray_dashboard_url') or ''
        if url:
            return url
    except Exception:
        pass
    return os.getenv('RAY_DASHBOARD_URL', 'http://192.168.20.2:8265')


def _get_ray_client():
    """获取 Ray 客户端连接（优先 ray SDK，回退到 requests 直连 Dashboard API）"""
    ray_url = _get_ray_dashboard_url()
    try:
        from ray.job_submission import JobSubmissionClient
        return JobSubmissionClient(ray_url)
    except Exception:
        pass
    # 回退：返回一个基于 requests 的简易客户端
    try:
        import requests as req
        resp = req.get(f'{ray_url}/api/cluster_status', timeout=3)
        if resp.status_code == 200:
            return _RayHttpClient(ray_url)
    except Exception as e:
        logger.warning("Ray 连接失败 (%s): %s", ray_url, e)
    return None


class _RayHttpClient:
    """基于 HTTP 的简易 Ray 客户端，不依赖 ray 包"""

    def __init__(self, dashboard_url: str):
        self._url = dashboard_url.rstrip('/')

    def _api(self, method: str, path: str, **kwargs):
        import requests as req
        resp = req.request(method, f'{self._url}{path}', timeout=kwargs.pop('timeout', 10), **kwargs)
        resp.raise_for_status()
        return resp.json()

    def list_jobs(self):
        data = self._api('GET', '/api/jobs/')
        return data.get('data', []) if isinstance(data, dict) else data

    def submit_job(self, entrypoint, runtime_env=None, **kwargs):
        payload = {'entrypoint': entrypoint}
        if runtime_env:
            payload['runtime_env'] = runtime_env
        payload.update(kwargs)
        return self._api('POST', '/api/jobs/', json=payload, timeout=30)

    def get_job_info(self, job_id):
        return self._api('GET', f'/api/jobs/{job_id}')

    def stop_job(self, job_id):
        return self._api('POST', f'/api/jobs/{job_id}/stop')

    def get_job_logs(self, job_id):
        try:
            return self._api('GET', f'/api/jobs/{job_id}/logs')
        except Exception:
            return {'logs': ''}


@router.get('/status')
async def get_ray_status():
    """获取 Ray 集群状态（通过 Dashboard API）"""
    client = _get_ray_client()
    if not client:
        return {
            'connected': False,
            'mode': 'error',
            'message': 'Ray 未连接，当前无法提供计算编排服务',
            'cluster': {
                'nodes': 0,
                'cpus_total': 0,
                'cpus_available': 0,
                'gpus_total': 0,
                'gpus_available': 0,
            }
        }

    try:
        import requests as req
        import os
        ray_url = ''
        try:
            from backend.api.platform import _get_platform_settings
            ray_url = (_get_platform_settings() or {}).get('ray_dashboard_url') or ''
        except Exception:
            ray_url = ''
        if not ray_url:
            ray_url = os.getenv('RAY_DASHBOARD_URL', 'http://127.0.0.1:8265')

        resp = req.get(f'{ray_url}/api/cluster_status', timeout=5)
        data = resp.json()
        cluster_data = data.get('data', {})
        status_data = cluster_data.get('clusterStatus', {})
        load_report = status_data.get('loadMetricsReport', {})
        usage = load_report.get('usage', {})

        cpus_total = usage.get('CPU', [0, 0])[1] if usage.get('CPU') else 0
        cpus_used = usage.get('CPU', [0, 0])[0] if usage.get('CPU') else 0
        gpus_total = usage.get('GPU', [0, 0])[1] if usage.get('GPU') else 0
        gpus_used = usage.get('GPU', [0, 0])[0] if usage.get('GPU') else 0
        mem_bytes = usage.get('memory', [0, 0])[1] if usage.get('memory') else 0
        obj_bytes = usage.get('objectStoreMemory', [0, 0])[1] if usage.get('objectStoreMemory') else 0

        active_nodes = status_data.get('autoscalerReport', {}).get('activeNodes', {})
        node_count = len(active_nodes) if active_nodes else 0

        return {
            'connected': True,
            'mode': 'live',
            'message': 'Ray 集群已连接',
            'cluster': {
                'nodes': node_count,
                'cpus_total': int(cpus_total),
                'cpus_available': int(cpus_total - cpus_used),
                'gpus_total': int(gpus_total),
                'gpus_available': int(gpus_total - gpus_used),
                'memory_total_gb': round(mem_bytes / (1024**3), 2) if mem_bytes else 0,
                'object_store_gb': round(obj_bytes / (1024**3), 2) if obj_bytes else 0,
            }
        }
    except Exception as e:
        logger.error(f"获取 Ray 状态失败: {e}")
        return {
            'connected': False,
            'mode': 'error',
            'message': str(e),
            'cluster': {}
        }


@router.post('/jobs', response_model=RayJobResponse)
async def submit_ray_job(job: RayJobSubmit):
    """提交 Ray 任务"""
    client = _get_ray_client()

    if not client:
        raise HTTPException(status_code=503, detail='Ray 未连接，无法提交任务')

    try:
        runtime_env = job.runtime_env or {}
        job_id = client.submit_job(
            entrypoint=job.entrypoint,
            runtime_env=runtime_env,
        )
        return RayJobResponse(
            job_id=job_id,
            name=job.name,
            status='PENDING',
            entrypoint=job.entrypoint,
            created_at=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"提交 Ray 任务失败: {e}")
        raise HTTPException(status_code=500, detail=f'提交任务失败: {e}')


@router.get('/jobs')
async def list_ray_jobs():
    """获取 Ray 任务列表"""
    client = _get_ray_client()

    if not client:
        raise HTTPException(status_code=503, detail='Ray 未连接，无法读取任务列表')

    try:
        jobs = client.list_jobs()
        return {
            'jobs': [
                {
                    'job_id': j.submission_id,
                    'status': j.status.value if hasattr(j.status, 'value') else str(j.status),
                    'entrypoint': j.entrypoint,
                    'start_time': str(j.start_time) if j.start_time else None,
                    'end_time': str(j.end_time) if j.end_time else None,
                }
                for j in jobs
            ],
            'mode': 'live'
        }
    except Exception as e:
        logger.error(f"获取 Ray 任务列表失败: {e}")
        return {'jobs': [], 'mode': 'error', 'error': str(e)}


@router.get('/jobs/{job_id}')
async def get_ray_job(job_id: str):
    """获取 Ray 任务详情"""
    client = _get_ray_client()

    if not client:
        raise HTTPException(status_code=503, detail='Ray 未连接，无法读取任务详情')

    try:
        status = client.get_job_status(job_id)
        logs = client.get_job_logs(job_id)
        return {
            'job_id': job_id,
            'status': status.value if hasattr(status, 'value') else str(status),
            'logs': logs,
            'mode': 'live'
        }
    except Exception as e:
        logger.error(f"获取 Ray 任务详情失败: {e}")
        raise HTTPException(status_code=404, detail=f'任务不存在: {job_id}')


@router.delete('/jobs/{job_id}')
async def stop_ray_job(job_id: str):
    """停止 Ray 任务"""
    client = _get_ray_client()

    if not client:
        raise HTTPException(status_code=503, detail='Ray 未连接，无法停止任务')

    try:
        client.stop_job(job_id)
        return {'message': f'任务 {job_id} 已停止'}
    except Exception as e:
        logger.error(f"停止 Ray 任务失败: {e}")
        raise HTTPException(status_code=500, detail=f'停止任务失败: {e}')
