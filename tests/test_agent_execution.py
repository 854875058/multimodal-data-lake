# -*- coding: utf-8 -*-
"""测试 Agent 离线执行能力。"""

import sys
import shutil
import uuid
from contextlib import contextmanager
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))
TEST_TMP_ROOT = ROOT_DIR / '.tmp' / 'pytest-agent-exec'
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


def write_text(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')


def build_fake_repo(root: Path):
    write_text(root / '.gitignore', '*.log\n')
    write_text(root / 'README.md', 'frontend/views placeholder\n')
    write_text(root / 'frontend' / 'package.json', '{"name":"fake-frontend"}\n')
    write_text(root / 'backend' / 'main.py', "port = int(os.getenv('BACKEND_PORT', '8091'))\napp_target = 'main:app' if BACKEND_RELOAD else app\n")
    write_text(root / 'start.py', 'ROOT_DIR = Path(__file__).parent.absolute()\nBACKEND_DIR = ROOT_DIR / "backend"\nFRONTEND_DIR = ROOT_DIR / "frontend"\nsubprocess.Popen([sys.executable, "main.py"],\n            cwd=str(BACKEND_DIR),\n            env=env,)\n')
    write_text(root / 'frontend' / 'src' / 'main.js', 'legacy main')
    write_text(root / 'frontend' / 'src' / 'App.vue', '<template></template>')
    write_text(root / 'frontend' / 'src' / 'router' / 'index.js', 'legacy router')
    write_text(root / 'frontend' / 'src' / 'views' / 'Dashboard.vue', '<template></template>')
    write_text(root / 'README_VUE.md', 'legacy vue readme')
    write_text(root / '架构图.md', 'legacy architecture')
    write_text(root / 'app_nicegui.py', 'legacy nicegui')
    write_text(root / 'ui' / 'styles.py', 'legacy ui styles')
    write_text(root / '优化建议.md', 'legacy streamlit advice')
    write_text(root / 'agents' / 'task_executor.py', '# placeholder\n')
    write_text(root / 'agents' / 'code_agent.py', 'class CodeAgent:\n    pass\n')
    write_text(root / 'agents' / 'test_agent.py', 'class TestAgent:\n    pass\n')
    write_text(root / 'agents' / 'agent_coordinator.py', 'class AgentCoordinator:\n    pass\n')
    write_text(root / 'backend' / 'api' / 'agents.py', 'router = None\n')
    write_text(root / 'frontend' / 'src' / 'api' / 'index.js', 'export default {}\n')
    write_text(root / 'frontend' / 'src' / 'pages' / 'TaskGovernancePage.jsx', 'export default function TaskGovernancePage() { return null }\n')


def test_local_task_executor_removes_legacy_frontend():
    from agents.task_executor import LocalTaskExecutor

    with local_tempdir() as repo_root:
        build_fake_repo(repo_root)
        executor = LocalTaskExecutor(repo_root)
        task = {'id': 1, 'title': '清理遗留 Vue 前端入口和页面文件'}
        result = executor.execute(task)

        assert result['status'] == 'implemented'
        assert not (repo_root / 'frontend' / 'src' / 'main.js').exists()
        assert not (repo_root / 'frontend' / 'src' / 'App.vue').exists()
        assert not (repo_root / 'frontend' / 'src' / 'router').exists()
        assert not (repo_root / 'frontend' / 'src' / 'views').exists()


def test_local_task_executor_removes_legacy_artifacts_and_updates_ignore():
    from agents.task_executor import LocalTaskExecutor

    with local_tempdir() as repo_root:
        build_fake_repo(repo_root)
        executor = LocalTaskExecutor(repo_root)
        task = {'id': 2, 'title': '统一多代前端和架构文档口径'}
        result = executor.execute(task)

        assert result['status'] == 'implemented'
        assert not (repo_root / 'README_VUE.md').exists()
        assert not (repo_root / '架构图.md').exists()
        assert not (repo_root / 'app_nicegui.py').exists()
        assert '.tmp/' in (repo_root / '.gitignore').read_text(encoding='utf-8')
        assert 'agents/workspace/' in (repo_root / '.gitignore').read_text(encoding='utf-8')


def test_test_agent_generates_real_validation_commands():
    from agents.test_agent import TestAgent

    with local_tempdir() as repo_root:
        build_fake_repo(repo_root)
        agent = TestAgent(repo_root / 'workspace')
        checks = agent.generate_test_cases({
            'task_title': '清理遗留 Vue 前端入口和页面文件',
            'files_modified': [str(repo_root / 'frontend' / 'src' / 'main.jsx')],
            'files_removed': [str(repo_root / 'frontend' / 'src' / 'main.js')],
        }, repo_root)

        names = [item['name'] for item in checks]
        assert 'frontend-build' in names


def test_local_task_executor_disables_mock_fallback():
    from agents.task_executor import LocalTaskExecutor

    with local_tempdir() as repo_root:
        build_fake_repo(repo_root)
        write_text(repo_root / 'backend' / 'api' / 'platform.py', "DEFAULT_PLATFORM_SETTINGS = {\n    'use_mock': True,\n}\nclass PlatformSettingsPayload:\n    use_mock: bool = True\n\ndef _normalize_platform_settings(payload):\n    normalized = {}\n    normalized['use_mock'] = bool(normalized.get('use_mock', True))\n    return normalized\n")
        write_text(repo_root / 'frontend' / 'src' / 'pages' / 'ConfigCenterPage.jsx', "const defaultPlatformSettings = {\n  use_mock: true\n}\nconst label = '启用 Mock 回退模式'\n")

        executor = LocalTaskExecutor(repo_root)
        task = {'id': 3, 'title': '关闭平台默认 Mock 回退模式'}
        result = executor.execute(task)

        assert result['status'] == 'implemented'
        platform_content = (repo_root / 'backend' / 'api' / 'platform.py').read_text(encoding='utf-8')
        config_content = (repo_root / 'frontend' / 'src' / 'pages' / 'ConfigCenterPage.jsx').read_text(encoding='utf-8')
        assert "'use_mock': False" in platform_content
        assert 'use_mock: bool = False' in platform_content
        assert "normalized['use_mock'] = bool(normalized.get('use_mock', False))" in platform_content
        assert 'use_mock: false' in config_content


def test_brain_agent_syncs_user_requests_into_task_queue():
    from agents.brain_agent import BrainAgent
    from agents.request_store import create_request, load_requests

    with local_tempdir() as repo_root:
      workspace = repo_root / 'workspace'
      create_request(workspace, title='统一启动口径', description='统一后端默认端口与启动方式', priority=4)
      brain = BrainAgent(workspace)
      result = brain.sync_user_requests()

      assert result['created'] == 1
      assert brain.task_queue[0]['title'] == '统一启动口径'
      requests = load_requests(workspace)
      assert requests[0]['status'] == 'queued'
      assert requests[0]['task_id'] == 1
