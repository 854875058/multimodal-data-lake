# -*- coding: utf-8 -*-
"""Test Agent - 测试 Agent"""

import logging
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from anthropic import Anthropic

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class TestAgent(BaseAgent):
    """测试 Agent：负责编写测试用例、执行测试、提出优化建议"""

    def __init__(self, workspace_dir: Path, api_key: Optional[str] = None):
        super().__init__("TestAgent", workspace_dir)
        self.client = Anthropic(api_key=api_key) if api_key else None
        self.test_results = []

    def receive_code(self, code_info: Dict[str, Any]) -> bool:
        """接收代码"""
        self.log_action("receive_code", {
            'task_id': code_info.get('task_id'),
            'files': code_info.get('files_modified', [])
        })
        return True

    def generate_test_cases(self, code_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """生成测试用例（占位实现）"""
        test_cases = []

        # 这里应该调用 Claude API 生成测试用例
        # 暂时返回占位结果
        for file_path in code_info.get('files_modified', []):
            test_cases.append({
                'test_file': f"tests/test_{Path(file_path).stem}.py",
                'test_functions': ['test_basic_functionality', 'test_edge_cases'],
                'coverage_target': 80,
            })

        self.log_action("generate_test_cases", {'count': len(test_cases)})
        return test_cases

    def run_tests(self, test_files: List[str]) -> Dict[str, Any]:
        """执行测试"""
        result = {
            'passed': 0,
            'failed': 0,
            'errors': [],
            'coverage': 0,
        }

        for test_file in test_files:
            if not Path(test_file).exists():
                result['errors'].append(f"测试文件不存在: {test_file}")
                continue

            try:
                # 运行 pytest
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

        if test_result.get('failed', 0) == 0 and test_result.get('passed', 0) > 0:
            suggestions.append({
                'type': 'performance',
                'priority': 1,
                'description': '考虑添加性能测试和边界测试',
                'impact': 'low',
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
            test_cases = self.generate_test_cases(code_info)
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
