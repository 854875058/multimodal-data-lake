#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Project launcher.

Usage:
    python start.py start|stop|status|restart
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CONDA_ENV = "multimodal-lake"

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"
PID_DIR = ROOT_DIR / ".pids"
LOG_DIR = ROOT_DIR / "logs"

PID_BACKEND = PID_DIR / "backend.pid"
PID_FRONTEND = PID_DIR / "frontend.pid"  # legacy cleanup only

BACKEND_PORT = 27843
DEV_FRONTEND_PORT = 27844

BACKEND_URL = f"http://127.0.0.1:{BACKEND_PORT}"
HEALTH_URL = f"{BACKEND_URL}/api/health"
UI_URL = f"{BACKEND_URL}/workflow"
ROOT_UI_URL = f"{BACKEND_URL}/"
DOCS_URL = f"{BACKEND_URL}/docs"

BACKEND_OUT_LOG = LOG_DIR / "backend.out.log"
BACKEND_ERR_LOG = LOG_DIR / "backend.err.log"


def _configure_console() -> None:
    if sys.platform != "win32":
        return

    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleCP(65001)
        kernel32.SetConsoleOutputCP(65001)
    except Exception:
        pass

    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _ensure_conda_env() -> None:
    if os.environ.get("CONDA_DEFAULT_ENV", "") == CONDA_ENV:
        return

    conda_exe = os.environ.get("CONDA_EXE", "")
    if conda_exe:
        envs_dir = Path(conda_exe).parent.parent / "envs"
    else:
        envs_dir = Path(sys.executable).parent.parent.parent / "envs"

    target_python = envs_dir / CONDA_ENV / ("python.exe" if sys.platform == "win32" else "bin/python")
    if not target_python.exists():
        print(f"未找到 conda 环境 '{CONDA_ENV}'，请先执行：")
        print(f"  conda create -n {CONDA_ENV} python=3.11 -y")
        print(f"  conda activate {CONDA_ENV}")
        print('  pip install "numpy<2.0"')
        print("  pip install -r requirements.txt")
        sys.exit(1)

    print(f"自动切换到 conda 环境: {CONDA_ENV}", flush=True)
    result = subprocess.run(
        [str(target_python)] + sys.argv,
        env={**os.environ, "CONDA_DEFAULT_ENV": CONDA_ENV},
    )
    sys.exit(result.returncode)


def _ensure_dirs() -> None:
    PID_DIR.mkdir(exist_ok=True)
    LOG_DIR.mkdir(exist_ok=True)


def _write_pid(pid_file: Path, pid: int) -> None:
    pid_file.write_text(str(pid), encoding="utf-8")


def _read_pid(pid_file: Path) -> int | None:
    try:
        return int(pid_file.read_text(encoding="utf-8").strip())
    except Exception:
        return None


def _is_running(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        if sys.platform == "win32":
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True,
                text=True,
            )
            return str(pid) in result.stdout
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def _kill_pid(pid: int | None) -> None:
    if pid is None:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
    except Exception:
        pass


def _tail_text(path: Path, lines: int = 20) -> str:
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    return "\n".join(content[-lines:])


def _safe_print(text: str) -> None:
    value = str(text)
    try:
        print(value)
    except UnicodeEncodeError:
        encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
        sys.stdout.buffer.write(value.encode(encoding, errors="replace") + b"\n")


def _log_excerpt(path: Path, lines: int = 5) -> str:
    if not path.exists():
        return "(no log)"
    content = [
        line.strip()
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()
        if line.strip()
    ]
    if not content:
        return "(no log)"
    return "\n".join(content[-lines:])


def _print_backend_failure(message: str) -> None:
    print(message)
    print("--- backend stdout ---")
    _safe_print(_tail_text(BACKEND_OUT_LOG))
    print("--- backend stderr ---")
    _safe_print(_tail_text(BACKEND_ERR_LOG))


def _fetch_status_code(url: str, timeout_seconds: int = 2) -> int | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout_seconds) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        return None


def _wait_for_port(port: int, timeout_seconds: int = 25) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.5)
    return False


def _wait_for_http(url: str, expected_statuses: tuple[int, ...] = (200,), timeout_seconds: int = 25) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        status = _fetch_status_code(url)
        if status in expected_statuses:
            return True
        time.sleep(0.5)
    return False


def _port_is_listening(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def _check_node() -> bool:
    return bool(_find_npm())


def _find_npm() -> str | None:
    if sys.platform == "win32":
        for candidate in ("npm.cmd", "npm"):
            result = shutil.which(candidate)
            if result:
                return result
        return None
    return shutil.which("npm")


def _npm_command() -> list[str]:
    npm_cmd = _find_npm()
    if not npm_cmd:
        raise FileNotFoundError("npm executable not found")
    return [npm_cmd]


def _windows_creationflags() -> int:
    if sys.platform != "win32":
        return 0
    flags = 0
    flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    flags |= getattr(subprocess, "DETACHED_PROCESS", 0)
    flags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return flags


def _install_frontend_deps() -> bool:
    if (FRONTEND_DIR / "node_modules").exists():
        return True
    print("安装前端依赖...")
    try:
        subprocess.check_call(_npm_command() + ["install"], cwd=str(FRONTEND_DIR))
        return True
    except subprocess.CalledProcessError:
        print("前端依赖安装失败")
        return False


def _build_frontend() -> bool:
    print("构建前端静态资源...")
    try:
        subprocess.check_call(_npm_command() + ["run", "build"], cwd=str(FRONTEND_DIR))
    except subprocess.CalledProcessError:
        print("前端构建失败")
        return False

    if not FRONTEND_INDEX.exists():
        print(f"前端构建结果缺失: {FRONTEND_INDEX}")
        return False
    return True


def _prepare_frontend() -> bool:
    if not _check_node():
        if FRONTEND_INDEX.exists():
            print("未检测到 Node.js，沿用现有前端构建产物。")
            return True
        print("错误: 未检测到 Node.js，且前端构建产物不存在。")
        return False

    if not _install_frontend_deps():
        return False
    return _build_frontend()


def _start_backend() -> int:
    env = os.environ.copy()
    env["BACKEND_RELOAD"] = "0"
    env["BACKEND_PORT"] = str(BACKEND_PORT)
    out_handle = open(BACKEND_OUT_LOG, "w", encoding="utf-8")
    err_handle = open(BACKEND_ERR_LOG, "w", encoding="utf-8")
    creationflags = _windows_creationflags()
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(BACKEND_PORT)],
        cwd=str(ROOT_DIR),
        env=env,
        stdout=out_handle,
        stderr=err_handle,
        creationflags=creationflags,
        close_fds=True,
        preexec_fn=None if sys.platform == "win32" else os.setsid,
    )
    return proc.pid


def _start_backend_service() -> None:
    existing_pid = _read_pid(PID_BACKEND)
    if (
        _is_running(existing_pid)
        and _wait_for_http(HEALTH_URL, timeout_seconds=2)
        and _wait_for_http(UI_URL, timeout_seconds=2)
    ):
        print(f"应用已在运行 (PID {existing_pid})  {UI_URL}")
        return

    pid = _start_backend()
    _write_pid(PID_BACKEND, pid)

    if not _wait_for_port(BACKEND_PORT, timeout_seconds=20):
        _print_backend_failure(f"应用启动失败: 端口 {BACKEND_PORT} 未监听")
        sys.exit(1)

    if not _wait_for_http(HEALTH_URL, timeout_seconds=20):
        _print_backend_failure(f"应用启动失败: {HEALTH_URL} 未就绪")
        sys.exit(1)

    if not _wait_for_http(UI_URL, timeout_seconds=20):
        _print_backend_failure(f"应用启动失败: {UI_URL} 未就绪")
        sys.exit(1)

    final_pid = _read_pid(PID_BACKEND)
    print(f"应用已启动 (PID {final_pid})  {UI_URL}")


def _print_service_summary() -> None:
    print("\n统一入口:")
    print(f"  应用首页:     {ROOT_UI_URL}")
    print(f"  工作流编排:   {UI_URL}")
    print(f"  API 文档:     {DOCS_URL}")
    print(f"  健康检查:     {HEALTH_URL}")

    print("\n运行约定:")
    print("  start.py 只启动后端进程，前端静态资源由后端统一托管。")
    print(f"  如需前端开发模式，请单独执行: cd frontend && npm run dev  # http://127.0.0.1:{DEV_FRONTEND_PORT}")

    print("\n最近日志摘要:")
    print("[backend.out.log]")
    _safe_print(_log_excerpt(BACKEND_OUT_LOG))


def cmd_start() -> None:
    _ensure_dirs()
    if not _prepare_frontend():
        sys.exit(1)
    _start_backend_service()
    _print_service_summary()
    print(f"\n日志目录: {LOG_DIR}")


def cmd_stop() -> None:
    backend_pid = _read_pid(PID_BACKEND)
    legacy_frontend_pid = _read_pid(PID_FRONTEND)

    if _is_running(backend_pid):
        _kill_pid(backend_pid)
        print(f"后端已停止 (PID {backend_pid})")
    else:
        print("后端未在运行")
    PID_BACKEND.unlink(missing_ok=True)

    if _is_running(legacy_frontend_pid):
        _kill_pid(legacy_frontend_pid)
        print(f"已清理遗留前端进程 (PID {legacy_frontend_pid})")
    PID_FRONTEND.unlink(missing_ok=True)


def cmd_status() -> None:
    backend_pid = _read_pid(PID_BACKEND)
    backend_running = _is_running(backend_pid) and _port_is_listening(BACKEND_PORT)
    health_status = _fetch_status_code(HEALTH_URL) if backend_running else None
    ui_status = _fetch_status_code(UI_URL) if backend_running else None

    if backend_running and health_status == 200:
        print(f"应用入口  运行中  PID {backend_pid}  {UI_URL}")
    else:
        print("应用入口  已停止")

    if backend_running and ui_status == 200:
        print(f"前端页面  可访问  {UI_URL}")
    elif backend_running:
        print(f"前端页面  未就绪  当前状态码: {ui_status}")

    if backend_running:
        print(f"API 文档  可访问  {DOCS_URL}")

    legacy_frontend_pid = _read_pid(PID_FRONTEND)
    if _is_running(legacy_frontend_pid):
        print(f"遗留前端  仍在运行  PID {legacy_frontend_pid}  http://127.0.0.1:{DEV_FRONTEND_PORT}")


def cmd_restart() -> None:
    cmd_stop()
    time.sleep(1)
    cmd_start()


def main() -> None:
    _configure_console()
    _ensure_conda_env()
    commands = {
        "start": cmd_start,
        "stop": cmd_stop,
        "status": cmd_status,
        "restart": cmd_restart,
    }
    if len(sys.argv) < 2 or sys.argv[1] not in commands:
        print("用法: python start.py start|stop|status|restart")
        sys.exit(1)
    commands[sys.argv[1]]()


if __name__ == "__main__":
    main()
