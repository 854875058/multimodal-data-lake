#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
DataVerse Pro 跨平台启动脚本
支持 Windows 和 Linux 系统
"""

import os
import sys
import subprocess
import argparse
import time
import signal
from pathlib import Path

# --- conda 环境自检 ---
_CONDA_ENV = "multimodal-lake"

def _ensure_conda_env():
    current = os.environ.get("CONDA_DEFAULT_ENV", "")
    if current == _CONDA_ENV:
        return
    # 找 conda 环境下的 python
    conda_root = os.environ.get("CONDA_EXE", "")
    if conda_root:
        envs_dir = Path(conda_root).parent.parent / "envs"
    else:
        envs_dir = Path(sys.executable).parent.parent.parent / "envs"
    if sys.platform == "win32":
        target_python = envs_dir / _CONDA_ENV / "python.exe"
    else:
        target_python = envs_dir / _CONDA_ENV / "bin" / "python"
    if not target_python.exists():
        print(f"未找到 conda 环境 '{_CONDA_ENV}'，请先运行：")
        print(f"  conda create -n {_CONDA_ENV} python=3.11 -y")
        print(f"  conda activate {_CONDA_ENV}")
        print(f"  pip install \"numpy<2.0\"")
        print(f"  pip install -r requirements.txt")
        sys.exit(1)
    print(f"自动切换到 conda 环境: {_CONDA_ENV}")
    os.execv(str(target_python), [str(target_python)] + sys.argv)

_ensure_conda_env()
# --- end conda 环境自检 ---

# 项目根目录
ROOT_DIR = Path(__file__).parent.absolute()
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_ENTRY = Path("backend") / "main.py"

# 进程列表（用于清理）
processes = []

def signal_handler(sig, frame):
    """处理 Ctrl+C 信号"""
    print("\n\n正在停止所有服务...")
    for proc in processes:
        try:
            if sys.platform == "win32":
                proc.terminate()
            else:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception as e:
            print(f"停止进程失败: {e}")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

def check_python_packages():
    """检查并安装 Python 依赖"""
    print("检查 Python 依赖...")
    required = ["fastapi", "uvicorn"]
    missing = []

    for pkg in required:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"安装缺失的依赖: {', '.join(missing)}")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install",
            "fastapi", "uvicorn[standard]", "python-multipart"
        ])
        print("依赖安装完成")
    else:
        print("Python 依赖已满足")

def check_node():
    """检查 Node.js 是否安装"""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            check=True
        )
        print(f"Node.js 版本: {result.stdout.strip()}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("错误: 未检测到 Node.js，请先安装 Node.js")
        print("下载地址: https://nodejs.org/")
        return False

def install_frontend_deps():
    """安装前端依赖"""
    node_modules = FRONTEND_DIR / "node_modules"

    if node_modules.exists():
        print("前端依赖已安装")
        return True

    print("首次运行，安装前端依赖...")
    print("这可能需要几分钟，请耐心等待...")

    try:
        subprocess.check_call(
            ["npm", "install"],
            cwd=str(FRONTEND_DIR),
            shell=(sys.platform == "win32")
        )
        print("前端依赖安装完成")
        return True
    except subprocess.CalledProcessError as e:
        print(f"前端依赖安装失败: {e}")
        return False

def build_frontend():
    """构建前端"""
    print("构建前端...")

    try:
        subprocess.check_call(
            ["npm", "run", "build"],
            cwd=str(FRONTEND_DIR),
            shell=(sys.platform == "win32")
        )
        print("前端构建完成")
        return True
    except subprocess.CalledProcessError as e:
        print(f"前端构建失败: {e}")
        return False


def start_backend_process(reload=False):
    """从仓库根目录启动后端进程，并通过环境变量控制是否热重载。"""
    env = os.environ.copy()
    env["BACKEND_RELOAD"] = "1" if reload else "0"

    if sys.platform == "win32":
        return subprocess.Popen(
            [sys.executable, str(BACKEND_ENTRY)],
            cwd=str(ROOT_DIR),
            env=env,
        )

    return subprocess.Popen(
        [sys.executable, str(BACKEND_ENTRY)],
        cwd=str(ROOT_DIR),
        env=env,
        preexec_fn=os.setsid,
    )

def start_backend():
    """启动后端服务"""
    print("\n" + "="*50)
    print("启动后端服务 (FastAPI)")
    print("="*50)

    check_python_packages()

    print("\n后端地址: http://localhost:27843")
    print("API 文档: http://localhost:27843/docs")
    print("\n按 Ctrl+C 停止服务\n")

    # 启动后端（开发模式默认开启热重载）
    proc = start_backend_process(reload=True)

    processes.append(proc)

    try:
        proc.wait()
    except KeyboardInterrupt:
        pass

def start_frontend():
    """启动前端开发服务"""
    print("\n" + "="*50)
    print("启动前端开发服务 (Vite)")
    print("="*50)

    if not check_node():
        return

    if not install_frontend_deps():
        return

    print("\n前端地址: http://localhost:27844")
    print("后端代理: http://localhost:27843")
    print("\n按 Ctrl+C 停止服务\n")

    # 启动前端
    if sys.platform == "win32":
        proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(FRONTEND_DIR),
            shell=True
        )
    else:
        proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(FRONTEND_DIR),
            preexec_fn=os.setsid
        )

    processes.append(proc)

    try:
        proc.wait()
    except KeyboardInterrupt:
        pass

def start_both():
    """同时启动前后端"""
    print("\n" + "="*50)
    print("启动前后端服务 (开发模式)")
    print("="*50)

    # 检查依赖
    check_python_packages()

    if not check_node():
        return

    if not install_frontend_deps():
        return

    print("\n后端地址: http://localhost:27843")
    print("前端地址: http://localhost:27844")
    print("\n按 Ctrl+C 停止所有服务\n")

    # 启动后端（开发模式默认开启热重载）
    print("[1/2] 启动后端...")
    backend_proc = start_backend_process(reload=True)
    processes.append(backend_proc)

    # 等待后端启动
    time.sleep(3)

    # 启动前端
    print("[2/2] 启动前端...")
    if sys.platform == "win32":
        frontend_proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(FRONTEND_DIR),
            shell=True
        )
    else:
        frontend_proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(FRONTEND_DIR),
            preexec_fn=os.setsid
        )
    processes.append(frontend_proc)

    print("\n所有服务已启动！")
    print("访问 http://localhost:27844 开始使用\n")

    # 等待进程
    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        pass

def start_production():
    """生产模式启动"""
    print("\n" + "="*50)
    print("生产环境部署")
    print("="*50)

    # 检查依赖
    check_python_packages()

    if not check_node():
        return

    if not install_frontend_deps():
        return

    # 构建前端
    print("\n[1/2] 构建前端...")
    if not build_frontend():
        return

    # 启动后端
    print("\n[2/2] 启动后端...")
    print("\n服务地址: http://localhost:27843")
    print("API 文档: http://localhost:27843/docs")
    print("\n前端已构建并集成到后端")
    print("按 Ctrl+C 停止服务\n")

    proc = start_backend_process(reload=False)

    processes.append(proc)

    try:
        proc.wait()
    except KeyboardInterrupt:
        pass

def main():
    parser = argparse.ArgumentParser(
        description="DataVerse Pro 启动脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python start.py --backend          # 仅启动后端
  python start.py --frontend         # 仅启动前端
  python start.py --dev              # 同时启动前后端（开发模式）
  python start.py --production       # 生产模式（构建前端并启动）
        """
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--backend", "-b", action="store_true", help="仅启动后端服务")
    group.add_argument("--frontend", "-f", action="store_true", help="仅启动前端服务")
    group.add_argument("--dev", "-d", action="store_true", help="同时启动前后端（开发模式）")
    group.add_argument("--production", "-p", action="store_true", help="生产模式（构建前端并启动）")

    args = parser.parse_args()

    try:
        if args.backend:
            start_backend()
        elif args.frontend:
            start_frontend()
        elif args.dev:
            start_both()
        elif args.production:
            start_production()
    except Exception as e:
        print(f"\n错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
