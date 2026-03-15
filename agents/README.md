# Agent Team 架构文档

## 概述

Agent Team 是一个由三个协作 AI Agent 组成的自动化开发系统，用于持续完善多模态数据湖项目。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Coordinator                        │
│                    (协调器 - 主控制器)                        │
└────────────┬────────────────┬────────────────┬──────────────┘
             │                │                │
    ┌────────▼────────┐ ┌────▼─────────┐ ┌───▼──────────┐
    │  Brain Agent    │ │  Code Agent  │ │  Test Agent  │
    │   (大脑)        │ │   (编码)     │ │   (测试)     │
    └────────┬────────┘ └────┬─────────┘ └───┬──────────┘
             │                │                │
             │    ┌───────────▼────────────┐   │
             │    │   Task Queue (任务队列) │   │
             └───►│   task_queue.json      │◄──┘
                  └────────────────────────┘
```

## 工作流程

### 1. 初始化阶段
```
Brain Agent 分析项目
    ↓
识别未实现功能
    ↓
创建任务队列
```

### 2. 执行循环
```
Brain Agent: 获取下一个任务
    ↓
Code Agent: 接收任务 → 实现代码 → 自验证
    ↓
Test Agent: 接收代码 → 生成测试 → 执行测试
    ↓
测试失败? → 是 → 打回 Code Agent (最多重试 3 次)
    ↓ 否
Test Agent: 生成优化建议
    ↓
Brain Agent: 评估建议 → 创建新任务
    ↓
标记任务完成 → 继续下一个任务
```

## 目录结构

```
agents/
├── __init__.py              # 模块导出
├── base_agent.py            # Agent 基类
├── brain_agent.py           # 大脑 Agent
├── code_agent.py            # 代码 Agent
├── test_agent.py            # 测试 Agent
├── agent_coordinator.py     # 协调器
├── start_agents.py          # 启动脚本
├── prompts/                 # 提示词模板
│   ├── brain_prompt.txt
│   ├── code_prompt.txt
│   └── test_prompt.txt
├── workspace/               # 工作空间（运行时生成）
│   ├── BrainAgent_history.json
│   ├── CodeAgent_history.json
│   └── TestAgent_history.json
└── tasks/                   # 任务队列（运行时生成）
    ├── task_queue.json
    └── task_history.json
```

## Agent 详细说明

### Brain Agent（大脑）

**职责：**
- 项目分析：扫描代码库，识别未实现功能
- 任务规划：将大功能分解为小任务
- 优先级管理：根据重要性排序任务
- 优化评估：评估测试 Agent 的建议

**核心方法：**
- `analyze_project()`: 分析项目现状
- `create_task()`: 创建新任务
- `get_next_task()`: 获取下一个待处理任务
- `update_task_status()`: 更新任务状态
- `evaluate_optimization()`: 评估优化建议

### Code Agent（编码）

**职责：**
- 接收任务：从 Brain Agent 获取任务
- 实现代码：编写功能代码
- 自验证：语法检查、导入验证
- 提交代码：发送给 Test Agent

**核心方法：**
- `receive_task()`: 接收任务
- `implement_code()`: 实现代码（调用 Claude API）
- `self_verify()`: 自验证代码

### Test Agent（测试）

**职责：**
- 接收代码：从 Code Agent 获取代码
- 生成测试：编写测试用例
- 执行测试：运行 pytest
- 分析失败：定位问题根源
- 提出建议：优化建议给 Brain Agent

**核心方法：**
- `receive_code()`: 接收代码
- `generate_test_cases()`: 生成测试用例
- `run_tests()`: 执行测试
- `analyze_failures()`: 分析失败原因
- `generate_optimization_suggestions()`: 生成优化建议

## 任务队列格式

```json
{
  "id": 1,
  "title": "实现用户管理系统",
  "description": "完整实现用户管理功能，包括后端 API 和前端界面",
  "priority": 3,
  "status": "pending",
  "assigned_to": null,
  "created_at": "2026-03-15T10:00:00",
  "updated_at": "2026-03-15T10:00:00"
}
```

**状态流转：**
- `pending` → `in_progress` → `completed`
- `pending` → `in_progress` → `failed`

## 启动方式

### 方式一：直接运行
```bash
python agents/start_agents.py
```

### 方式二：作为后台服务
```bash
nohup python agents/start_agents.py > agent_team.log 2>&1 &
```

### 方式三：集成到 FastAPI
```python
# 在 backend/main.py 中添加
from agents import AgentCoordinator

@app.on_event("startup")
async def start_agents():
    coordinator = AgentCoordinator(workspace_dir, api_key)
    threading.Thread(target=coordinator.start, args=(ROOT_DIR,), daemon=True).start()
```

## 配置

### 环境变量
```bash
# Claude API Key（必需）
export ANTHROPIC_API_KEY="sk-ant-..."

# 工作空间目录（可选）
export AGENT_WORKSPACE="/path/to/workspace"

# 最大重试次数（可选）
export AGENT_MAX_RETRY=3
```

## 监控和日志

### 日志文件
- `agent_team.log`: 主日志
- `agents/workspace/BrainAgent_history.json`: Brain Agent 历史
- `agents/workspace/CodeAgent_history.json`: Code Agent 历史
- `agents/workspace/TestAgent_history.json`: Test Agent 历史

### 状态查询
```python
coordinator = AgentCoordinator(workspace_dir, api_key)
status = coordinator.get_status()
print(status)
```

输出示例：
```json
{
  "running": true,
  "brain": {
    "agent": "BrainAgent",
    "total_tasks": 10,
    "pending_tasks": 5,
    "in_progress_tasks": 1,
    "completed_tasks": 4
  },
  "code": {
    "agent": "CodeAgent",
    "current_task": "实现用户管理系统",
    "task_status": "in_progress"
  },
  "test": {
    "agent": "TestAgent",
    "total_test_runs": 8,
    "total_tests": 45,
    "total_passed": 42,
    "pass_rate": 93.33
  }
}
```

## 扩展和定制

### 添加新的 Agent
1. 继承 `BaseAgent` 类
2. 实现 `process()` 和 `get_status()` 方法
3. 在 `AgentCoordinator` 中注册

### 自定义任务优先级
修改 `BrainAgent.get_next_task()` 的排序逻辑

### 集成其他 LLM
修改各 Agent 的 `__init__()` 方法，替换 `Anthropic` 客户端

## 注意事项

1. **API 配额**：Claude API 有调用限制，注意控制频率
2. **错误处理**：Agent 应该能够从错误中恢复
3. **任务粒度**：每个任务应该足够小，避免超时
4. **测试覆盖**：确保测试用例覆盖边界情况
5. **代码审查**：Agent 生成的代码需要人工审查

## 未来优化

- [ ] 支持并行任务处理
- [ ] 添加任务依赖管理
- [ ] 集成代码审查 Agent
- [ ] 支持多种 LLM 后端
- [ ] 添加 Web 管理界面
- [ ] 实现任务回滚机制
