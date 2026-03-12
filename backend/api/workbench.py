# -*- coding: utf-8 -*-
"""Ingestion workbench API."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from database import get_ingestion_job
from ingestion_workbench import (
    build_vector_indices,
    cancel_ingestion_job,
    get_index_status,
    get_workbench_settings,
    list_recent_jobs,
    list_source_objects,
    save_workbench_settings,
    start_ingestion_job,
    test_source_connection,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class WorkbenchSettingsPayload(BaseModel):
    source_type: str = 's3'
    endpoint_url: str = ''
    access_key_id: str = ''
    secret_access_key: str = ''
    bucket_name: str = ''
    prefix: str = ''
    sftp_host: str = ''
    sftp_port: int = 22
    sftp_user: str = ''
    sftp_password: str = ''
    sftp_path: str = '/tmp'
    scan_limit: int = 200
    max_files: int = 100
    overwrite_existing: bool = False
    index_strategy: str = 'auto'
    index_type: str = 'IVF_PQ'
    build_text_index: bool = True
    build_image_index: bool = True
    num_partitions: Optional[int] = None
    num_sub_vectors: Optional[int] = None
    selected_keys: List[str] = Field(default_factory=list)

    @field_validator('num_partitions', 'num_sub_vectors', mode='before')
    @classmethod
    def empty_string_to_none(cls, value):
        if value in ('', None):
            return None
        return value

    @field_validator('sftp_port', mode='before')
    @classmethod
    def normalize_sftp_port(cls, value):
        if value in ('', None):
            return 22
        return value

    @field_validator('source_type', mode='before')
    @classmethod
    def normalize_source_type(cls, value):
        normalized = str(value or 's3').strip().lower()
        return normalized if normalized in {'s3', 'sftp'} else 's3'

    @field_validator('selected_keys', mode='before')
    @classmethod
    def normalize_selected_keys(cls, value):
        if value in (None, ''):
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        return []


class JobStartResponse(BaseModel):
    success: bool
    message: str
    job: Dict[str, Any]


class GenericResponse(BaseModel):
    success: bool
    message: str
    data: Dict[str, Any] = Field(default_factory=dict)


class JobListResponse(BaseModel):
    success: bool
    jobs: List[Dict[str, Any]]


@router.get('/settings', response_model=GenericResponse)
async def get_settings():
    try:
        return GenericResponse(success=True, message='ok', data=get_workbench_settings())
    except Exception as error:
        logger.error(f'读取工作台配置失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail='读取工作台配置失败')


@router.post('/settings', response_model=GenericResponse)
async def save_settings(payload: WorkbenchSettingsPayload):
    try:
        data = save_workbench_settings(payload.model_dump())
        return GenericResponse(success=True, message='配置已保存', data=data)
    except Exception as error:
        logger.error(f'保存工作台配置失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail='保存工作台配置失败')


@router.post('/test-connection', response_model=GenericResponse)
async def test_connection(payload: WorkbenchSettingsPayload):
    try:
        data = test_source_connection(payload.model_dump())
        return GenericResponse(success=True, message=data.get('message', '连接成功'), data=data)
    except Exception as error:
        logger.error(f'测试来源连接失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'测试来源连接失败: {error}')


@router.post('/scan', response_model=GenericResponse)
async def scan_objects(payload: WorkbenchSettingsPayload):
    try:
        data = list_source_objects(payload.model_dump())
        return GenericResponse(success=True, message='扫描完成', data=data)
    except Exception as error:
        logger.error(f'扫描来源目录失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'扫描来源目录失败: {error}')


@router.post('/jobs', response_model=JobStartResponse)
async def create_job(payload: WorkbenchSettingsPayload):
    try:
        job = start_ingestion_job(payload.model_dump())
        return JobStartResponse(success=True, message='批量导入任务已启动', job=job or {})
    except Exception as error:
        logger.error(f'创建批量导入任务失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'创建批量导入任务失败: {error}')


@router.get('/jobs', response_model=JobListResponse)
async def get_jobs(limit: int = 20):
    try:
        jobs = list_recent_jobs(max(1, min(limit, 100)))
        return JobListResponse(success=True, jobs=jobs)
    except Exception as error:
        logger.error(f'读取批量导入任务失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail='读取批量导入任务失败')


@router.get('/jobs/{job_id}', response_model=GenericResponse)
async def get_job_detail(job_id: str):
    try:
        job = get_ingestion_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail='任务不存在')
        return GenericResponse(success=True, message='ok', data=job)
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f'读取任务详情失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail='读取任务详情失败')




@router.post('/jobs/{job_id}/cancel', response_model=GenericResponse)
async def cancel_job(job_id: str):
    try:
        job = cancel_ingestion_job(job_id)
        return GenericResponse(success=True, message='任务取消请求已提交', data=job or {})
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except Exception as error:
        logger.error(f'取消任务失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'取消任务失败: {error}')

@router.get('/index-status', response_model=GenericResponse)
async def index_status():
    try:
        data = get_index_status()
        return GenericResponse(success=True, message='ok', data=data)
    except Exception as error:
        logger.error(f'读取索引状态失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail='读取索引状态失败')


@router.post('/build-index', response_model=GenericResponse)
async def build_index(payload: WorkbenchSettingsPayload):
    try:
        data = build_vector_indices(payload.model_dump())
        return GenericResponse(success=True, message='索引构建完成', data={'results': data})
    except Exception as error:
        logger.error(f'构建索引失败: {error}', exc_info=True)
        raise HTTPException(status_code=500, detail=f'构建索引失败: {error}')
