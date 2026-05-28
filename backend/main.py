# -*- coding: utf-8 -*-
"""FastAPI backend entrypoint."""

from __future__ import annotations

import logging
import sys
import threading
from contextlib import asynccontextmanager
from importlib import import_module
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.core.config import BACKEND_RELOAD, CORS_ALLOW_CREDENTIALS, CORS_ALLOW_ORIGINS

_log_dir = ROOT_DIR / "logs"
_log_dir.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(_log_dir / "app.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

ROUTE_SPECS = [
    {"module": "backend.api.upload", "prefix": "/api/upload", "tags": ["文件上传"]},
    {"module": "backend.api.search", "prefix": "/api/search", "tags": ["向量检索"]},
    {"module": "backend.api.files", "prefix": "/api/files", "tags": ["文件管理"]},
    {"module": "backend.api.dashboard", "prefix": "/api/dashboard", "tags": ["仪表盘"]},
    {"module": "backend.api.system", "prefix": "/api/system", "tags": ["系统监控"]},
    {"module": "backend.api.agents", "prefix": "/api/agents", "tags": ["Agent Team"]},
    {"module": "backend.api.multimodal", "prefix": "/api/multimodal", "tags": ["多模态检测复现"], "optional": True},
    {"module": "backend.api.workbench", "prefix": "/api/workbench", "tags": ["接入工作台"]},
    {"module": "backend.api.platform", "prefix": "/api/platform", "tags": ["平台能力"]},
    {"module": "backend.api.operators", "prefix": "/api/operators", "tags": ["迁移算子"]},
    {"module": "backend.api.users", "prefix": "/api/users", "tags": ["用户管理"]},
    {"module": "backend.api.permissions", "prefix": "/api/permissions", "tags": ["权限管理"]},
    {"module": "backend.api.ray_compute", "prefix": "/api/ray", "tags": ["Ray 计算编排"]},
    {"module": "backend.api.mpp_proxy", "prefix": "/api/mpp", "tags": ["MPP 集群管理"]},
    {"module": "backend.api.doris", "prefix": "/api/doris", "tags": ["Doris 集群管理"]},
    {"module": "backend.api.versions", "prefix": "/api/versions", "tags": ["版本管理"]},
]


def _load_background_resources() -> None:
    try:
        from backend.core.models_loader import get_lancedb_tables, load_models_cached

        models = load_models_cached()
        logger.info("AI 模型加载完成: %s", list(models.keys()))

        tbl_text, tbl_image, tbl_files = get_lancedb_tables()
        logger.info(
            "LanceDB 连接成功: text=%s, image=%s, files=%s",
            tbl_text.count_rows(),
            tbl_image.count_rows(),
            tbl_files.count_rows(),
        )
    except Exception as error:
        logger.warning("后台资源加载失败，服务继续运行: %s", error)


def _run_startup_step(label: str, func, optional: bool = False) -> bool:
    try:
        func()
        logger.info("%s完成", label)
        return True
    except Exception as error:
        if optional:
            logger.warning("跳过可选启动步骤 %s: %s", label, error)
            return False
        logger.exception("启动步骤失败: %s", label)
        raise


def _include_router_module(app: FastAPI, spec: dict[str, object]) -> bool:
    module_name = str(spec["module"])
    optional = bool(spec.get("optional"))
    prefix = str(spec["prefix"])
    tags = list(spec["tags"])
    try:
        module = import_module(module_name)
        router = getattr(module, "router")
        app.include_router(router, prefix=prefix, tags=tags)
        logger.info("已挂载路由: %s -> %s", prefix, module_name)
        return True
    except Exception as error:
        if optional:
            logger.warning("跳过可选路由 %s (%s): %s", prefix, module_name, error)
            return False
        logger.exception("挂载路由失败: %s (%s)", prefix, module_name)
        raise


def _register_routers(app: FastAPI) -> None:
    for spec in ROUTE_SPECS:
        _include_router_module(app, spec)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("多模态数据湖 API 服务启动")
    logger.info("=" * 60)

    from backend.core.database import init_db

    _run_startup_step("SQLite 数据库初始化", init_db)

    from backend.api.users import init_users_table
    from backend.api.permissions import init_permissions_tables

    _run_startup_step("用户表初始化", init_users_table)
    _run_startup_step("权限表初始化", init_permissions_tables)

    _run_startup_step(
        "多模态检测治理表初始化",
        lambda: import_module("multimodal_store").init_multimodal_tables(),
        optional=True,
    )
    _run_startup_step(
        "多模态检测追踪表初始化",
        lambda: import_module("multimodal_trace").init_multimodal_trace_db(),
        optional=True,
    )
    _run_startup_step(
        "多模态自动化标注任务表初始化",
        lambda: import_module("multimodal_labeling").init_multimodal_labeling_db(),
        optional=True,
    )
    _run_startup_step(
        "Doris 表初始化",
        lambda: import_module("backend.api.doris").init_doris_tables(),
        optional=True,
    )
    _run_startup_step(
        "Doris 后台引擎启动",
        lambda: import_module("backend.api.doris").start_doris_engines(),
        optional=True,
    )

    threading.Thread(target=_load_background_resources, daemon=True).start()
    yield


app = FastAPI(
    title="多模态数据湖 API",
    description="多模态数据湖统一管理平台 API 服务",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_register_routers(app)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "多模态数据湖 API"}


frontend_dist = ROOT_DIR / "frontend" / "dist"
frontend_assets = frontend_dist / "assets"
frontend_index = frontend_dist / "index.html"
if frontend_dist.exists():
    if frontend_assets.exists():
        app.mount("/assets", StaticFiles(directory=str(frontend_assets)), name="frontend-assets")
    logger.info("前端静态文件服务已启用: %s", frontend_dist)


@app.get("/", include_in_schema=False)
async def serve_frontend_root():
    if frontend_index.exists():
        return FileResponse(frontend_index)
    raise HTTPException(status_code=404, detail="前端构建产物不存在")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend_app(full_path: str):
    if not frontend_dist.exists():
        raise HTTPException(status_code=404, detail="前端构建产物不存在")

    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="接口不存在")

    requested = (frontend_dist / full_path).resolve()
    try:
        requested.relative_to(frontend_dist.resolve())
    except ValueError as error:
        raise HTTPException(status_code=404, detail="非法路径") from error

    if requested.exists() and requested.is_file():
        return FileResponse(requested)

    if frontend_index.exists():
        return FileResponse(frontend_index)

    raise HTTPException(status_code=404, detail="前端入口不存在")


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.getenv("BACKEND_PORT", "27843"))
    app_target = "backend.main:app" if BACKEND_RELOAD else app
    uvicorn.run(
        app_target,
        host="0.0.0.0",
        port=port,
        reload=BACKEND_RELOAD,
        log_level="info",
    )
