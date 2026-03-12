# -*- coding: utf-8 -*-
"""FastAPI 后端主入口。"""

import logging
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.api import dashboard, files, platform, search, system, upload, workbench
from config import BACKEND_RELOAD, CORS_ALLOW_CREDENTIALS, CORS_ALLOW_ORIGINS

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(ROOT_DIR / 'app.log', encoding='utf-8'),
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
    logger.info('DataVerse Pro API 服务启动')
    logger.info('=' * 60)

    from database import init_db

    init_db()
    logger.info('SQLite 数据库初始化完成')

    threading.Thread(target=_load_background_resources, daemon=True).start()
    yield


app = FastAPI(
    title='DataVerse Pro API',
    description='多模态数据湖仓 API 服务',
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
app.include_router(workbench.router, prefix='/api/workbench', tags=['接入工作台'])
app.include_router(platform.router, prefix='/api/platform', tags=['平台能力'])


@app.get('/api/health')
async def health_check():
    """健康检查接口。"""
    return {'status': 'ok', 'service': 'DataVerse Pro API'}


frontend_dist = ROOT_DIR / 'frontend' / 'dist'
if frontend_dist.exists():
    app.mount('/', StaticFiles(directory=str(frontend_dist), html=True), name='frontend')
    logger.info('前端静态文件服务已启用: %s', frontend_dist)




if __name__ == '__main__':
    import uvicorn

    app_target = 'main:app' if BACKEND_RELOAD else app
    uvicorn.run(
        app_target,
        host='0.0.0.0',
        port=8090,
        reload=BACKEND_RELOAD,
        log_level='info',
    )
