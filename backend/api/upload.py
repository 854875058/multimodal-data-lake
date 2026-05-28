# -*- coding: utf-8 -*-
"""文件上传 API"""

import os
import uuid
import logging
from typing import List
from fastapi import APIRouter, UploadFile, File, BackgroundTasks
from pydantic import BaseModel

from backend.core.config import TEMP_DIR, MAX_UPLOAD_SIZE_MB
from backend.services.etl import batch_process_local_files
from backend.core.models_loader import load_models_cached, get_lancedb_tables

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_CHUNK_SIZE = 1024 * 1024

class UploadResponse(BaseModel):
    success: bool
    message: str
    file_count: int
    task_id: str = None

def _process_files_task(temp_files):
    """后台任务：处理上传的文件
    temp_files: list of (local_path, original_filename) 元组
    """
    try:
        models = load_models_cached()
        tbl_text, tbl_image, tbl_files = get_lancedb_tables()

        batch_process_local_files(temp_files, models, tbl_text, tbl_image, tbl_files)

        logger.info(f"批量处理完成: {len(temp_files)} 个文件")
    except Exception as e:
        logger.error(f"批量处理失败: {e}", exc_info=True)

@router.post("/batch", response_model=UploadResponse)
async def upload_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """批量上传文件并后台处理"""
    if not files:
        return UploadResponse(success=False, message="未选择文件", file_count=0)

    # 保存上传的文件到临时目录
    os.makedirs(TEMP_DIR, exist_ok=True)
    temp_files = []
    total_size = 0
    max_upload_size_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024

    try:
        for file in files:
            temp_path = os.path.join(TEMP_DIR, f"{uuid.uuid4().hex[:8]}_{file.filename}")

            with open(temp_path, "wb") as f:
                while True:
                    chunk = await file.read(UPLOAD_CHUNK_SIZE)
                    if not chunk:
                        break
                    total_size += len(chunk)
                    if total_size > max_upload_size_bytes:
                        raise ValueError(f"单次上传总大小不能超过 {MAX_UPLOAD_SIZE_MB}MB")
                    f.write(chunk)

            await file.close()
            temp_files.append((temp_path, file.filename))
            logger.info(f"文件已保存: {file.filename} -> {temp_path}")

        # 后台任务处理文件（temp_files 已是 (path, filename) 元组列表）
        task_id = uuid.uuid4().hex[:12]
        background_tasks.add_task(_process_files_task, temp_files)

        return UploadResponse(
            success=True,
            message=f"已接收 {len(temp_files)} 个文件，正在后台处理",
            file_count=len(temp_files),
            task_id=task_id
        )

    except Exception as e:
        logger.error(f"文件上传失败: {e}")
        # 清理已保存的临时文件
        for temp_path, _ in temp_files:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        for file in files:
            try:
                await file.close()
            except Exception:
                pass
        return UploadResponse(
            success=False,
            message=str(e) if isinstance(e, ValueError) else "上传失败，请稍后重试",
            file_count=0
        )
