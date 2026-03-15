# -*- coding: utf-8 -*-
"""Agent Coordinator - Agent 协调器"""

import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

from .brain_agent import BrainAgent
from .code_agent import CodeAgent
from .test_agent import TestAgent

logger = logging.getLogger(__name__)


class AgentCoordinator:
    """Agent 协调器：管理三个 Agent 的协作流程"""

    def __init__(self, workspace_dir: Path, api_key: Optional[str] = None):
        self.workspace_dir = workspace_dir
        self.workspace_dir.mkdir(parents=True, exist_ok=True)

        self.brain = BrainAgent(workspace_dir, api_key)
        self.code = CodeAgent(workspace_dir, api_key)
        self.test = TestAgent(workspace_dir, api_key)

        self.running = False
        self.max_retry = 3

    def start(self, project_root: Path):
        """启动协调器，持续运行"""
        self.running = True
        logger.info("Agent Team 启动")

        # 1. Brain Agent 分析项目
        analysis = self.brain.analyze_project(project_root)
        logger.info(f"项目分析完成: {analysis}")

        # 2. 创建初始任务
        for feature in analysis.get('missing_features', []):
            self.brain.create_task(
                title=f"实现{feature}",
                description=f"完整实现{feature}功能，包括后端 API 和前端界面",
                priority=3
            )

        # 3. 主循环
        while self.running:
            try:
                self._process_one_cycle()
                time.sleep(5)  # 每 5 秒检查一次
            except KeyboardInterrupt:
                logger.info("收到停止信号")
                self.stop()
            except Exception as e:
                logger.error(f"处理循环出错: {e}", exc_info=True)
                time.sleep(10)

    def _process_one_cycle(self):
        """处理一个工作循环"""
        # 获取下一个任务
        task = self.brain.get_next_task()
        if not task:
            logger.debug("没有待处理任务")
            return

        logger.info(f"开始处理任务: {task['title']}")
        self.brain.update_task_status(task['id'], 'in_progress')

        # Code Agent 实现代码
        self.code.receive_task(task)
        code_result = self.code.implement_code(task)

        if code_result.get('error'):
            logger.error(f"代码实现失败: {code_result['error']}")
            self.brain.update_task_status(task['id'], 'failed', code_result)
            return

        # Code Agent 自验证
        verify_result = self.code.self_verify(code_result.get('files_modified', []))
        if not verify_result['passed']:
            logger.warning(f"自验证失败: {verify_result['errors']}")
            self.brain.update_task_status(task['id'], 'failed', verify_result)
            return

        # Test Agent 接收代码
        self.test.receive_code(code_result)

        # Test Agent 生成测试用例
        test_cases = self.test.generate_test_cases(code_result)
        logger.info(f"生成 {len(test_cases)} 个测试用例")

        # Test Agent 执行测试
        test_files = [tc['test_file'] for tc in test_cases]
        test_result = self.test.run_tests(test_files)

        retry_count = 0
        while test_result['failed'] > 0 and retry_count < self.max_retry:
            logger.warning(f"测试失败，尝试修复 (第 {retry_count + 1} 次)")

            # 分析失败原因
            analysis = self.test.analyze_failures(test_result)

            if not analysis['should_retry']:
                break

            # 重新实现（这里简化处理，实际应该根据分析结果调整）
            code_result = self.code.implement_code(task)
            test_result = self.test.run_tests(test_files)
            retry_count += 1

        if test_result['failed'] > 0:
            logger.error(f"测试失败，已达最大重试次数")
            self.brain.update_task_status(task['id'], 'failed', test_result)
            return

        # 测试通过，生成优化建议
        suggestions = self.test.generate_optimization_suggestions(code_result, test_result)
        logger.info(f"生成 {len(suggestions)} 条优化建议")

        # Brain Agent 评估建议
        for suggestion in suggestions:
            evaluation = self.brain.evaluate_optimization(suggestion)
            if evaluation['accepted'] and evaluation['action'] == 'create_task':
                self.brain.create_task(
                    title=suggestion['description'],
                    description=f"优化建议: {suggestion}",
                    priority=suggestion['priority']
                )

        # 标记任务完成
        self.brain.update_task_status(task['id'], 'completed', {
            'code_result': code_result,
            'test_result': test_result,
            'suggestions': suggestions,
        })
        logger.info(f"任务完成: {task['title']}")

    def stop(self):
        """停止协调器"""
        self.running = False
        logger.info("Agent Team 停止")

    def get_status(self) -> Dict[str, Any]:
        """获取整体状态"""
        return {
            'running': self.running,
            'brain': self.brain.get_status(),
            'code': self.code.get_status(),
            'test': self.test.get_status(),
        }
