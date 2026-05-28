#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DataVerse Pro 跨平台自动化运维脚本
支持 Windows / Linux，命令完全统一

用法:
    python deploy.py install                # 首次安装（Python 依赖 + 前端依赖 + 构建）
    python deploy.py start                  # 启动前后端（后台运行）
    python deploy.py start --backend        # 仅启动后端
    python deploy.py start --frontend       # 仅启动前端开发服务
    python deploy.py stop                   # 停止全部
    python deploy.py stop --backend         # 仅停止后端
    python deploy.py stop --frontend        # 仅停止前端
    python deploy.py restart                # 重启全部
    python deploy.py restart --backend      # 仅重启后端
    python deploy.py restart --frontend     # 仅重启前端
    python deploy.py status                 # 查看状态 + 健康检查
    python deploy.py logs                   # 查看后端日志（实时）
    python deploy.py logs --frontend        # 查看前端日志（实时）
    python deploy.py build                  # 构建前端
    python deploy.py health                 # 仅健康检查
    python deploy.py env                    # 查看环境信息
"""

import os
import sys
import json
import time
import signal
import shutil
import socket
import argparse
import platform
import subprocess
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

# ============================================================================
# 路径常量
# ============================================================================
ROOT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
PIDFILE_DIR = ROOT_DIR / ".pids"

BACKEND_PORT = 27843
FRONTEND_PORT = 27844

IS_WINDOWS = platform.system() == "Windows"

# ============================================================================
# 颜色输出（Windows 启用 ANSI）
# ============================================================================
if IS_WINDOWS:
    os.system("")  # 激活 Windows 终端 ANSI 支持


class Color:
    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    BLUE = "\033[0;34m"
    CYAN = "\033[0;36m"
    BOLD = "\033[1m"
    NC = "\033[0m"


def info(msg):
    print(f"{Color.BLUE}[INFO]{Color.NC}  {msg}")


def ok(msg):
    print(f"{Color.GREEN}[ OK ]{Color.NC}  {msg}")


def warn(msg):
    print(f"{Color.YELLOW}[WARN]{Color.NC}  {msg}")


def err(msg):
    print(f"{Color.RED}[ERR ]{Color.NC}  {msg}", file=sys.stderr)


def title(msg):
    print(f"\n{Color.BOLD}{Color.CYAN}{'=' * 50}{Color.NC}")
    print(f"{Color.BOLD}{Color.CYAN}  {msg}{Color.NC}")
    print(f"{Color.BOLD}{Color.CYAN}{'=' * 50}{Color.NC}\n")


# ============================================================================
# PID 文件管理
# ============================================================================
def _pidfile(name):
    PIDFILE_DIR.mkdir(exist_ok=True)
    return PIDFILE_DIR / f"{name}.pid"


def _save_pid(name, pid):
    _pidfile(name).write_text(str(pid))


def _read_pid(name):
    pf = _pidfile(name)
    if pf.exists():
        try:
            return int(pf.read_text().strip())
        except ValueError:
            pass
    return None


def _clear_pid(name):
    pf = _pidfile(name)
    if pf.exists():
        pf.unlink()


def _is_alive(pid):
    """检查 PID 进程是否存活"""
    if pid is None:
        return False
    try:
        if IS_WINDOWS:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True, text=True
            )
            return str(pid) in result.stdout
        else:
            os.kill(pid, 0)
            return True
    except (OSError, subprocess.SubprocessError):
        return False


def _is_running(name):
    pid = _read_pid(name)
    alive = _is_alive(pid)
    if not alive and pid is not None:
        _clear_pid(name)
    return alive


def _kill_pid(name, graceful_timeout=8):
    pid = _read_pid(name)
    if pid is None:
        return False

    try:
        if IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True
            )
        else:
            os.kill(pid, signal.SIGTERM)
            deadline = time.time() + graceful_timeout
            while time.time() < deadline:
                time.sleep(0.2)
                try:
                    os.kill(pid, 0)
                except OSError:
                    break
            else:
                os.kill(pid, signal.SIGKILL)
    except OSError:
        pass

    _clear_pid(name)
    return True


# ============================================================================
# 端口检测
# ============================================================================
def _port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _wait_for_port(port, timeout=30, interval=0.5):
    """轮询等待端口开放，返回是否成功"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _port_in_use(port):
            return True
        time.sleep(interval)
    return False


# ============================================================================
# 进程启动（后台）
# ============================================================================
def _logfile(name):
    """返回进程的日志文件路径"""
    return ROOT_DIR / f"{name}.log"


def _start_process(name, cmd, cwd, port, env=None, startup_timeout=30):
    """后台启动进程，等待端口就绪后返回 PID"""
    if _is_running(name):
        warn(f"{name} 已在运行 (PID: {_read_pid(name)})")
        return _read_pid(name)

    if _port_in_use(port):
        err(f"端口 {port} 已被占用，请先释放端口再启动 {name}")
        return None

    full_env = os.environ.copy()
    if env:
        full_env.update(env)

    log_path = _logfile(name)
    log_fh = open(log_path, "a", encoding="utf-8")

    kwargs = {
        "cwd": str(cwd),
        "env": full_env,
        "stdout": log_fh,
        "stderr": subprocess.STDOUT,
    }

    if IS_WINDOWS:
        CREATE_NEW_PROCESS_GROUP = 0x00000200
        DETACHED_PROCESS = 0x00000008
        kwargs["creationflags"] = CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS
    else:
        kwargs["start_new_session"] = True

    proc = subprocess.Popen(cmd, **kwargs)
    _save_pid(name, proc.pid)

    info(f"等待 {name} 启动（最多 {startup_timeout}s）...")
    port_ready = _wait_for_port(port, timeout=startup_timeout)

    # 再确认进程还活着
    if not _is_alive(proc.pid):
        err(f"{name} 启动后立即退出，查看日志: {log_path}")
        _clear_pid(name)
        return None

    if port_ready:
        ok(f"{name} 已启动 (PID: {proc.pid}, 端口: {port})")
    else:
        warn(f"{name} 进程存活但端口 {port} 未就绪，查看日志: {log_path}")

    return proc.pid


# ============================================================================
# 命令: install
# ============================================================================
def cmd_install(args):
    title("DataVerse Pro 首次安装")

    cmd_env(args)

    # Python 依赖
    info("安装 Python 依赖...")
    req_file = ROOT_DIR / "requirements.txt"
    if req_file.exists():
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(req_file)])
        ok("Python 依赖安装完成")
    else:
        warn("requirements.txt 不存在，跳过")

    # 前端依赖 + 构建
    _npm_install_and_build()

    print()
    ok("安装完成!")
    info(f"启动服务: python deploy.py start")
    info(f"访问地址: http://localhost:{BACKEND_PORT}")


# ============================================================================
# 命令: start
# ============================================================================
def cmd_start(args):
    target = _parse_target(args)

    if target in ("all", "backend"):
        info("启动后端...")
        _start_process(
            name="backend",
            cmd=[sys.executable, "main.py"],
            cwd=BACKEND_DIR,
            port=BACKEND_PORT,
        )

    if target in ("all", "frontend"):
        npm_bin = shutil.which("npm")
        if not npm_bin:
            err("npm 未安装，无法启动前端开发服务")
        else:
            info("启动前端开发服务...")
            _start_process(
                name="frontend",
                cmd=[npm_bin, "run", "dev"],
                cwd=FRONTEND_DIR,
                port=FRONTEND_PORT,
            )

    print()
    cmd_health(args)
    print()

    if target == "all":
        info(f"前端 (热更新): http://localhost:{FRONTEND_PORT}")
        info(f"后端 API:      http://localhost:{BACKEND_PORT}")
        info(f"API 文档:      http://localhost:{BACKEND_PORT}/docs")
    elif target == "backend":
        info(f"后端 API:      http://localhost:{BACKEND_PORT}")
        info(f"API 文档:      http://localhost:{BACKEND_PORT}/docs")
        info(f"生产前端:      http://localhost:{BACKEND_PORT}  (需先 build)")
    elif target == "frontend":
        info(f"前端 (热更新): http://localhost:{FRONTEND_PORT}")


# ============================================================================
# 命令: stop
# ============================================================================
def cmd_stop(args):
    target = _parse_target(args)

    if target in ("all", "backend"):
        if _is_running("backend"):
            info("停止后端...")
            _kill_pid("backend")
            ok("后端已停止")
        else:
            info("后端未在运行")

    if target in ("all", "frontend"):
        if _is_running("frontend"):
            info("停止前端...")
            _kill_pid("frontend")
            ok("前端已停止")
        else:
            info("前端未在运行")


# ============================================================================
# 命令: restart
# ============================================================================
def cmd_restart(args):
    target = _parse_target(args)
    info(f"重启 {target}...")
    cmd_stop(args)
    time.sleep(2)
    cmd_start(args)


# ============================================================================
# 命令: status
# ============================================================================
def cmd_status(args):
    title("DataVerse Pro 服务状态")

    # 后端
    if _is_running("backend"):
        ok(f"后端:     运行中 (PID: {_read_pid('backend')}, 端口: {BACKEND_PORT})")
    else:
        if _port_in_use(BACKEND_PORT):
            warn(f"后端:     端口 {BACKEND_PORT} 已占用（非本脚本启动）")
        else:
            err("后端:     未运行")

    # 前端
    if _is_running("frontend"):
        ok(f"前端:     运行中 (PID: {_read_pid('frontend')}, 端口: {FRONTEND_PORT})")
    elif _port_in_use(FRONTEND_PORT):
        warn(f"前端:     端口 {FRONTEND_PORT} 已占用（非本脚本启动）")
    else:
        info("前端:     未运行  (生产模式由后端 :27843 提供静态文件)")

    # 前端构建产物
    dist_index = FRONTEND_DIR / "dist" / "index.html"
    if dist_index.exists():
        ok("前端构建: dist/ 已就绪")
    else:
        warn("前端构建: dist/ 不存在，执行 python deploy.py build 构建")

    # 日志文件
    for svc in ("backend", "frontend"):
        lf = _logfile(svc)
        if lf.exists():
            size_kb = lf.stat().st_size // 1024
            info(f"日志({svc}): {lf}  ({size_kb} KB)")

    print()
    cmd_health(args)


# ============================================================================
# 命令: health
# ============================================================================
def cmd_health(args):
    info("健康检查...")

    # 后端 /api/health
    try:
        resp = urlopen(f"http://localhost:{BACKEND_PORT}/api/health", timeout=5)
        data = json.loads(resp.read())
        if data.get("status") == "ok":
            ok(f"后端 API:   http://localhost:{BACKEND_PORT}/api/health  -> OK")
        else:
            warn(f"后端 API:   响应异常: {data}")
    except (URLError, Exception):
        err(f"后端 API:   无响应 (端口 {BACKEND_PORT})")

    # 系统资源
    try:
        resp = urlopen(f"http://localhost:{BACKEND_PORT}/api/system/resources", timeout=5)
        data = json.loads(resp.read())
        ok(f"系统资源:  CPU {data['cpu_percent']}%, 内存 {data['memory_percent']}%")
    except (URLError, Exception):
        pass

    # 文件数
    try:
        resp = urlopen(f"http://localhost:{BACKEND_PORT}/api/files/list?page_size=1", timeout=5)
        data = json.loads(resp.read())
        ok(f"数据湖文件: {data.get('total', 'N/A')} 个")
    except (URLError, Exception):
        pass


# ============================================================================
# 命令: logs
# ============================================================================
def cmd_logs(args):
    # 默认看后端日志；--frontend/-f 看前端日志
    use_frontend = getattr(args, "frontend", False)
    name = "frontend" if use_frontend else "backend"
    log_path = _logfile(name)

    if not log_path.exists():
        warn(f"日志文件不存在: {log_path}")
        warn(f"请先启动服务: python deploy.py start {'--frontend' if use_frontend else ''}")
        return

    info(f"实时日志 [{name}]: {log_path}  (Ctrl+C 退出)")
    print("-" * 60)

    try:
        if IS_WINDOWS:
            subprocess.run([
                "powershell", "-NoProfile", "-Command",
                f"Get-Content -Path '{log_path}' -Tail 50 -Wait -Encoding UTF8"
            ])
        else:
            subprocess.run(["tail", "-f", "-n", "50", str(log_path)])
    except KeyboardInterrupt:
        print()


# ============================================================================
# 命令: build
# ============================================================================
def cmd_build(args):
    _npm_install_and_build()


# ============================================================================
# 命令: env（环境检测）
# ============================================================================
def cmd_env(args):
    title("DataVerse Pro 环境检测")

    ok(f"操作系统: {platform.system()} {platform.release()} ({platform.machine()})")
    ok(f"Python:   {sys.version.split()[0]}  ({sys.executable})")

    # Node.js
    node_bin = shutil.which("node")
    if node_bin:
        ver = subprocess.run([node_bin, "--version"], capture_output=True, text=True)
        ok(f"Node.js:  {ver.stdout.strip()}")
    else:
        warn("Node.js:  未安装（前端功能不可用）")

    # npm
    npm_bin = shutil.which("npm")
    if npm_bin:
        ver = subprocess.run([npm_bin, "--version"], capture_output=True, text=True,
                             shell=IS_WINDOWS)
        ok(f"npm:      {ver.stdout.strip()}")
    else:
        warn("npm:      未安装")

    # GPU
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            result = subprocess.run(
                [nvidia_smi, "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True, text=True
            )
            ok(f"GPU:      {result.stdout.strip().splitlines()[0]}")
        except Exception:
            warn("GPU:      nvidia-smi 执行失败")
    else:
        warn("GPU:      未检测到（AI 模型将使用 CPU）")

    # ffmpeg
    if shutil.which("ffmpeg"):
        ok("ffmpeg:   已安装")
    else:
        warn("ffmpeg:   未安装（音视频转录不可用）")

    # poppler
    if shutil.which("pdftoppm") or shutil.which("pdftotext"):
        ok("poppler:  已安装")
    else:
        warn("poppler:  未安装（PDF 图像提取不可用）")

    print()


# ============================================================================
# 内部工具函数
# ============================================================================
def _parse_target(args):
    """解析 --backend / --frontend，默认返回 'all'"""
    backend = getattr(args, "backend", False)
    frontend = getattr(args, "frontend", False)
    if backend and not frontend:
        return "backend"
    if frontend and not backend:
        return "frontend"
    return "all"


def _npm_install_and_build():
    npm_bin = shutil.which("npm")
    if not npm_bin:
        err("npm 未安装，无法构建前端")
        sys.exit(1)

    node_modules = FRONTEND_DIR / "node_modules"
    if not node_modules.exists():
        info("安装前端依赖...")
        subprocess.check_call(
            [npm_bin, "install"],
            cwd=str(FRONTEND_DIR),
            shell=IS_WINDOWS
        )
        ok("前端依赖安装完成")
    else:
        ok("前端依赖已存在")

    info("构建前端...")
    subprocess.check_call(
        [npm_bin, "run", "build"],
        cwd=str(FRONTEND_DIR),
        shell=IS_WINDOWS
    )
    ok(f"前端构建完成: {FRONTEND_DIR / 'dist'}")


# ============================================================================
# 主入口
# ============================================================================
def main():
    parser = argparse.ArgumentParser(
        description="DataVerse Pro 跨平台运维脚本（Windows / Linux 通用）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python deploy.py install              # 首次安装（依赖 + 前端构建）
  python deploy.py start                # 后台启动前后端
  python deploy.py start --backend      # 仅启动后端
  python deploy.py start --frontend     # 仅启动前端开发服务
  python deploy.py stop                 # 停止全部
  python deploy.py stop --backend       # 仅停止后端
  python deploy.py stop --frontend      # 仅停止前端
  python deploy.py restart              # 重启全部
  python deploy.py restart --backend    # 仅重启后端
  python deploy.py status               # 状态 + 健康检查
  python deploy.py logs                 # 实时查看后端日志
  python deploy.py logs --frontend      # 实时查看前端日志
  python deploy.py build                # 构建前端
  python deploy.py health               # 仅健康检查
  python deploy.py env                  # 查看环境信息
        """
    )

    subparsers = parser.add_subparsers(dest="command", metavar="命令")

    # install
    subparsers.add_parser("install", help="首次安装（依赖 + 前端构建）")

    # start / stop / restart — 支持 --backend / --frontend
    for cmd_name in ("start", "stop", "restart"):
        sp = subparsers.add_parser(cmd_name, help=f"{cmd_name} 服务（默认全部）")
        sp.add_argument("--backend", "-b", action="store_true", help="仅操作后端")
        sp.add_argument("--frontend", "-f", action="store_true", help="仅操作前端")

    # status
    subparsers.add_parser("status", help="查看服务状态 + 健康检查")

    # health
    subparsers.add_parser("health", help="仅执行健康检查")

    # logs — 默认后端，--frontend 看前端
    sp_logs = subparsers.add_parser("logs", help="实时查看日志")
    sp_logs.add_argument("--frontend", "-f", action="store_true", help="查看前端日志")
    sp_logs.add_argument("--backend", "-b", action="store_true", help="查看后端日志（默认）")

    # build
    subparsers.add_parser("build", help="构建前端 dist/")

    # env
    subparsers.add_parser("env", help="检测系统环境（OS / Node / GPU / ffmpeg 等）")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    commands = {
        "install":  cmd_install,
        "start":    cmd_start,
        "stop":     cmd_stop,
        "restart":  cmd_restart,
        "status":   cmd_status,
        "health":   cmd_health,
        "logs":     cmd_logs,
        "build":    cmd_build,
        "env":      cmd_env,
    }

    cmd_func = commands.get(args.command)
    if cmd_func:
        try:
            cmd_func(args)
        except KeyboardInterrupt:
            print("\n操作已取消")
        except subprocess.CalledProcessError as e:
            err(f"命令执行失败: {e}")
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
