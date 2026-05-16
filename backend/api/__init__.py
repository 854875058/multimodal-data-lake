# -*- coding: utf-8 -*-
"""API package metadata.

Keep this package import-light. Route modules are loaded explicitly by
``backend.main`` so that optional features cannot break the whole service
during package import.
"""

__all__ = [
    "agents",
    "dashboard",
    "doris",
    "files",
    "mpp_proxy",
    "multimodal",
    "operators",
    "permissions",
    "platform",
    "ray_compute",
    "search",
    "system",
    "upload",
    "users",
    "versions",
    "workbench",
]
