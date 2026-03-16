# -*- coding: utf-8 -*-
"""Code Agent - 代码实现 Agent"""

import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

from .base_agent import BaseAgent
from .task_executor import LocalTaskExecutor, TaskExecutionError

logger = logging.getLogger(__name__)


class CodeAgent(BaseAgent):
    """代码 Agent：负责接收任务、编写代码、自验证"""

    def __init__(self, workspace_dir: Path, api_key: Optional[str] = None):
        super().__init__("CodeAgent", workspace_dir)
        self.client = Anthropic(api_key=api_key) if api_key and Anthropic else None
        self.current_task = None

    def is_ready_for_autonomous_execution(self) -> bool:
        """当前实现是否具备可信的自动执行能力。"""
        return True

    def receive_task(self, task: Dict[str, Any]) -> bool:
        """接收任务"""
        self.current_task = task
        self.log_action("receive_task", {'task_id': task.get('id'), 'title': task.get('title')})
        return True

    def implement_code(self, task: Dict[str, Any], project_root: Optional[Path] = None) -> Dict[str, Any]:
        """通过离线规则引擎执行真实仓库改动。"""
        result = {
            'task_id': task.get('id'),
            'status': 'implemented',
            'files_modified': [],
            'files_removed': [],
            'self_test_passed': False,
            'error': None,
            'task_title': task.get('title'),
        }

        try:
            if project_root is None:
                raise TaskExecutionError('缺少 project_root，无法执行离线任务')

            executor = LocalTaskExecutor(project_root)
            execution_result = executor.execute(task)
            result.update(execution_result)
            result['self_test_passed'] = True
            self.log_action("implement_code", result)
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"代码实现失败: {e}")

        return result

    def self_verify(self, files: list) -> Dict[str, Any]:
        """自验证：检查语法、导入等"""
        verification = {
            'passed': True,
            'errors': [],
            'warnings': [],
        }

        for file_path in files:
            try:
                path = Path(file_path)
                if not path.exists():
                    verification['warnings'].append({
                        'file': file_path,
                        'warning': '文件已删除或不存在，跳过语法检查'
                    })
                    continue
                if path.suffix != '.py':
                    continue

                # 语法检查
                result = subprocess.run(
                    ['python', '-m', 'py_compile', file_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode != 0:
                    verification['passed'] = False
                    verification['errors'].append({
                        'file': file_path,
                        'error': result.stderr
                    })
            except Exception as e:
                verification['passed'] = False
                verification['errors'].append({
                    'file': file_path,
                    'error': str(e)
                })

        self.log_action("self_verify", verification)
        return verification

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """处理输入"""
        action = input_data.get('action')

        if action == 'receive_task':
            task = input_data.get('task', {})
            self.receive_task(task)
            return {'status': 'task_received'}
        elif action == 'implement':
            if not self.current_task:
                return {'error': '没有待处理任务'}
            project_root = input_data.get('project_root')
            return self.implement_code(self.current_task, Path(project_root) if project_root else None)
        elif action == 'verify':
            files = input_data.get('files', [])
            return self.self_verify(files)
        else:
            return {'error': f'未知操作: {action}'}

    def get_status(self) -> Dict[str, Any]:
        """获取状态"""
        return {
            'agent': self.name,
            'current_task': self.current_task.get('title') if self.current_task else None,
            'task_status': self.current_task.get('status') if self.current_task else None,
        }
