# Multimodal Data Lake | 多模态数据湖统一管理平台

> 一站式多模态数据湖解决方案，支持文本、图像、音视频的统一入湖、向量检索与 AI 驱动的自动化运维。

[![Python](https://img.shields.io/badge/Python-3.10+-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB)](https://react.dev)
[![LanceDB](https://img.shields.io/badge/LanceDB-0.4+-orange)](https://lancedb.com)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Features | 功能特性

**湖管理 (Lake Management)**
- 多模态文件上传（文档/图像/音视频/压缩包），自动 ETL 入湖
- 向量化存储：文本用 BGE 嵌入，图像用 CLIP，音频用 Whisper 转录后嵌入
- 语义搜索 + 关键词混合检索，支持跨模态查询

**湖计算 (Lake Compute)**
- 知识图谱抽取（基于 DeepSeek LLM）
- 文本分块与向量索引（LanceDB on SeaweedFS S3）
- 数据统计看板（ECharts 可视化）

**系统配置 (System Config)**
- S3/SeaweedFS 存储连接配置
- 用户管理与权限控制（JWT 认证）
- 实时日志查看与系统监控

**Agent Team**
- BrainAgent：项目分析与任务规划
- CodeAgent：自动代码生成与修改
- TestAgent：自动测试与验收
- AgentCoordinator：多 Agent 协作调度

---

## Architecture | 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React + Vite)                 │
│        ECharts Dashboard │ Search UI │ Upload Workbench  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP / REST
┌───────────────────────▼─────────────────────────────────┐
│                   Backend (FastAPI)                      │
│  /upload  /search  /files  /dashboard  /system  /users  │
└──────┬──────────────┬──────────────────┬────────────────┘
       │              │                  │
┌──────▼──────┐ ┌─────▼──────┐ ┌────────▼────────┐
│   LanceDB   │ │ SeaweedFS  │ │   AI Models     │
│ text/image  │ │  S3 对象   │ │ BGE / CLIP /    │
│ /files 表   │ │   存储     │ │ Whisper / DS    │
└─────────────┘ └────────────┘ └─────────────────┘
                        │
        ┌───────────────▼──────────────────┐
        │           Agent Team             │
        │  Brain → Code → Test (协调调度)  │
        └──────────────────────────────────┘
```

---

## Tech Stack | 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18, Vite, React Router, ECharts |
| 后端 | FastAPI, Uvicorn, Pydantic v2 |
| 向量存储 | LanceDB >= 0.4, PyArrow |
| 对象存储 | SeaweedFS (S3 兼容), boto3 |
| AI 模型 | sentence-transformers (BGE), CLIP, Whisper, DeepSeek |
| 文档解析 | pypdf, python-docx, python-pptx, pandas, Pillow |
| 认证 | JWT (python-jose), passlib/bcrypt |
| Agent | 自研 BrainAgent / CodeAgent / TestAgent |

---

## Directory Structure | 目录结构

```
multimodal-data-lake/
├── frontend/               # React + Vite 前端
│   ├── src/
│   │   ├── pages/          # 页面组件（Dashboard、Search、Upload 等）
│   │   ├── components/     # 公共组件
│   │   ├── api/            # 前端 API 封装
│   │   └── views/          # 视图层
│   └── vite.config.js
├── backend/                # FastAPI 后端
│   ├── main.py             # 应用入口
│   └── api/                # 路由模块
│       ├── upload.py       # 文件上传 & ETL
│       ├── search.py       # 向量/关键词检索
│       ├── files.py        # 文件资产管理
│       ├── dashboard.py    # 统计看板
│       ├── system.py       # 系统监控
│       ├── workbench.py    # 接入工作台
│       ├── users.py        # 用户管理
│       └── permissions.py  # 权限控制
├── agents/                 # Agent Team
│   ├── brain_agent.py
│   ├── code_agent.py
│   ├── test_agent.py
│   ├── agent_coordinator.py
│   └── start_agents.py
├── config.py               # 全局配置（S3、模型、路径）
├── database.py             # LanceDB 表初始化
├── etl.py                  # ETL 管道
├── models_loader.py        # AI 模型懒加载
├── requirements.txt
└── start.py                # 一键启动脚本
```

---

## Quick Start | 快速开始

### 1. 安装依赖

```bash
# Python 依赖
pip install -r requirements.txt

# 前端依赖
cd frontend && npm install && cd ..
```

### 2. 配置环境变量

复制并编辑环境变量（见 [环境变量配置](#env-config)）：

```bash
export S3_ENDPOINT_URL=http://your-seaweedfs:8333
export S3_ACCESS_KEY=your_key
export S3_SECRET_KEY=your_secret
export S3_BUCKET_NAME=demo-bucket
export DEEPSEEK_API_KEY=sk-xxxxxxxx
```

### 3. 启动服务

```bash
# 方式一：开发模式一键启动（后端 + 前端）
python start.py --dev

# 方式二：按项目约定分别启动
python backend/main.py
cd frontend && npm run dev

# 方式三：生产模式（前端构建后由后端直接提供）
cd frontend && npm run build && cd ..
python backend/main.py
```

开发模式访问 `http://localhost:3000`，生产模式访问 `http://127.0.0.1:8090`。

---

## API Reference | 接口一览

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/upload` | 上传文件并触发 ETL 入湖 |
| GET | `/api/search` | 语义/关键词混合检索 |
| GET | `/api/files` | 文件资产列表 |
| DELETE | `/api/files/{id}` | 删除文件 |
| GET | `/api/dashboard/stats` | 统计看板数据 |
| GET | `/api/system/logs` | 实时日志 |
| GET | `/api/system/status` | 系统状态 |
| GET | `/api/workbench/settings` | 获取工作台接入配置 |
| POST | `/api/workbench/settings` | 保存工作台接入配置 |
| POST | `/api/workbench/test-connection` | 测试 S3 / SFTP 来源连接 |
| POST | `/api/workbench/scan` | 扫描来源对象或目录 |
| POST | `/api/workbench/jobs` | 创建批量接入任务 |
| GET | `/api/workbench/jobs` | 获取工作台任务列表 |
| POST | `/api/workbench/build-index` | 构建向量索引 |
| POST | `/api/users/login` | 用户登录（JWT） |
| GET | `/api/users/me` | 当前用户信息 |
| GET | `/api/platform/info` | 平台信息 |

完整 Swagger 文档：http://localhost:8090/docs

---

## Agent Team | 智能体团队

Agent Team 是内置的 AI 自动化运维模块，由三个专职 Agent 组成，通过 `AgentCoordinator` 协调运行。

| Agent | 职责 |
|-------|------|
| BrainAgent | 分析项目现状，识别缺失功能，生成任务列表 |
| CodeAgent | 根据任务描述自动生成/修改代码 |
| TestAgent | 对生成代码执行自动化测试与验收 |

启动 Agent Team：

```bash
python agents/start_agents.py
```

---

## Environment Variables | 环境变量配置 {#env-config}

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `S3_ENDPOINT_URL` | `http://192.168.20.4:8333` | SeaweedFS S3 网关地址 |
| `S3_ACCESS_KEY` | `mykey` | S3 访问密钥 |
| `S3_SECRET_KEY` | `mysecret` | S3 密钥 |
| `S3_BUCKET_NAME` | `demo-bucket` | 原始文件桶名 |
| `S3_LANCE_PREFIX` | `lance_lake` | LanceDB 在 S3 中的前缀 |
| `DEEPSEEK_API_KEY` | — | DeepSeek LLM API Key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek 接口地址 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 使用的模型名 |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3000` | 允许的跨域来源 |
| `BACKEND_RELOAD` | `false` | 开发模式热重载 |

---

## Contributing | 贡献指南

1. Fork 本仓库，基于 `master` 创建特性分支：`git checkout -b feat/your-feature`
2. 遵循项目编码规范，修改前先描述方案
3. 确保新增代码通过自验收（`python -c "import ast; ast.parse(...)"` + 冒烟测试）
4. 提交信息格式：`feat: 简短描述` / `fix: 简短描述`
5. 提交 Pull Request，描述改动内容与测试结果

---

*Built with FastAPI + React + LanceDB | Last updated: 2026-03-15*
