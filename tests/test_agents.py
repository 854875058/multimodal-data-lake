# -*- coding: utf-8 -*-
"""测试 Agent Team 模块"""

import sys
import shutil
import uuid
from contextlib import contextmanager
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))
TEST_TMP_ROOT = ROOT_DIR / '.tmp' / 'pytest-agent'
TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)


@contextmanager
def local_tempdir():
    tmpdir = TEST_TMP_ROOT / f'case-{uuid.uuid4().hex}'
    if tmpdir.exists():
        shutil.rmtree(tmpdir, ignore_errors=True)
    tmpdir.mkdir(parents=True, exist_ok=True)
    try:
        yield tmpdir
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_brain_agent_create_task():
    """测试 Brain Agent 创建任务"""
    with local_tempdir() as tmpdir:
        from agents.brain_agent import BrainAgent
        brain = BrainAgent(tmpdir)
        task = brain.create_task('测试任务', '这是一个测试任务', priority=3)
        assert task['id'] == 1
        assert task['title'] == '测试任务'
        assert task['status'] == 'pending'
        assert task['priority'] == 3


def test_brain_agent_get_next_task():
    """测试获取下一个任务"""
    with local_tempdir() as tmpdir:
        from agents.brain_agent import BrainAgent
        brain = BrainAgent(tmpdir)
        brain.create_task('低优先级', '描述', priority=1)
        brain.create_task('高优先级', '描述', priority=5)
        next_task = brain.get_next_task()
        assert next_task['title'] == '高优先级'


def test_brain_agent_update_status():
    """测试更新任务状态"""
    with local_tempdir() as tmpdir:
        from agents.brain_agent import BrainAgent
        brain = BrainAgent(tmpdir)
        task = brain.create_task('任务', '描述')
        brain.update_task_status(task['id'], 'completed')
        # 验证没有待处理任务了
        assert brain.get_next_task() is None


def test_code_agent_receive_task():
    """测试 Code Agent 接收任务"""
    with local_tempdir() as tmpdir:
        from agents.code_agent import CodeAgent
        code = CodeAgent(tmpdir)
        result = code.receive_task({'id': 1, 'title': '测试'})
        assert result is True
        assert code.current_task['title'] == '测试'


def test_test_agent_status():
    """测试 Test Agent 状态"""
    with local_tempdir() as tmpdir:
        from agents.test_agent import TestAgent
        test = TestAgent(tmpdir)
        status = test.get_status()
        assert status['agent'] == 'TestAgent'
        assert status['total_test_runs'] == 0


def test_coordinator_status():
    """测试协调器状态"""
    with local_tempdir() as tmpdir:
        from agents.agent_coordinator import AgentCoordinator
        coordinator = AgentCoordinator(tmpdir)
        status = coordinator.get_status()
        assert status['running'] is False
        assert 'brain' in status
        assert 'code' in status
        assert 'test' in status


def test_brain_agent_analyze_project():
    """测试项目分析"""
    with local_tempdir() as tmpdir:
        from agents.brain_agent import BrainAgent
        brain = BrainAgent(tmpdir)
        analysis = brain.analyze_project(ROOT_DIR)
        assert 'missing_features' in analysis
        assert 'incomplete_modules' in analysis


def test_task_queue_persistence():
    """测试任务队列持久化"""
    with local_tempdir() as tmpdir:
        from agents.brain_agent import BrainAgent
        brain1 = BrainAgent(tmpdir)
        brain1.create_task('持久化测试', '描述')

        # 重新加载
        brain2 = BrainAgent(tmpdir)
        assert len(brain2.task_queue) == 1
        assert brain2.task_queue[0]['title'] == '持久化测试'
