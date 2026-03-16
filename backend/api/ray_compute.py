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


def _get_ray_client():
    """获取 Ray 客户端连接"""
    try:
        from ray.job_submission import JobSubmissionClient
        from config import S3_CONFIG
        import os
        ray_url = os.getenv('RAY_DASHBOARD_URL', 'http://127.0.0.1:8265')
        return JobSubmissionClient(ray_url)
    except ImportError:
        logger.warning("Ray 未安装，使用模拟模式")
        return None
    except Exception as e:
        logger.warning(f"Ray 连接失败: {e}")
        return None


@router.get('/status')
async def get_ray_status():
    """获取 Ray 集群状态"""
    client = _get_ray_client()
    if not client:
        return {
            'connected': False,
            'mode': 'mock',
            'message': 'Ray 未连接，当前为模拟模式',
            'cluster': {
                'nodes': 0,
                'cpus_total': 0,
                'cpus_available': 0,
                'gpus_total': 0,
                'gpus_available': 0,
            }
        }

    try:
        import ray
        if not ray.is_initialized():
            ray.init(ignore_reinit_error=True)

        resources = ray.cluster_resources()
        available = ray.available_resources()

        return {
            'connected': True,
            'mode': 'live',
            'message': 'Ray 集群已连接',
            'cluster': {
                'nodes': int(resources.get('node:__internal_head__', 0)) + int(resources.get('CPU', 0) > 0),
                'cpus_total': resources.get('CPU', 0),
                'cpus_available': available.get('CPU', 0),
                'gpus_total': resources.get('GPU', 0),
                'gpus_available': available.get('GPU', 0),
                'memory_total_gb': round(resources.get('memory', 0) / (1024**3), 2),
                'object_store_gb': round(resources.get('object_store_memory', 0) / (1024**3), 2),
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
        # 模拟模式
        import uuid
        job_id = f"mock_{uuid.uuid4().hex[:8]}"
        return RayJobResponse(
            job_id=job_id,
            name=job.name,
            status='PENDING',
            entrypoint=job.entrypoint,
            created_at=datetime.now().isoformat()
        )

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
        return {'jobs': [], 'mode': 'mock'}

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
        return {'job_id': job_id, 'status': 'UNKNOWN', 'mode': 'mock'}

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
        return {'message': f'模拟模式：任务 {job_id} 已停止'}

    try:
        client.stop_job(job_id)
        return {'message': f'任务 {job_id} 已停止'}
    except Exception as e:
        logger.error(f"停止 Ray 任务失败: {e}")
        raise HTTPException(status_code=500, detail=f'停止任务失败: {e}')
