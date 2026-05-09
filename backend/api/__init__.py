# -*- coding: utf-8 -*-
"""API 路由模块。"""

from . import agents, dashboard, files, multimodal, platform, search, system, upload, workbench
from . import users, permissions, ray_compute, mpp_proxy, versions, doris

__all__ = [
    "upload", "search", "files", "dashboard", "system", "workbench", "platform", "agents", "multimodal",
    "users", "permissions", "ray_compute", "mpp_proxy", "versions", "doris",
]
