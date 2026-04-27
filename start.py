#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""多模态数据湖启动脚本 - 用法: python start.py start|stop|status|restart"""

import os
import sys
import subprocess
import time
import signal
from pathlib import Path

# --- conda 环境自检 ---
_CONDA_ENV = "multimodal-lake"

def _ensure_conda_env():
    if os.environ.get("CONDA_DEFAULT_ENV", "") == _CONDA_ENV:
        return
    conda_root = os.environ.get("CONDA_EXE", "")
    if conda_root:
        envs_dir = Path(conda_root).parent.parent / "envs"
    else:
        envs_dir = Path(sys.executable).parent.parent.parent / "envs"
    target_python = envs_dir / _CONDA_ENV / ("python.exe" if sys.platform == "win32" else "bin/python")
    if not target_python.exists():
        print(f"未找到 conda 环境 '{_CONDA_ENV}'，请先运行：")
        print(f"  conda create -n {_CONDA_ENV} python=3.11 -y")
        print(f"  conda activate {_CONDA_ENV}")
        print(f"  pip install \"numpy<2.0\"")
        print(f"  pip install -r requirements.txt")
        sys.exit(1)
    print(f"自动切换到 conda 环境: {_CONDA_ENV}")
    result = subprocess.run([str(target_python)] + sys.argv, env={**os.environ, "CONDA_DEFAULT_ENV": _CONDA_ENV})
    sys.exit(result.returncode)

_ensure_conda_env()

ROOT_DIR = Path(__file__).parent.absolute()
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_ENTRY = Path("backend") / "main.py"
PID_DIR = ROOT_DIR / ".pids"
PID_BACKEND = PID_DIR / "backend.pid"
PID_FRONTEND = PID_DIR / "frontend.pid"
LOG_DIR = ROOT_DIR / "logs"

BACKEND_PORT = 27843
FRONTEND_PORT = 27844


def _ensure_dirs():
    PID_DIR.mkdir(exist_ok=True)
    LOG_DIR.mkdir(exist_ok=True)

def _write_pid(pid_file, pid):
    pid_file.write_text(str(pid))

def _read_pid(pid_file):
    try:
        return int(pid_file.read_text().strip())
    except Exception:
        return None

def _is_running(pid):
    if pid is None:
        return False
    try:
        if sys.platform == "win32":
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}"],
                capture_output=True, text=True
            )
            return str(pid) in result.stdout
        else:
            os.kill(pid, 0)
            return True
    except (ProcessLookupError, PermissionError, OSError):
        return False

def _kill_pid(pid):
    if pid is None:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
    except Exception:
        pass

def _check_node():
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("错误: 未检测到 Node.js")
        return False

def _install_frontend_deps():
    if (FRONTEND_DIR / "node_modules").exists():
        return True
    print("安装前端依赖...")
    try:
        subprocess.check_call(
            ["npm", "install"], cwd=str(FRONTEND_DIR),
            shell=(sys.platform == "win32")
        )
        return True
    except subprocess.CalledProcessError:
        print("前端依赖安装失败")
        return False

def _start_backend():
    env = os.environ.copy()
    env["BACKEND_RELOAD"] = "0"
    log_out = open(LOG_DIR / "backend.out.log", "a")
    log_err = open(LOG_DIR / "backend.err.log", "a")
    if sys.platform == "win32":
        proc = subprocess.Popen(
            [sys.executable, str(BACKEND_ENTRY)],
            cwd=str(ROOT_DIR), env=env,
            stdout=log_out, stderr=log_err,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        proc = subprocess.Popen(
            [sys.executable, str(BACKEND_ENTRY)],
            cwd=str(ROOT_DIR), env=env,
            stdout=log_out, stderr=log_err,
            preexec_fn=os.setsid,
        )
    return proc.pid

def _start_frontend():
    log_out = open(LOG_DIR / "frontend.out.log", "a")
    log_err = open(LOG_DIR / "frontend.err.log", "a")
    if sys.platform == "win32":
        proc = subprocess.Popen(
            ["npm", "run", "dev"], cwd=str(FRONTEND_DIR),
            shell=True, stdout=log_out, stderr=log_err,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    else:
        proc = subprocess.Popen(
            ["npm", "run", "dev"], cwd=str(FRONTEND_DIR),
            stdout=log_out, stderr=log_err,
            preexec_fn=os.setsid,
        )
    return proc.pid


def cmd_start():
    _ensure_dirs()
    if not _check_node():
        sys.exit(1)
    if not _install_frontend_deps():
        sys.exit(1)

    backend_pid = _read_pid(PID_BACKEND)
    if _is_running(backend_pid):
        print(f"后端已在运行 (PID {backend_pid})")
    else:
        pid = _start_backend()
        _write_pid(PID_BACKEND, pid)
        print(f"后端已启动 (PID {pid})  http://localhost:{BACKEND_PORT}")

    time.sleep(2)

    frontend_pid = _read_pid(PID_FRONTEND)
    if _is_running(frontend_pid):
        print(f"前端已在运行 (PID {frontend_pid})")
    else:
        pid = _start_frontend()
        _write_pid(PID_FRONTEND, pid)
        print(f"前端已启动 (PID {pid})  http://localhost:{FRONTEND_PORT}")

    print(f"\n日志目录: {LOG_DIR}")


def cmd_stop():
    backend_pid = _read_pid(PID_BACKEND)
    frontend_pid = _read_pid(PID_FRONTEND)

    if _is_running(backend_pid):
        _kill_pid(backend_pid)
        print(f"后端已停止 (PID {backend_pid})")
    else:
        print("后端未在运行")
    PID_BACKEND.unlink(missing_ok=True)

    if _is_running(frontend_pid):
        _kill_pid(frontend_pid)
        print(f"前端已停止 (PID {frontend_pid})")
    else:
        print("前端未在运行")
    PID_FRONTEND.unlink(missing_ok=True)


def cmd_status():
    backend_pid = _read_pid(PID_BACKEND)
    frontend_pid = _read_pid(PID_FRONTEND)

    if _is_running(backend_pid):
        print(f"后端  运行中  PID {backend_pid}  http://localhost:{BACKEND_PORT}")
    else:
        print("后端  已停止")

    if _is_running(frontend_pid):
        print(f"前端  运行中  PID {frontend_pid}  http://localhost:{FRONTEND_PORT}")
    else:
        print("前端  已停止")


def cmd_restart():
    cmd_stop()
    time.sleep(1)
    cmd_start()


def main():
    cmds = {"start": cmd_start, "stop": cmd_stop, "status": cmd_status, "restart": cmd_restart}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print("用法: python start.py start|stop|status|restart")
        sys.exit(1)
    cmds[sys.argv[1]]()


if __name__ == "__main__":
    main()
