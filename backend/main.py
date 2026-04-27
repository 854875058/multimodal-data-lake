# -*- coding: utf-8 -*-
"""FastAPI 后端主入口。"""

import logging
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.api import agents, dashboard, files, platform, search, system, upload, workbench, users, permissions, ray_compute
from config import BACKEND_RELOAD, CORS_ALLOW_CREDENTIALS, CORS_ALLOW_ORIGINS

_log_dir = ROOT_DIR / 'logs'
_log_dir.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(_log_dir / 'app.log', encoding='utf-8'),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

def _load_background_resources():
    try:
        from models_loader import get_lancedb_tables, load_models_cached

        models = load_models_cached()
        logger.info('AI 模型加载完成: %s', list(models.keys()))

        tbl_text, tbl_image, tbl_files = get_lancedb_tables()
        logger.info(
            'LanceDB 连接成功: text=%s, image=%s, files=%s',
            tbl_text.count_rows(),
            tbl_image.count_rows(),
            tbl_files.count_rows(),
        )
    except Exception as error:
        logger.error('资源加载失败: %s', error)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info('=' * 60)
    logger.info('多模态数据湖 API 服务启动')
    logger.info('=' * 60)

    from database import init_db
    from backend.api.users import init_users_table

    init_db()
    logger.info('SQLite 数据库初始化完成')

    init_users_table()
    logger.info('用户表初始化完成')

    from backend.api.permissions import init_permissions_tables
    init_permissions_tables()
    logger.info('权限表初始化完成')

    threading.Thread(target=_load_background_resources, daemon=True).start()
    yield


app = FastAPI(
    title='多模态数据湖 API',
    description='多模态数据湖统一管理平台 API 服务',
    version='2.1.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(upload.router, prefix='/api/upload', tags=['文件上传'])
app.include_router(search.router, prefix='/api/search', tags=['向量检索'])
app.include_router(files.router, prefix='/api/files', tags=['文件管理'])
app.include_router(dashboard.router, prefix='/api/dashboard', tags=['仪表盘'])
app.include_router(system.router, prefix='/api/system', tags=['系统监控'])
app.include_router(agents.router, prefix='/api/agents', tags=['Agent Team'])
app.include_router(workbench.router, prefix='/api/workbench', tags=['接入工作台'])
app.include_router(platform.router, prefix='/api/platform', tags=['平台能力'])
app.include_router(users.router, prefix='/api/users', tags=['用户管理'])
app.include_router(permissions.router, prefix='/api/permissions', tags=['权限管理'])
app.include_router(ray_compute.router, prefix='/api/ray', tags=['Ray 计算编排'])


@app.get('/api/health')
async def health_check():
    """健康检查接口。"""
    return {'status': 'ok', 'service': '多模态数据湖 API'}


frontend_dist = ROOT_DIR / 'frontend' / 'dist'
frontend_assets = frontend_dist / 'assets'
frontend_index = frontend_dist / 'index.html'
if frontend_dist.exists():
    if frontend_assets.exists():
        app.mount('/assets', StaticFiles(directory=str(frontend_assets)), name='frontend-assets')
    logger.info('前端静态文件服务已启用: %s', frontend_dist)


@app.get('/', include_in_schema=False)
async def serve_frontend_root():
    if frontend_index.exists():
        return FileResponse(frontend_index)
    raise HTTPException(status_code=404, detail='前端构建产物不存在')


@app.get('/{full_path:path}', include_in_schema=False)
async def serve_frontend_app(full_path: str):
    if not frontend_dist.exists():
        raise HTTPException(status_code=404, detail='前端构建产物不存在')

    if full_path.startswith('api/'):
        raise HTTPException(status_code=404, detail='接口不存在')

    requested = (frontend_dist / full_path).resolve()
    try:
        requested.relative_to(frontend_dist.resolve())
    except ValueError as error:
        raise HTTPException(status_code=404, detail='非法路径') from error

    if requested.exists() and requested.is_file():
        return FileResponse(requested)

    if frontend_index.exists():
        return FileResponse(frontend_index)

    raise HTTPException(status_code=404, detail='前端入口不存在')




if __name__ == '__main__':
    import os
    import uvicorn

    port = int(os.getenv('BACKEND_PORT', '27843'))
    app_target = 'backend.main:app' if BACKEND_RELOAD else app
    uvicorn.run(
        app_target,
        host='0.0.0.0',
        port=port,
        reload=BACKEND_RELOAD,
        log_level='info',
    )
