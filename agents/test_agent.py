# -*- coding: utf-8 -*-
"""Test Agent - 测试 Agent"""

import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


def _python_command() -> str:
    return sys.executable or 'python'


def _npm_command() -> str:
    return 'npm.cmd' if os.name == 'nt' else 'npm'


class TestAgent(BaseAgent):
    """测试 Agent：负责编写测试用例、执行测试、提出优化建议"""

    def __init__(self, workspace_dir: Path, api_key: Optional[str] = None):
        super().__init__("TestAgent", workspace_dir)
        self.client = Anthropic(api_key=api_key) if api_key and Anthropic else None
        self.test_results = []

    def is_ready_for_autonomous_execution(self) -> bool:
        """当前实现是否具备可信的自动验收能力。"""
        return True

    def receive_code(self, code_info: Dict[str, Any]) -> bool:
        """接收代码"""
        self.log_action("receive_code", {
            'task_id': code_info.get('task_id'),
            'files': code_info.get('files_modified', [])
        })
        return True

    def generate_test_cases(self, code_info: Dict[str, Any], project_root: Optional[Path] = None) -> List[Dict[str, Any]]:
        """根据改动内容生成真实验证命令。"""
        project_root = Path(project_root or '.').resolve()
        changed_files = [Path(path) for path in code_info.get('files_modified', [])]
        removed_files = [Path(path) for path in code_info.get('files_removed', [])]
        changed_strings = [str(path) for path in changed_files + removed_files]
        title = str(code_info.get('task_title') or '')
        checks: List[Dict[str, Any]] = []

        python_files = [str(path) for path in changed_files if path.suffix == '.py' and path.exists()]
        if python_files:
            checks.append({
                'name': 'python-compile',
                'command': [_python_command(), '-m', 'py_compile', *python_files],
                'cwd': str(project_root),
                'timeout': 120,
            })

        touches_frontend = any('frontend' in item for item in changed_strings) or '前端' in title or 'Vue' in title
        if touches_frontend and (project_root / 'frontend' / 'package.json').exists():
            checks.append({
                'name': 'frontend-build',
                'command': [_npm_command(), 'run', 'build'],
                'cwd': str(project_root / 'frontend'),
                'timeout': 600,
            })

        touches_backend_or_agents = any('backend' in item or 'agents' in item for item in changed_strings) or '启动' in title or 'Agent Team' in title
        if touches_backend_or_agents:
            checks.append({
                'name': 'backend-import',
                'command': [_python_command(), '-c', "from backend.main import app; print('backend-main-import-ok')"],
                'cwd': str(project_root),
                'timeout': 120,
            })

        if any('agents' in item for item in changed_strings) and (project_root / 'tests' / 'test_agents.py').exists():
            checks.append({
                'name': 'agent-tests',
                'command': [_python_command(), '-m', 'pytest', 'tests/test_agents.py', '-q'],
                'cwd': str(project_root),
                'timeout': 600,
            })

        if not checks:
            checks.append({
                'name': 'core-python-compile',
                'command': [_python_command(), '-m', 'py_compile', 'backend/main.py', 'start.py'],
                'cwd': str(project_root),
                'timeout': 120,
            })

        self.log_action("generate_test_cases", {'count': len(checks), 'task_title': title})
        return checks

    def run_tests(self, test_files: List[Any]) -> Dict[str, Any]:
        """执行验证命令或兼容旧式测试文件。"""
        result = {
            'passed': 0,
            'failed': 0,
            'errors': [],
            'coverage': 0,
            'checks': [],
        }

        for test_file in test_files:
            try:
                if isinstance(test_file, dict) and test_file.get('command'):
                    proc = subprocess.run(
                        test_file['command'],
                        cwd=test_file.get('cwd'),
                        capture_output=True,
                        text=True,
                        timeout=int(test_file.get('timeout', 300)),
                    )
                    check_name = test_file.get('name', 'unnamed-check')
                    result['checks'].append({
                        'name': check_name,
                        'returncode': proc.returncode,
                        'stdout': proc.stdout,
                        'stderr': proc.stderr,
                    })
                    if proc.returncode == 0:
                        result['passed'] += 1
                    else:
                        result['failed'] += 1
                        result['errors'].append({
                            'file': check_name,
                            'output': proc.stdout + proc.stderr
                        })
                else:
                    if not Path(test_file).exists():
                        result['failed'] += 1
                        result['errors'].append(f"测试文件不存在: {test_file}")
                        continue
                    proc = subprocess.run(
                        ['python', '-m', 'pytest', test_file, '-v'],
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
                    if proc.returncode == 0:
                        result['passed'] += 1
                    else:
                        result['failed'] += 1
                        result['errors'].append({
                            'file': test_file,
                            'output': proc.stdout + proc.stderr
                        })
            except Exception as e:
                result['failed'] += 1
                result['errors'].append({
                    'file': test_file,
                    'error': str(e)
                })

        total_checks = result['passed'] + result['failed']
        result['coverage'] = (result['passed'] / total_checks * 100) if total_checks > 0 else 0
        self.log_action("run_tests", result)
        self.test_results.append(result)
        return result

    def analyze_failures(self, test_result: Dict[str, Any]) -> Dict[str, Any]:
        """分析测试失败原因"""
        analysis = {
            'root_causes': [],
            'suggestions': [],
            'should_retry': False,
        }

        if test_result['failed'] > 0:
            for error in test_result['errors']:
                # 简单分析错误类型
                error_msg = str(error)
                if 'ImportError' in error_msg or 'ModuleNotFoundError' in error_msg:
                    analysis['root_causes'].append('缺少依赖')
                    analysis['suggestions'].append('检查并安装缺失的依赖包')
                elif 'SyntaxError' in error_msg:
                    analysis['root_causes'].append('语法错误')
                    analysis['suggestions'].append('修复代码语法错误')
                elif 'AssertionError' in error_msg:
                    analysis['root_causes'].append('逻辑错误')
                    analysis['suggestions'].append('检查业务逻辑实现')

            analysis['should_retry'] = True

        self.log_action("analyze_failures", analysis)
        return analysis

    def generate_optimization_suggestions(self, code_info: Dict[str, Any], test_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """生成优化建议"""
        suggestions = []

        # 基于测试结果生成建议
        if test_result.get('coverage', 0) < 80:
            suggestions.append({
                'type': 'coverage',
                'priority': 2,
                'description': '测试覆盖率不足，建议增加测试用例',
                'impact': 'medium',
            })

        self.log_action("generate_optimization_suggestions", {'count': len(suggestions)})
        return suggestions

    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """处理输入"""
        action = input_data.get('action')

        if action == 'receive_code':
            code_info = input_data.get('code_info', {})
            self.receive_code(code_info)
            return {'status': 'code_received'}
        elif action == 'generate_tests':
            code_info = input_data.get('code_info', {})
            project_root = input_data.get('project_root')
            test_cases = self.generate_test_cases(code_info, Path(project_root) if project_root else None)
            return {'test_cases': test_cases}
        elif action == 'run_tests':
            test_files = input_data.get('test_files', [])
            return self.run_tests(test_files)
        elif action == 'analyze':
            test_result = input_data.get('test_result', {})
            return self.analyze_failures(test_result)
        elif action == 'suggest':
            code_info = input_data.get('code_info', {})
            test_result = input_data.get('test_result', {})
            suggestions = self.generate_optimization_suggestions(code_info, test_result)
            return {'suggestions': suggestions}
        else:
            return {'error': f'未知操作: {action}'}

    def get_status(self) -> Dict[str, Any]:
        """获取状态"""
        total_tests = sum(r['passed'] + r['failed'] for r in self.test_results)
        total_passed = sum(r['passed'] for r in self.test_results)

        return {
            'agent': self.name,
            'total_test_runs': len(self.test_results),
            'total_tests': total_tests,
            'total_passed': total_passed,
            'pass_rate': (total_passed / total_tests * 100) if total_tests > 0 else 0,
        }
