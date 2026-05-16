# -*- coding: utf-8 -*-
"""Smoke tests for startup and routing contracts."""

import sys
from pathlib import Path

from fastapi import FastAPI

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

import backend.main as backend_main
import start


def test_versions_router_is_registered():
    route_paths = {route.path for route in backend_main.app.router.routes}

    assert "/api/versions/stats" in route_paths
    assert "/api/versions/{table_name}" in route_paths
    assert "/api/versions/rollback" in route_paths
    assert "/api/versions/compact/{table_name}" in route_paths


def test_optional_router_failure_does_not_break_app(monkeypatch):
    app = FastAPI()

    def fake_import_module(_name: str):
        raise ModuleNotFoundError("optional dependency is missing")

    monkeypatch.setattr(backend_main, "import_module", fake_import_module)

    result = backend_main._include_router_module(
        app,
        {
            "module": "backend.api.optional_demo",
            "prefix": "/api/optional-demo",
            "tags": ["可选模块"],
            "optional": True,
        },
    )

    assert result is False
    assert not any(route.path.startswith("/api/optional-demo") for route in app.router.routes)


def test_status_reports_single_entry(monkeypatch, capsys):
    def fake_read_pid(pid_file: Path):
        if pid_file == start.PID_BACKEND:
            return 12345
        return None

    monkeypatch.setattr(start, "_read_pid", fake_read_pid)
    monkeypatch.setattr(start, "_is_running", lambda pid: pid == 12345)
    monkeypatch.setattr(start, "_port_is_listening", lambda port: port == start.BACKEND_PORT)
    monkeypatch.setattr(start, "_fetch_status_code", lambda url, timeout_seconds=2: 200)

    start.cmd_status()
    output = capsys.readouterr().out

    assert start.UI_URL in output
    assert start.DOCS_URL in output
    assert f"http://127.0.0.1:{start.DEV_FRONTEND_PORT}" not in output
