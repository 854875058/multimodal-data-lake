# -*- coding: utf-8 -*-
"""Agent Coordinator - Agent 协调器"""

import json
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
        self.status_file = self.workspace_dir / 'agent_team_status.json'
        self.task_plan_dir = self.workspace_dir / 'task_plans'
        self.task_plan_dir.mkdir(parents=True, exist_ok=True)

        self.brain = BrainAgent(workspace_dir, api_key)
        self.code = CodeAgent(workspace_dir, api_key)
        self.test = TestAgent(workspace_dir, api_key)

        self.running = False
        self.max_retry = 3
        self.mode = 'planning_only'
        self.mode_reason = 'CodeAgent/TestAgent 仍是占位实现，暂不进入自动改码流程。'
        self.analysis_interval_seconds = 300
        self.project_root: Optional[Path] = None
        self._last_analysis_at = 0.0

    def _refresh_mode(self):
        """根据 Agent 能力选择运行模式。"""
        if self.code.is_ready_for_autonomous_execution() and self.test.is_ready_for_autonomous_execution():
            self.mode = 'execution'
            self.mode_reason = '执行 Agent 已具备离线改仓与真实验证能力。'
        else:
            self.mode = 'planning_only'
            self.mode_reason = 'CodeAgent/TestAgent 仍是占位实现，暂不进入自动改码流程。'

    def _write_status_snapshot(self):
        """将当前状态写入工作空间，便于外部查看。"""
        try:
            with open(self.status_file, 'w', encoding='utf-8') as f:
                json.dump(self.get_status(), f, ensure_ascii=False, indent=2)
        except Exception as error:
            logger.warning("写入 Agent 状态快照失败: %s", error)

    def _refresh_backlog(self):
        """重新扫描项目并同步 backlog。"""
        if not self.project_root:
            return
        analysis = self.brain.analyze_project(self.project_root)
        task_sync = self.brain.bootstrap_tasks_from_analysis(analysis)
        self._last_analysis_at = time.time()
        logger.info("Agent backlog 刷新完成，当前任务总数: %s", len(self.brain.task_queue))
        logger.info(
            "本次分析新增任务数: %s，已存在任务命中数: %s",
            len(task_sync.get('created', [])),
            len(task_sync.get('existing', [])),
        )

    def _write_task_plan(self, task_id: int, payload: Dict[str, Any]):
        """写入任务规划结果。"""
        plan_file = self.task_plan_dir / f'task_{task_id:03d}.json'
        with open(plan_file, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def _plan_one_task(self):
        """在 planning-only 模式下推进一个待规划任务。"""
        if not self.project_root:
            return

        task = self.brain.get_next_task()
        if not task:
            logger.debug("planning-only 模式下没有待处理任务")
            return

        logger.info("开始规划任务: %s", task['title'])
        self.brain.update_task_status(task['id'], 'in_progress')

        try:
            plan = self.brain.plan_task(task, self.project_root)
            plan_payload = {
                'task_id': task['id'],
                'title': task['title'],
                'priority': task['priority'],
                'status': 'ready',
                'plan': plan,
            }
            self._write_task_plan(task['id'], plan_payload)
            self.brain.update_task_status(task['id'], 'ready', {
                'plan_file': str((self.task_plan_dir / f'task_{task["id"]:03d}.json').resolve()),
                'plan_summary': plan['summary'],
                'target_files': plan['target_files'],
                'next_actions': plan['next_actions'],
                'validation_steps': plan['validation_steps'],
                'blockers': plan['blockers'],
            })
            logger.info("任务已进入 ready 状态: %s", task['title'])
        except Exception as error:
            logger.error("任务规划失败: %s", error, exc_info=True)
            self.brain.update_task_status(task['id'], 'failed', {'error': str(error)})

    def start(self, project_root: Path):
        """启动协调器，持续运行"""
        self.running = True
        self.project_root = project_root
        self._refresh_mode()
        logger.info("Agent Team 启动")
        logger.info("运行模式: %s", self.mode)
        logger.info("模式说明: %s", self.mode_reason)

        self._refresh_backlog()
        self._write_status_snapshot()

        # 3. 主循环
        while self.running:
            try:
                self._process_one_cycle()
                self._write_status_snapshot()
                time.sleep(5)  # 每 5 秒检查一次
            except KeyboardInterrupt:
                logger.info("收到停止信号")
                self.stop()
            except Exception as e:
                logger.error(f"处理循环出错: {e}", exc_info=True)
                time.sleep(10)

    def _process_one_cycle(self):
        """处理一个工作循环"""
        if time.time() - self._last_analysis_at >= self.analysis_interval_seconds:
            self._refresh_backlog()

        pending_task = self.brain.get_next_task(['pending'])
        if pending_task:
            self._plan_one_task()
            if self.mode == 'planning_only':
                return

        if self.mode == 'planning_only':
            return

        # 获取下一个任务
        task = self.brain.get_next_task(['ready'])
        if not task:
            logger.debug("没有待处理任务")
            return

        logger.info(f"开始处理任务: {task['title']}")
        self.brain.update_task_status(task['id'], 'in_progress')

        # Code Agent 实现代码
        self.code.receive_task(task)
        code_result = self.code.implement_code(task, self.project_root)

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
        test_cases = self.test.generate_test_cases(code_result, self.project_root)
        logger.info(f"生成 {len(test_cases)} 个测试用例")

        # Test Agent 执行测试
        test_result = self.test.run_tests(test_cases)

        if test_result['failed'] > 0:
            analysis = self.test.analyze_failures(test_result)
            logger.error(f"测试失败，已达最大重试次数")
            self.brain.update_task_status(task['id'], 'failed', {
                'code_result': code_result,
                'test_result': test_result,
                'failure_analysis': analysis,
            })
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
        self._write_status_snapshot()
        logger.info("Agent Team 停止")

    def get_status(self) -> Dict[str, Any]:
        """获取整体状态"""
        return {
            'running': self.running,
            'mode': self.mode,
            'mode_reason': self.mode_reason,
            'brain': self.brain.get_status(),
            'code': self.code.get_status(),
            'test': self.test.get_status(),
        }
