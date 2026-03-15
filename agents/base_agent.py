# -*- coding: utf-8 -*-
"""Agent 基类"""

import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Agent 基类，定义通用接口和行为"""

    def __init__(self, name: str, workspace_dir: Path):
        self.name = name
        self.workspace_dir = workspace_dir
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        self.history_file = workspace_dir / f"{name}_history.json"
        self.history = self._load_history()

    def _load_history(self) -> list:
        """加载历史记录"""
        if self.history_file.exists():
            try:
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"加载历史记录失败: {e}")
        return []

    def _save_history(self):
        """保存历史记录"""
        try:
            with open(self.history_file, 'w', encoding='utf-8') as f:
                json.dump(self.history, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存历史记录失败: {e}")

    def log_action(self, action: str, details: Dict[str, Any]):
        """记录 Agent 行为"""
        record = {
            'timestamp': datetime.now().isoformat(),
            'agent': self.name,
            'action': action,
            'details': details,
        }
        self.history.append(record)
        self._save_history()
        logger.info(f"[{self.name}] {action}: {details}")

    @abstractmethod
    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """处理输入数据，返回输出结果"""
        pass

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """获取 Agent 当前状态"""
        pass
