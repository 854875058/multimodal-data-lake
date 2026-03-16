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
from .request_store import load_requests, update_request

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
            'architecture_tasks': [],
        }

        def add_architecture_task(title: str, description: str, priority: int = 3):
            analysis['architecture_tasks'].append({
                'title': title,
                'description': description,
                'priority': priority,
            })

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
                if "Vue Router" in readme_content or "/api/workbench/ingest" in readme_content or "localhost:8000" in readme_content:
                    add_architecture_task(
                        "修正文档与当前 React/FastAPI 实现不一致",
                        "README 仍包含 Vue Router、旧 workbench 接口或 8000 端口等过时描述，需要与当前 React + FastAPI + 8090 的实现对齐。",
                        priority=5,
                    )

        frontend_main = project_root / "frontend" / "src" / "main.jsx"
        legacy_vue_main = project_root / "frontend" / "src" / "main.js"
        legacy_vue_app = project_root / "frontend" / "src" / "App.vue"
        legacy_vue_views = project_root / "frontend" / "src" / "views"
        has_legacy_views = legacy_vue_views.exists() and any(legacy_vue_views.iterdir())
        if frontend_main.exists() and (legacy_vue_main.exists() or legacy_vue_app.exists() or has_legacy_views):
            add_architecture_task(
                "清理遗留 Vue 前端入口和页面文件",
                "当前前端已切到 main.jsx / App.jsx，但仓库仍保留 main.js、App.vue、views 等旧 Vue 入口与页面，需要决定保留或清理策略。",
                priority=5,
            )

        if (project_root / "README_VUE.md").exists() or (project_root / "架构图.md").exists() or (project_root / "app_nicegui.py").exists():
            add_architecture_task(
                "统一多代前端和架构文档口径",
                "仓库同时保留 React、Vue、Streamlit/NiceGUI 多代资料与实现痕迹，需要整理当前有效架构、历史遗留和废弃路径。",
                priority=4,
            )

        backend_main = project_root / "backend" / "main.py"
        start_script = project_root / "start.py"
        agents_doc = project_root / "AGENTS.md"
        backend_main_content = backend_main.read_text(encoding='utf-8') if backend_main.exists() else ''
        start_script_content = start_script.read_text(encoding='utf-8') if start_script.exists() else ''
        agents_doc_content = agents_doc.read_text(encoding='utf-8') if agents_doc.exists() else ''

        if "BACKEND_PORT', '8091'" in backend_main_content and "8090" in agents_doc_content:
            add_architecture_task(
                "统一后端默认端口与启动约定",
                "backend/main.py 默认端口仍是 8091，但项目规则、部署脚本和验收口径都以 8090 为准，需要统一。",
                priority=5,
            )

        if 'cwd=str(BACKEND_DIR)' in start_script_content and 'python backend/main.py' in agents_doc_content:
            add_architecture_task(
                "统一启动脚本与仓库根启动方式",
                "AGENTS 要求从仓库根执行 python backend/main.py，但 start.py 仍切到 backend 目录运行 main.py，需要收敛为同一启动方式。",
                priority=4,
            )

        if "api_key = None" in (project_root / "agents" / "start_agents.py").read_text(encoding='utf-8'):
            add_architecture_task(
                "补齐 Agent Team 的环境配置读取",
                "start_agents.py 仍把 api_key 写死为 None，缺少从环境变量读取配置、区分执行模式和可观测状态的能力。",
                priority=4,
            )

        code_agent_path = project_root / "agents" / "code_agent.py"
        test_agent_path = project_root / "agents" / "test_agent.py"
        code_agent_content = code_agent_path.read_text(encoding='utf-8') if code_agent_path.exists() else ''
        test_agent_content = test_agent_path.read_text(encoding='utf-8') if test_agent_path.exists() else ''
        has_real_execution = (
            'return True' in code_agent_content
            and 'LocalTaskExecutor' in code_agent_content
            and 'return True' in test_agent_content
            and 'generate_test_cases' in test_agent_content
            and 'backend-import' in test_agent_content
        )
        if not has_real_execution:
            add_architecture_task(
                "补齐 Agent Team 的真实执行能力",
                "CodeAgent / TestAgent 仍是占位实现，当前只能规划任务，无法可信地自动改码和验收。",
                priority=5,
            )
            analysis['optimization_opportunities'].append("Agent Team 仍处于规划骨架阶段，优先适合作为 backlog 生成器。")

        agent_api_ready = (project_root / "backend" / "api" / "agents.py").exists()
        request_cli_ready = (project_root / "agents" / "submit_request.py").exists()
        if not (agent_api_ready and request_cli_ready):
            add_architecture_task(
                "明确 Agent Team 的系统集成位置",
                "Agent Team 应作为内部构建工具存在，需要保留内部状态 API 与本地需求投递入口，而不是侵入数据湖产品界面。",
                priority=3,
            )

        self.log_action("analyze_project", analysis)
        return analysis

    def ensure_task(self, title: str, description: str, priority: int = 1) -> Dict[str, Any]:
        """按标题去重创建任务。"""
        for task in self.task_queue:
            if task['title'] == title:
                return task
        return self.create_task(title, description, priority)

    def bootstrap_tasks_from_analysis(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """根据项目分析结果生成初始 backlog。"""
        created_tasks = []
        existing_tasks = []

        def sync_task(title: str, description: str, priority: int):
            existing = next((task for task in self.task_queue if task['title'] == title), None)
            task = self.ensure_task(title=title, description=description, priority=priority)
            if existing is None:
                created_tasks.append(task)
            else:
                existing_tasks.append(task)

        for feature in analysis.get('missing_features', []):
            sync_task(
                title=f"实现{feature}",
                description=f"完整实现{feature}功能，包括后端 API 和前端界面",
                priority=3,
            )

        for module in analysis.get('incomplete_modules', []):
            sync_task(
                title=f"补齐{module}",
                description=f"完善 {module} 的缺失实现并补充验证。",
                priority=3,
            )

        for item in analysis.get('architecture_tasks', []):
            sync_task(
                title=item['title'],
                description=item['description'],
                priority=item.get('priority', 3),
            )

        return {
            'created': created_tasks,
            'existing': existing_tasks,
        }

    def plan_task(self, task: Dict[str, Any], project_root: Path) -> Dict[str, Any]:
        """为任务生成可执行计划。"""
        title = str(task.get('title') or '').strip()
        lower_title = title.lower()

        candidate_paths: List[Path] = []
        validation_steps: List[str] = []
        next_actions: List[str] = []
        blockers: List[str] = []
        notes: List[str] = []

        def add_path(*parts: str):
            path = project_root.joinpath(*parts)
            if path.exists():
                candidate_paths.append(path)

        if 'vue' in lower_title:
            add_path('frontend', 'src', 'main.js')
            add_path('frontend', 'src', 'App.vue')
            add_path('frontend', 'src', 'router', 'index.js')
            add_path('frontend', 'src', 'views')
            notes.append('需要先判断旧 Vue 代码是保留备用还是彻底迁移删除。')
            validation_steps.extend([
                '确认 frontend/index.html 仍以 main.jsx 为唯一入口。',
                '运行 npm run build，确认删除遗留文件后不影响当前 React 构建。',
            ])
            next_actions.extend([
                '梳理当前 React 已覆盖的页面与旧 Vue 页面映射关系。',
                '删除未使用的 Vue 入口和路由，或迁移到 archive 目录。',
            ])
        elif '文档口径' in title or '多代前端' in title or ('文档' in title and '不一致' in title):
            add_path('README.md')
            add_path('README_VUE.md')
            add_path('架构图.md')
            add_path('docs', 'DEPLOY.md')
            add_path('AGENTS.md')
            notes.append('需要把当前有效实现、历史版本说明和废弃资料彻底分层。')
            validation_steps.extend([
                '检查 README、DEPLOY、AGENTS 三份文档的启动命令和端口是否一致。',
                '确认历史文档被明确标记为 legacy/reference，而不是当前入口。',
            ])
            next_actions.extend([
                '保留一份 current architecture 文档作为主入口。',
                '将旧 Vue / Streamlit / NiceGUI 资料移入 legacy 文档区并加醒目标识。',
            ])
        elif '真实执行能力' in title:
            add_path('agents', 'code_agent.py')
            add_path('agents', 'test_agent.py')
            add_path('agents', 'agent_coordinator.py')
            add_path('agents', 'README.md')
            validation_steps.extend([
                '补齐真正的任务消费、改码、测试和失败回退链路。',
                '为 agent 状态流转增加可验证的自动化测试。',
            ])
            next_actions.extend([
                '为 CodeAgent 引入真实文件选择和改动执行策略。',
                '为 TestAgent 增加最小可运行测试生成和验证流程。',
            ])
            blockers.append('当前没有接入安全可控的真实改码执行沙箱。')
        elif '系统集成位置' in title:
            add_path('agents', 'start_agents.py')
            add_path('backend', 'main.py')
            add_path('backend', 'api')
            add_path('frontend', 'src', 'pages', 'TaskGovernancePage.jsx')
            validation_steps.extend([
                '明确 Agent Team 是独立守护进程、后端生命周期组件，还是平台内任务服务。',
                '为 Agent 状态暴露统一查询入口或管理界面。',
            ])
            next_actions.extend([
                '先定义 Agent Team 在平台中的角色和 API 边界。',
                '再决定接入 FastAPI startup、独立进程管理还是工作台页面。'
            ])
        elif '端口' in title or '启动' in title:
            add_path('backend', 'main.py')
            add_path('start.py')
            add_path('deploy.py')
            add_path('README.md')
            add_path('docs', 'DEPLOY.md')
            validation_steps.extend([
                '从仓库根运行 python backend/main.py 并验证 /api/health。',
                '验证 start.py、deploy.py、README、AGENTS 的端口口径一致。',
            ])
            next_actions.extend([
                '统一默认端口为 8090。',
                '统一所有启动入口都从仓库根工作目录运行。',
            ])
        else:
            add_path('README.md')
            add_path('agents', 'README.md')
            notes.append('当前任务未命中专门模板，使用通用规划模板。')
            validation_steps.append('结合任务涉及文件补充最小可运行验证。')
            next_actions.append('补充针对该任务的文件范围和验收标准。')

        unique_paths = []
        seen_paths = set()
        for path in candidate_paths:
            normalized = str(path.resolve())
            if normalized in seen_paths:
                continue
            seen_paths.add(normalized)
            unique_paths.append(normalized)

        if not unique_paths:
            blockers.append('尚未定位到明确的候选文件，需要人工补充任务上下文。')

        plan = {
            'summary': task.get('description') or title,
            'goal': title,
            'target_files': unique_paths,
            'validation_steps': validation_steps,
            'next_actions': next_actions,
            'blockers': blockers,
            'notes': notes,
        }
        self.log_action('plan_task', {'task_id': task.get('id'), 'goal': title, 'targets': len(unique_paths)})
        return plan

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

    def get_next_task(self, statuses: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        """获取下一个待处理任务（按优先级）"""
        allowed_statuses = set(statuses or ['pending'])
        pending_tasks = [t for t in self.task_queue if t['status'] in allowed_statuses]
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

    def sync_user_requests(self) -> Dict[str, int]:
        """将用户请求同步为任务，并回写请求状态。"""
        requests = load_requests(self.workspace_dir)
        created = 0
        updated = 0

        for request in requests:
            request_id = int(request.get('id', 0) or 0)
            task_id = request.get('task_id')
            status = str(request.get('status') or 'pending')

            if status == 'pending' and not task_id:
                description = request.get('description', '').strip()
                acceptance = request.get('acceptance_criteria', '').strip()
                if acceptance:
                    description = f"{description}\n\n验收标准:\n{acceptance}".strip()
                task = self.ensure_task(
                    title=request.get('title', f'用户请求 {request_id}'),
                    description=description,
                    priority=int(request.get('priority', 3) or 3),
                )
                task_id = task['id']
                update_request(self.workspace_dir, request_id, status='queued', task_id=task_id)
                created += 1
                continue

            if not task_id:
                continue

            task = next((item for item in self.task_queue if int(item.get('id', 0) or 0) == int(task_id)), None)
            if not task:
                continue

            task_status = str(task.get('status') or '')
            next_status = None
            message = request.get('result_message', '')
            if task_status in {'pending', 'in_progress', 'ready'}:
                next_status = task_status
            elif task_status == 'completed':
                next_status = 'completed'
                message = 'Agent Team 已完成该请求。'
            elif task_status == 'failed':
                next_status = 'failed'
                message = task.get('details', {}).get('error') or 'Agent Team 执行失败。'

            if next_status and (next_status != status or message != request.get('result_message', '')):
                update_request(self.workspace_dir, request_id, status=next_status, result_message=message, task_id=task_id)
                updated += 1

        if created or updated:
            self.log_action('sync_user_requests', {'created': created, 'updated': updated})
        return {'created': created, 'updated': updated}

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
            'ready_tasks': len([t for t in self.task_queue if t['status'] == 'ready']),
            'completed_tasks': len([t for t in self.task_queue if t['status'] == 'completed']),
        }

    def _get_timestamp(self) -> str:
        """获取时间戳"""
        from datetime import datetime
        return datetime.now().isoformat()
