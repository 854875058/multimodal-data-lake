# -*- coding: utf-8 -*-
"""MPP 平台管理代理路由。

将 /api/mpp/* 请求转发到 MPP Java 后端（/mpp-manager/api/*）。
支持集群管理、SQL编辑器、告警监控、巡检、日志等全部 MPP 功能。
"""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# MPP Java 后端地址，可通过环境变量或 config 配置
import os
MPP_BACKEND_URL = os.getenv("MPP_BACKEND_URL", "http://localhost:9095/mpp-manager/api")
MPP_TIMEOUT = float(os.getenv("MPP_TIMEOUT", "30"))

# 不需要透传的请求头
_HOP_BY_HOP_HEADERS = {
    "connection", "keep-alive", "transfer-encoding", "te",
    "trailers", "upgrade", "proxy-authorization", "proxy-authenticate",
    "host",
}


def _filter_headers(headers: dict) -> dict:
    """过滤掉不应透传的 hop-by-hop 请求头。"""
    return {k: v for k, v in headers.items() if k.lower() not in _HOP_BY_HOP_HEADERS}


async def _proxy_request(request: Request, path: str) -> Response:
    """通用代理转发逻辑。"""
    target_url = f"{MPP_BACKEND_URL}/{path}"
    if request.url.query:
        target_url = f"{target_url}?{request.url.query}"

    headers = _filter_headers(dict(request.headers))

    # 透传 Cookie（MPP Java 后端使用 Session Cookie 认证）
    body = await request.body()

    try:
        async with httpx.AsyncClient(timeout=MPP_TIMEOUT, verify=False) as client:
            proxy_response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
            )
    except httpx.ConnectError as e:
        logger.error("MPP 后端连接失败: %s -> %s", target_url, e)
        raise HTTPException(
            status_code=503,
            detail=f"MPP 后端服务不可达，请检查 MPP 服务是否已启动（{MPP_BACKEND_URL}）"
        )
    except httpx.TimeoutException as e:
        logger.error("MPP 后端请求超时: %s", target_url)
        raise HTTPException(status_code=504, detail="MPP 后端请求超时")
    except Exception as e:
        logger.error("MPP 代理异常: %s -> %s", target_url, e)
        raise HTTPException(status_code=502, detail=f"MPP 代理错误: {str(e)}")

    # 过滤响应头
    resp_headers = _filter_headers(dict(proxy_response.headers))
    # 移除 content-encoding，避免 FastAPI 二次压缩
    resp_headers.pop("content-encoding", None)
    resp_headers.pop("content-length", None)

    return Response(
        content=proxy_response.content,
        status_code=proxy_response.status_code,
        headers=resp_headers,
        media_type=proxy_response.headers.get("content-type"),
    )


# ───────────────────────────────────────────────
# 集群管理
# ───────────────────────────────────────────────

@router.api_route("/cluster/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_cluster(request: Request, rest_of_path: str):
    """集群相关接口代理。"""
    return await _proxy_request(request, f"cluster/{rest_of_path}")


@router.api_route("/new/cluster/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_new_cluster(request: Request, rest_of_path: str):
    """新版集群接口代理（/new/cluster/）。"""
    return await _proxy_request(request, f"new/cluster/{rest_of_path}")


@router.api_route("/new/user/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_new_user(request: Request, rest_of_path: str):
    """新版用户接口代理（/new/user/）。"""
    return await _proxy_request(request, f"new/user/{rest_of_path}")


@router.api_route("/node/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_node(request: Request, rest_of_path: str):
    """节点管理接口代理。"""
    return await _proxy_request(request, f"node/{rest_of_path}")


@router.api_route("/deployment/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_deployment(request: Request, rest_of_path: str):
    """集群部署/扩缩容接口代理。"""
    return await _proxy_request(request, f"deployment/{rest_of_path}")


@router.api_route("/agent/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_agent(request: Request, rest_of_path: str):
    """Agent 管理接口代理。"""
    return await _proxy_request(request, f"agent/{rest_of_path}")


@router.api_route("/download/{rest_of_path:path}", methods=["GET"])
async def proxy_download(request: Request, rest_of_path: str):
    """文件下载接口代理（验证脚本、Agent 安装包等）。"""
    return await _proxy_request(request, f"download/{rest_of_path}")


# ───────────────────────────────────────────────
# SQL 编辑器
# ───────────────────────────────────────────────

@router.api_route("/sql/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_sql(request: Request, rest_of_path: str):
    """SQL 编辑器接口代理（执行SQL、历史记录、慢SQL分析）。"""
    return await _proxy_request(request, f"sql/{rest_of_path}")


# ───────────────────────────────────────────────
# 告警监控
# ───────────────────────────────────────────────

@router.api_route("/alarm/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_alarm(request: Request, rest_of_path: str):
    """告警规则与记录接口代理。"""
    return await _proxy_request(request, f"alarm/{rest_of_path}")


@router.api_route("/alert/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_alert(request: Request, rest_of_path: str):
    """告警策略接口代理（新版）。"""
    return await _proxy_request(request, f"alert/{rest_of_path}")


# ───────────────────────────────────────────────
# 集群监控总览
# ───────────────────────────────────────────────

@router.api_route("/cluster/overview", methods=["GET"])
async def proxy_cluster_overview(request: Request):
    """集群监控总览接口代理。"""
    return await _proxy_request(request, "cluster/overview")


@router.api_route("/monitoring/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_monitoring(request: Request, rest_of_path: str):
    """监控数据接口代理。"""
    return await _proxy_request(request, f"monitoring/{rest_of_path}")


# ───────────────────────────────────────────────
# 自动巡检
# ───────────────────────────────────────────────

@router.api_route("/job-management/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_job_management(request: Request, rest_of_path: str):
    """Job 管理接口代理。"""
    return await _proxy_request(request, f"job-management/{rest_of_path}")


# ───────────────────────────────────────────────
# 日志
# ───────────────────────────────────────────────

@router.api_route("/log/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_log(request: Request, rest_of_path: str):
    """日志接口代理（FE/BE 日志文件列表与 WebSocket URL）。"""
    return await _proxy_request(request, f"log/{rest_of_path}")


# ───────────────────────────────────────────────
# 参数配置
# ───────────────────────────────────────────────

@router.api_route("/parameter/{rest_of_path:path}", methods=["GET", "POST", "PUT"])
async def proxy_parameter(request: Request, rest_of_path: str):
    """参数配置接口代理。"""
    return await _proxy_request(request, f"parameter/{rest_of_path}")


@router.api_route("/rest/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_rest(request: Request, rest_of_path: str):
    """Doris REST API 代理（节点配置信息等）。"""
    return await _proxy_request(request, f"rest/{rest_of_path}")


# ───────────────────────────────────────────────
# 自定义函数
# ───────────────────────────────────────────────

@router.api_route("/custom-function/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_custom_function(request: Request, rest_of_path: str):
    """自定义函数接口代理。"""
    return await _proxy_request(request, f"custom-function/{rest_of_path}")


# ───────────────────────────────────────────────
# 任务管理
# ───────────────────────────────────────────────

@router.api_route("/task/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_task(request: Request, rest_of_path: str):
    """任务管理接口代理。"""
    return await _proxy_request(request, f"task/{rest_of_path}")


# ───────────────────────────────────────────────
# MPP 会话（登录态透传）
# ───────────────────────────────────────────────

@router.api_route("/session/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_session(request: Request, rest_of_path: str):
    """MPP Session 接口代理。"""
    return await _proxy_request(request, f"session/{rest_of_path}")


@router.api_route("/user/{rest_of_path:path}", methods=["GET", "POST"])
async def proxy_user(request: Request, rest_of_path: str):
    """MPP 用户接口代理（切换集群等）。"""
    return await _proxy_request(request, f"user/{rest_of_path}")


# ───────────────────────────────────────────────
# 服务配置 & 权限管理（MPP 侧）
# ───────────────────────────────────────────────

@router.api_route("/setting/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_setting(request: Request, rest_of_path: str):
    """服务配置接口代理。"""
    return await _proxy_request(request, f"setting/{rest_of_path}")


@router.api_route("/manger/{rest_of_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_manger(request: Request, rest_of_path: str):
    """MPP 管理接口代理（权限管理、服务配置等）。"""
    return await _proxy_request(request, f"manger/{rest_of_path}")


# ───────────────────────────────────────────────
# 健康检查
# ───────────────────────────────────────────────

@router.get("/health")
async def mpp_health():
    """检查 MPP 后端连通性。"""
    try:
        async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
            resp = await client.get(f"{MPP_BACKEND_URL.rstrip('/mpp-manager/api')}/actuator/health")
            return {
                "mpp_backend": MPP_BACKEND_URL,
                "status": "reachable" if resp.status_code < 500 else "error",
                "http_status": resp.status_code,
            }
    except Exception as e:
        return {
            "mpp_backend": MPP_BACKEND_URL,
            "status": "unreachable",
            "error": str(e),
        }
