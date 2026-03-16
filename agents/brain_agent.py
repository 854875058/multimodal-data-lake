# -*- coding: utf-8 -*-
"""Brain Agent - 项目规划与决策中心"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class BrainAgent(BaseAgent):
    """大脑 Agent：负责项目规划、任务分解、技术选型"""

    def __init__(self, workspace_dir: Path, api_key: Optional[str] = None):
        super().__init__("BrainAgent", workspace_dir)
        self.client = Anthropic(api_key=api_key) if api_key and Anthropic else None
        self.task_queue_file = workspace_dir / "tasks" / "task_queue.json"
        self.task_queue_file.parent.mkdir(parents=True, exist_ok=True)
        self.task_queue = self._load_task_queue()

    def _load_task_queue(self) -> List[Dict[str, Any]]:
        """加载任务队列"""
        if self.task_queue_file.exists():
            try:
                with open(self.task_queue_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"加载任务队列失败: {e}")
        return []

    def _save_task_queue(self):
        """保存任务队列"""
        try:
            with open(self.task_queue_file, 'w', encoding='utf-8') as f:
                json.dump(self.task_queue, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存任务队列失败: {e}")

    def analyze_project(self, project_root: Path) -> Dict[str, Any]:
        """分析项目，识别未实现功能"""
        analysis = {
            'missing_features': [],
            'incomplete_modules': [],
            'optimization_opportunities': [],
        }

        # 读取项目文档
        readme_path = project_root / "README.md"
        if readme_path.exists():
            with open(readme_path, 'r', encoding='utf-8') as f:
                readme_content = f.read()
                # 简单分析：查找"TODO"、"未实现"等关键词
                if "用户管理" in readme_content and not (project_root / "backend" / "api" / "users.py").exists():
                    analysis['missing_features'].append("用户管理系统")
                if "权限管理" in readme_content and not (project_root / "backend" / "api" / "permissions.py").exists():
                    analysis['missing_features'].append("权限管理系统")

        self.log_action("analyze_project", analysis)
        return analysis

    def create_task(self, title: str, description: str, priority: int = 1) -> Dict[str, Any]:
        """创建新任务"""
        task = {
            'id': len(self.task_queue) + 1,
            'title': title,
            'description': description,
            'priority': priority,
            'status': 'pending',
            'assigned_to': None,
            'created_at': self._get_timestamp(),
            'updated_at': self._get_timestamp(),
        }
        self.task_queue.append(task)
        self._save_task_queue()
        self.log_action("create_task", {'task_id': task['id'], 'title': title})
        return task

    def get_next_task(self) -> Optional[Dict[str, Any]]:
        """获取下一个待处理任务（按优先级）"""
        pending_tasks = [t for t in self.task_queue if t['status'] == 'pending']
        if not pending_tasks:
            return None
        return sorted(pending_tasks, key=lambda x: x['priority'], reverse=True)[0]

    def update_task_status(self, task_id: int, status: str, details: Optional[Dict] = None):
        """更新任务状态"""
        for task in self.task_queue:
            if task['id'] == task_id:
                task['status'] = status
                task['updated_at'] = self._get_timestamp()
                if details:
                    task['details'] = details
                self._save_task_queue()
                self.log_action("update_task_status", {'task_id': task_id, 'status': status})
                return
        logger.warning(f"任务 {task_id} 不存在")

    def evaluate_optimization(self, suggestion: Dict[str, Any]) -> Dict[str, Any]:
        """评估优化建议"""
        # 简单评估逻辑：根据建议类型和影响范围决定是否采纳
        evaluation = {
            'accepted': False,
            'reason': '',
            'action': None,
        }

        if suggestion.get('type') == 'performance':
            evaluation['accepted'] = True
            evaluation['reason'] = '性能优化建议已采纳'
            evaluation['action'] = 'create_task'
        elif suggestion.get('type') == 'security':
            evaluation['accepted'] = True
            evaluation['reason'] = '安全优化建议已采纳'
            evaluation['action'] = 'create_task'

        self.log_action("evaluate_optimization", evaluation)
        return evaluation

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """处理输入"""
        action = input_data.get('action')

        if action == 'analyze':
            project_root = Path(input_data.get('project_root', '.'))
            return self.analyze_project(project_root)
        elif action == 'create_task':
            return self.create_task(
                input_data['title'],
                input_data['description'],
                input_data.get('priority', 1)
            )
        elif action == 'get_next_task':
            return self.get_next_task() or {}
        elif action == 'evaluate':
            return self.evaluate_optimization(input_data.get('suggestion', {}))
        else:
            return {'error': f'未知操作: {action}'}

    def get_status(self) -> Dict[str, Any]:
        """获取状态"""
        return {
            'agent': self.name,
            'total_tasks': len(self.task_queue),
            'pending_tasks': len([t for t in self.task_queue if t['status'] == 'pending']),
            'in_progress_tasks': len([t for t in self.task_queue if t['status'] == 'in_progress']),
            'completed_tasks': len([t for t in self.task_queue if t['status'] == 'completed']),
        }

    def _get_timestamp(self) -> str:
        """获取时间戳"""
        from datetime import datetime
        return datetime.now().isoformat()
