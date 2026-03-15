# -*- coding: utf-8 -*-
"""Agent Team 启动脚本"""

import logging
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from agents import AgentCoordinator

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(ROOT_DIR / 'agent_team.log', encoding='utf-8'),
        logging.StreamHandler(),
    ],
)

logger = logging.getLogger(__name__)


def main():
    """主函数"""
    workspace_dir = ROOT_DIR / 'agents' / 'workspace'
    api_key = None  # 从环境变量读取或配置文件

    coordinator = AgentCoordinator(workspace_dir, api_key)

    try:
        logger.info("启动 Agent Team...")
        coordinator.start(ROOT_DIR)
    except KeyboardInterrupt:
        logger.info("收到停止信号")
        coordinator.stop()
    except Exception as e:
        logger.error(f"运行出错: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
