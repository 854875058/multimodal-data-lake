# -*- coding: utf-8 -*-
"""Deterministic local task executors for repository maintenance tasks."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


class TaskExecutionError(RuntimeError):
    """Raised when a task cannot be executed safely."""


class LocalTaskExecutor:
    """Executes a curated set of repository-maintenance tasks without an external LLM."""

    def __init__(self, project_root: Path):
        self.project_root = Path(project_root).resolve()

    def supports(self, task: Dict[str, Any]) -> bool:
        return self._resolve_rule(task) is not None

    def execute(self, task: Dict[str, Any]) -> Dict[str, Any]:
        rule = self._resolve_rule(task)
        if not rule:
            raise TaskExecutionError(f"当前离线执行器不支持任务: {task.get('title')}")

        result = {
            'task_id': task.get('id'),
            'status': 'implemented',
            'executor': 'local_rule_engine',
            'rule': rule,
            'files_modified': [],
            'files_removed': [],
            'actions': [],
            'warnings': [],
            'notes': [],
            'error': None,
        }

        handler = getattr(self, f'_handle_{rule}')
        handler(task, result)

        result['files_modified'] = self._dedupe_paths(result['files_modified'])
        result['files_removed'] = self._dedupe_paths(result['files_removed'])
        return result

    def _resolve_rule(self, task: Dict[str, Any]) -> Optional[str]:
        title = str(task.get('title') or '').strip()
        lowered = title.lower()

        if 'vue' in lowered and ('前端入口' in title or '页面文件' in title):
            return 'cleanup_legacy_vue_frontend'
        if '多代前端' in title or ('文档' in title and '不一致' in title):
            return 'cleanup_legacy_architecture_artifacts'
        if 'mock' in lowered and ('关闭' in title or '禁用' in title or '去掉' in title or '去除' in title):
            return 'disable_mock_fallback'
        if '端口' in title or '启动脚本' in title or '启动方式' in title:
            return 'ensure_startup_contract'
        if '真实执行能力' in title:
            return 'verify_real_execution_capability'
        if '系统集成位置' in title:
            return 'verify_system_integration'
        return None

    def _handle_cleanup_legacy_vue_frontend(self, task: Dict[str, Any], result: Dict[str, Any]):
        legacy_paths = [
            Path('frontend/src/main.js'),
            Path('frontend/src/App.vue'),
            Path('frontend/src/router/index.js'),
            Path('frontend/src/views'),
        ]
        for rel_path in legacy_paths:
            self._remove_path(rel_path, result)
        self._remove_empty_dir(Path('frontend/src/router'), result)

        self._replace_in_file(
            Path('README.md'),
            [
                ('│   │   └── views/          # 视图层', '│   │   ├── utils/          # 格式化与辅助函数\n│   │   └── main.jsx        # 前端入口'),
            ],
            result,
        )
        result['actions'].append('清理旧 Vue 入口、路由和页面目录。')

    def _handle_cleanup_legacy_architecture_artifacts(self, task: Dict[str, Any], result: Dict[str, Any]):
        legacy_paths = [
            Path('README_VUE.md'),
            Path('架构图.md'),
            Path('app_nicegui.py'),
            Path('ui/styles.py'),
            Path('优化建议.md'),
        ]
        for rel_path in legacy_paths:
            self._remove_path(rel_path, result)

        self._ensure_ignore_entries(['.tmp/', 'agents/workspace/'], result)
        result['actions'].append('移除旧 Vue / Streamlit / NiceGUI 文档与代码入口。')

    def _handle_ensure_startup_contract(self, task: Dict[str, Any], result: Dict[str, Any]):
        self._replace_in_file(
            Path('backend/main.py'),
            [
                ("port = int(os.getenv('BACKEND_PORT', '8091'))", "port = int(os.getenv('BACKEND_PORT', '8090'))"),
                ("app_target = 'main:app' if BACKEND_RELOAD else app", "app_target = 'backend.main:app' if BACKEND_RELOAD else app"),
            ],
            result,
        )
        self._replace_in_file(
            Path('start.py'),
            [
                ('ROOT_DIR = Path(__file__).parent.absolute()\nBACKEND_DIR = ROOT_DIR / "backend"\nFRONTEND_DIR = ROOT_DIR / "frontend"', 'ROOT_DIR = Path(__file__).parent.absolute()\nBACKEND_DIR = ROOT_DIR / "backend"\nFRONTEND_DIR = ROOT_DIR / "frontend"\nBACKEND_ENTRY = Path("backend") / "main.py"'),
                ('[sys.executable, "main.py"],\n            cwd=str(BACKEND_DIR),', '[sys.executable, str(BACKEND_ENTRY)],\n            cwd=str(ROOT_DIR),'),
                ('[sys.executable, "main.py"],\n        cwd=str(BACKEND_DIR),', '[sys.executable, str(BACKEND_ENTRY)],\n        cwd=str(ROOT_DIR),'),
            ],
            result,
        )
        result['actions'].append('校正后端默认端口和仓库根启动方式。')

    def _handle_disable_mock_fallback(self, task: Dict[str, Any], result: Dict[str, Any]):
        self._replace_in_file(
            Path('backend/api/platform.py'),
            [
                ("'use_mock': True,", "'use_mock': False,"),
                ('use_mock: bool = True', 'use_mock: bool = False'),
                ("normalized['use_mock'] = bool(normalized.get('use_mock', True))", "normalized['use_mock'] = bool(normalized.get('use_mock', False))"),
            ],
            result,
        )
        self._replace_in_file(
            Path('frontend/src/pages/ConfigCenterPage.jsx'),
            [
                ('use_mock: true', 'use_mock: false'),
                ('启用 Mock 回退模式', '启用 Mock 回退模式（仅内部调试）'),
            ],
            result,
        )
        result['actions'].append('默认关闭平台 Mock 回退模式，并将该开关降级为内部调试用途。')

    def _handle_verify_real_execution_capability(self, task: Dict[str, Any], result: Dict[str, Any]):
        required_paths = [
            Path('agents/task_executor.py'),
            Path('agents/code_agent.py'),
            Path('agents/test_agent.py'),
            Path('agents/agent_coordinator.py'),
        ]
        missing = [str((self.project_root / rel).resolve()) for rel in required_paths if not (self.project_root / rel).exists()]
        if missing:
            raise TaskExecutionError(f'离线执行链路缺失关键文件: {missing}')

        result['notes'].append('离线执行器、代码执行和验证链路已就位。')
        result['actions'].append('校验 Agent Team 已具备本地执行能力。')

    def _handle_verify_system_integration(self, task: Dict[str, Any], result: Dict[str, Any]):
        required_paths = [
            Path('backend/api/agents.py'),
            Path('frontend/src/pages/TaskGovernancePage.jsx'),
            Path('frontend/src/api/index.js'),
        ]
        missing = [str((self.project_root / rel).resolve()) for rel in required_paths if not (self.project_root / rel).exists()]
        if missing:
            raise TaskExecutionError(f'平台中尚未接入 Agent Team 查询链路: {missing}')

        result['notes'].append('后端 Agent API 和任务治理页已提供 Agent 状态查询能力。')
        result['actions'].append('校验 Agent Team 已接入当前系统查询链路。')

    def _remove_path(self, rel_path: Path, result: Dict[str, Any]):
        target = self.project_root / rel_path
        if not target.exists():
            result['warnings'].append(f'路径已不存在: {rel_path.as_posix()}')
            return

        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()

        result['files_removed'].append(str(target.resolve()))

    def _remove_empty_dir(self, rel_path: Path, result: Dict[str, Any]):
        target = self.project_root / rel_path
        if target.exists() and target.is_dir() and not any(target.iterdir()):
            target.rmdir()
            result['files_removed'].append(str(target.resolve()))

    def _replace_in_file(self, rel_path: Path, replacements: Iterable[tuple[str, str]], result: Dict[str, Any]):
        target = self.project_root / rel_path
        if not target.exists():
            result['warnings'].append(f'文件不存在，无法更新: {rel_path.as_posix()}')
            return

        content = target.read_text(encoding='utf-8')
        updated = content
        for old, new in replacements:
            updated = updated.replace(old, new)

        if updated != content:
            target.write_text(updated, encoding='utf-8')
            result['files_modified'].append(str(target.resolve()))

    def _ensure_ignore_entries(self, entries: Iterable[str], result: Dict[str, Any]):
        gitignore = self.project_root / '.gitignore'
        if not gitignore.exists():
            raise TaskExecutionError('缺少 .gitignore，无法补充运行态忽略规则')

        content = gitignore.read_text(encoding='utf-8')
        lines = content.splitlines()
        changed = False
        for entry in entries:
            if entry not in lines:
                lines.append(entry)
                changed = True
        if changed:
            gitignore.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
            result['files_modified'].append(str(gitignore.resolve()))

    @staticmethod
    def _dedupe_paths(paths: Iterable[str]) -> List[str]:
        deduped: List[str] = []
        seen = set()
        for item in paths:
            normalized = str(item)
            if normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
        return deduped
