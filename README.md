<div align="center">

# Multimodal Data Lake

**多模态数据湖统一管理平台**

*Unified storage, retrieval, and intelligence platform for text, images, audio, and video*

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Vector_DB-FF6B00)](https://lancedb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Overview

企业数据资产日益多模态化，文本、图像、音频、视频散落在不同系统中，传统数据湖方案只能处理结构化数据，无法实现跨模态语义检索。

本平台构建了从 **数据入湖** → **向量化处理** → **跨模态检索** → **知识图谱抽取** 的完整链路。通过 BGE（文本）、CLIP（图像）、Whisper（音频）三大模型统一向量空间，结合 LanceDB 向量存储与 SeaweedFS 对象存储，实现真正的多模态统一管理。

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                     │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  数据入湖 │ 语义检索  │ 知识图谱  │ 数据看板  │   系统管理      │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│              FastAPI Backend (ETL + Search + Auth)            │
├─────────────────────────────────────────────────────────────┤
│    SeaweedFS (Object)  │  LanceDB (Vector)  │ SQLite (Meta) │
└─────────────────────────────────────────────────────────────┘
```

## Key Features

### Multi-Format ETL Pipeline
支持 10+ 文件格式的自动化入湖处理：PDF、Word、PPT、Excel、图片、音频、视频、压缩包等。上传即自动识别格式、提取内容、生成向量嵌入，存入 LanceDB。

### Cross-Modal Semantic Search
基于 BGE（文本）+ CLIP（图像）统一向量空间，支持文本搜图、图搜图、语义关键词混合检索。单次查询即可跨越文本、图像、音频三种模态返回结果。

### Knowledge Graph Extraction
集成 DeepSeek LLM 从文档中自动抽取实体与关系，构建领域知识图谱。支持停用词过滤、实体类型归一化、关系去重。

### AI Agent Team
内置多智能体协作系统：BrainAgent（分析规划）→ CodeAgent（代码生成）→ TestAgent（测试验证），由 AgentCoordinator 统一编排。

### Data Visualization Dashboard
基于 ECharts 的数据看板，实时展示入湖统计、模态分布、存储用量、检索热度等核心指标。

## Tech Stack

```
Frontend                          Backend                         Data Layer
─────────────────                 ─────────────────               ─────────────────
React 18 + Vite                   FastAPI 0.104+                  SeaweedFS (S3 Object)
React Router (SPA)                Uvicorn (ASGI)                  LanceDB 0.4+ (Vector)
ECharts (Visualization)           Pydantic v2 (Validation)        SQLite (Metadata)
Axios (HTTP Client)               JWT + Passlib (Auth)

AI Models                         Document Processing
─────────────────                 ─────────────────
BGE (Text Embedding)              pypdf / python-docx
CLIP (Image Embedding)            python-pptx / openpyxl
Whisper (Audio → Text)            Pillow / pdf2image
DeepSeek (Knowledge Graph)        pandas (Tabular)
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐  │
│  │ Upload   │ │  Search  │ │Knowledge │ │Dashboard │ │ Admin │  │
│  │ Workbench│ │  Engine  │ │  Graph   │ │  Stats   │ │ Users │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬───┘  │
│       └─────────────┴────────────┴─────────────┴───────────┘      │
├──────────────────────────────────────────────────────────────────┤
│                      FastAPI Backend (:8090)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐  │
│  │ ETL      │ │ Hybrid   │ │ KG       │ │ Dashboard│ │ Auth  │  │
│  │ Pipeline │ │ Search   │ │ Extract  │ │ Stats    │ │ RBAC  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬───┘  │
├───────┼─────────────┼────────────┼─────────────┼───────────┼──────┤
│  ┌────▼─────┐  ┌────▼─────┐ ┌───▼────┐  ┌─────▼────┐ ┌───▼────┐ │
│  │SeaweedFS │  │ LanceDB  │ │DeepSeek│  │  SQLite  │ │  JWT   │ │
│  │ (S3)     │  │ (Vector) │ │ (LLM)  │  │ (Meta)   │ │ (Auth) │ │
│  └──────────┘  └──────────┘ └────────┘  └──────────┘ └────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/854875058/multimodal-data-lake.git
cd multimodal-data-lake

# 2. Install dependencies
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..

# 3. Configure
# Edit config.py: set S3 endpoint, API keys, model paths

# 4. Start
python start.py
# Backend + Frontend → http://localhost:8090
# API Docs → http://localhost:8090/docs
```

## Project Structure

```
multimodal-data-lake/
├── frontend/                        # React + Vite UI
│   └── src/
│       ├── pages/                   # Dashboard, Search, Upload, Files
│       ├── components/              # Reusable UI components
│       ├── api/                     # API client wrappers
│       └── auth/                    # JWT session management
├── backend/
│   ├── main.py                      # FastAPI entry point
│   └── api/
│       ├── upload.py                # File ingestion & ETL
│       ├── search.py                # Vector + keyword hybrid search
│       ├── files.py                 # File asset management
│       ├── dashboard.py             # Statistics & visualization
│       ├── users.py                 # User management
│       └── permissions.py           # RBAC access control
├── agents/                          # AI Agent Team
│   ├── brain_agent.py               # Analysis & planning
│   ├── code_agent.py                # Code generation
│   ├── test_agent.py                # Testing & validation
│   └── agent_coordinator.py         # Multi-agent orchestration
├── config.py                        # Global configuration
├── database.py                      # SQLite schema & helpers
├── etl.py                           # ETL pipeline (core logic)
├── models_loader.py                 # AI model lazy loading
├── knowledge_graph_extractor.py     # Entity/relation extraction
├── requirements.txt                 # Python dependencies
└── start.py                         # One-click startup
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | 文件上传 & ETL 入湖 |
| `GET` | `/search` | 跨模态语义检索 |
| `GET` | `/files` | 文件资产列表 |
| `GET` | `/dashboard/stats` | 看板统计数据 |
| `POST` | `/users` | 用户管理 |
| `GET` | `/system/logs` | 系统日志查看 |
| `POST` | `/workbench/ingest` | 批量入湖工作台 |
| `GET` | `/api/health` | 健康检查 |

## License

MIT
