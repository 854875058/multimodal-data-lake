<div align="center">

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a>
</p>

<img src="docs/readme-assets/hero-banner.svg" width="100%" alt="Multimodal Data Lake Banner" />

# Multimodal Data Lake

### Enterprise-Grade Multimodal Data Lakehouse Intelligent Operations Platform

**One Platform to Rule Them All** — Ingest, Index, Search, Govern, Orchestrate, Operate, and AI, all in one place.

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![LanceDB](https://img.shields.io/badge/LanceDB-Vector_Lake-FF6B00?style=for-the-badge)](https://lancedb.com/)
[![Ray](https://img.shields.io/badge/Ray-Distributed-8A2BE2?style=for-the-badge)](https://ray.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>

[Quick Start](#-quick-start) · [Capabilities](#-capability-panorama) · [Architecture](#-architecture) · [API](#-api-surface) · [Deployment](#-deployment)

</div>

---

## Why Multimodal Data Lake?

> **This is not a demo. This is a platform.**

Traditional approaches have pain points:
- Data scattered across systems in various formats
- Vector search, SQL queries, and file management operate in silos
- Workflow orchestration relies on manual stitching, with low operator reuse
- Lake operations and data governance are two separate interfaces

**Multimodal Data Lake unifies everything into a single platform.**

<div align="center">
<img src="docs/readme-assets/capability-radar.svg" width="600" alt="Capability Radar" />
</div>

---

## Capability Panorama

<div align="center">

| 🏗️ Data Ingestion | 🔍 Unified Search | ⚡ Workflow Orchestration | 🛡️ Data Governance |
|:---:|:---:|:---:|:---:|
| Local Upload · Directory Scan | SQL · Vector · Multimodal | DAG Canvas · Operator Hub | Asset Catalog · Version Rollback |
| Source Ingestion · Batch Tasks | AI Copilot · RAG | Template Library · Task Center | Compaction · Governance View |

| 🤖 AI Capabilities | 🏭 Lake Operations | 👥 Access Control | 📊 Multimodal Topics |
|:---:|:---:|:---:|:---:|
| BGE · CLIP · Whisper | MPP · Doris · SQL Editor | RBAC · User Management | Auto Labeling · Detection Tracking |
| DeepSeek · Agent Team | Alert Monitoring · Auto Patrol | System Logs · Audit | Review Checklist · Topic Datasets |

</div>

---

## Architecture

<div align="center">
<img src="docs/readme-assets/architecture.svg" width="800" alt="Architecture Diagram" />
</div>

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React 18 + Arco Design                     │
│   Lake Overview · Lake Query · Lake Compute · Lake Storage          │
│   Lake Governance · Lake Ops · System Config · Admin                │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          FastAPI Backend                            │
│                                                                     │
│   upload    search    files     dashboard    workbench              │
│   platform  operators versions  users        permissions            │
│   ray       doris     mpp      agents       multimodal             │
└────────────────┬────────────────────────────┬───────────────────────┘
                 │                            │
                 ▼                            ▼
┌────────────────────────────────┐  ┌────────────────────────────────┐
│         Storage Layer          │  │        AI / Compute            │
│                                │  │                                │
│   SeaweedFS / S3 Object Store  │  │   BGE / CLIP / Whisper         │
│   LanceDB Vector Lake          │  │   DeepSeek / Local Models      │
│   SQLite Metadata              │  │   Ray Distributed Compute      │
│   Doris Federated Query        │  │   Agent Team Collaboration     │
└────────────────────────────────┘  └────────────────────────────────┘
```

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/854875058/multimodal-data-lake.git
cd multimodal-data-lake
```

### 2. Create Python Environment

```bash
conda create -n multimodal-lake python=3.11 -y
conda activate multimodal-lake
pip install "numpy<2.0"
pip install -r requirements.txt
```

### 3. Build Frontend

```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Configure

```bash
cp .env.example .env
# Edit .env with your S3, LanceDB, DeepSeek connection info
```

### 5. Start Platform

```bash
python start.py start
```

<div align="center">

| Entry | URL |
|:---:|:---:|
| 🖥️ Homepage | `http://127.0.0.1:27843/` |
| ⚡ Workflow Studio | `http://127.0.0.1:27843/workflow` |
| 📚 API Docs | `http://127.0.0.1:27843/docs` |
| ❤️ Health Check | `http://127.0.0.1:27843/api/health` |

</div>

Common commands:

```bash
python start.py status    # Check status
python start.py restart   # Restart service
python start.py stop      # Stop service
```

---

## Functional Surfaces

### 🏠 Lake Overview
- Real-time Dashboard monitoring
- Asset catalog and file browsing
- Modality distribution, trend analysis, knowledge graph

### 🔍 Lake Query
- SQL query editor
- Unified search (keyword + semantic)
- Vector / multimodal / hybrid search
- AI data copilot

### ⚡ Lake Compute
- **Visual Workflow Canvas** — Drag-and-drop DAG orchestration
- Operator Hub — 10+ built-in operators, custom extensions
- Template Library — Preset workflows with one-click loading
- Task Center — Job instance management

### 📦 Lake Storage
- Local upload and batch scanning
- Source ingestion and auto-indexing
- Lance dataset management

### 🛡️ Lake Governance
- Asset catalog and governance view
- Version statistics, history, rollback
- Compaction management suggestions

### 🏭 Lake Operations
- MPP cluster management
- SQL editor and Doris external tables
- Alert monitoring and auto patrol

### 👥 System Config
- User management and RBAC permissions
- System logs and audit
- LLM model configuration

### 🤖 AI Agent Team
- BrainAgent — Task analysis and decomposition
- CodeAgent — Code generation
- TestAgent — Test validation
- AgentCoordinator — Collaborative orchestration

---

## Workflow Studio

<div align="center">
<img src="docs/readme-assets/workflow-studio.svg" width="800" alt="Workflow Studio" />
</div>

**Core Features:**
- 🎨 Visual DAG canvas with drag-and-drop node orchestration
- 🔗 Drag-to-connect edges with real-time data flow preview
- 📝 Inline node parameter configuration
- 🤖 LLM model selector
- 🔍 Canvas zoom + minimap navigation
- 📦 Preset template one-click loading
- ⚡ Ray Job preview and execution

**Built-in Operators:**

| Operator | Type | Function |
|:---|:---:|:---|
| Regex Privacy Masking | Transform | Mask phone, email, ID card and other privacy fields |
| Text Length Splitting | Transform | Split long texts by specified length with overlap |
| Hash Deduplication | Transform | Deduplicate by content hash (MD5/SHA256) |
| CSV to JSON | Convert | Convert CSV files to JSON arrays line by line |
| Keyword Filtering | Filter | Filter files by keywords (include/exclude mode) |
| Small File Merge | Merge | Merge multiple small files into one |
| Metadata Extraction | Analyze | Extract file line count, char count, type metadata |
| PPT to Markdown | Convert | Convert PPT/PPTX to Markdown (staged) |
| Video Privacy Blur | Enhance | Blur privacy regions in video frames (staged) |
| Video Redundancy Filter | Enhance | Remove redundant frames (staged) |

---

## Tech Stack

<div align="center">

### Frontend
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Arco Design](https://img.shields.io/badge/Arco_Design-UI-165DFF)
![ECharts](https://img.shields.io/badge/ECharts-Visualization-AA3496)

### Backend
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-v2-E92063)
![Uvicorn](https://img.shields.io/badge/Uvicorn-ASGI-4D7FD0)

### Storage & Query
![LanceDB](https://img.shields.io/badge/LanceDB-Vector-FF6B00)
![SQLite](https://img.shields.io/badge/SQLite-Metadata-003B57?logo=sqlite&logoColor=white)
![SeaweedFS](https://img.shields.io/badge/SeaweedFS-Object-2E8B57)
![Doris](https://img.shields.io/badge/Doris-MPP-1E90FF)

### AI & Compute
![Ray](https://img.shields.io/badge/Ray-Distributed-8A2BE2)
![Sentence Transformers](https://img.shields.io/badge/Sentence_Transformers-NLP-FF6F00)
![CLIP](https://img.shields.io/badge/CLIP-Multimodal-4169E1)
![Whisper](https://img.shields.io/badge/Whisper-Audio-FF4500)

</div>

---

## Supported Data Types

| Type | Formats |
|:---|:---|
| 📄 Text | `txt` `md` `log` `csv` `json` `jsonl` |
| 📑 Documents | `pdf` `docx` `pptx` |
| 📊 Spreadsheets | `xlsx` `xls` `csv` |
| 💻 Code | `py` `js` `ts` `java` `go` `html` `xml` `yaml` `sql` |
| 🖼️ Images | `jpg` `jpeg` `png` `gif` `bmp` `webp` |
| 🎵 Audio | `mp3` `wav` `m4a` |
| 🎬 Video | `mp4` `avi` `mov` |
| 📦 Archives | `zip` `tar` `gz` `tgz` |

---

## API Surface

| Module | Path | Description |
|:---|:---|:---|
| 📤 Ingestion | `/api/upload` | File upload, batch ingestion, ETL |
| 🔍 Search | `/api/search` | Unified search, vector search, multimodal query |
| 📁 Files | `/api/files` | File assets, preview, content access |
| 📊 Dashboard | `/api/dashboard` | Statistics, trends, graph |
| 🔧 Workbench | `/api/workbench` | Settings, scan, indexing, tasks |
| ⚙️ Platform | `/api/platform` | Component status, external tables, config, LLM |
| ⚡ Operators | `/api/operators` | Operator registration, validation, execution |
| 📜 Versions | `/api/versions` | Version stats, rollback, compaction |
| 👤 Users | `/api/users` | Login, registration, management |
| 🔐 Permissions | `/api/permissions` | RBAC role permissions |
| 📡 System | `/api/system` | Status, resources, logs |
| 🚀 Ray | `/api/ray` | Distributed compute orchestration |
| 🏭 Doris | `/api/doris` | Cluster and external table capabilities |
| 🔄 MPP | `/api/mpp` | Proxy and forwarding |
| 🤖 Agent | `/api/agents` | Multi-agent collaboration |
| 🎭 Multimodal | `/api/multimodal` | Topics, labeling, tracking |

---

## Repository Layout

```
multimodal-data-lake/
├── frontend/                    # React 18 + Vite 7 frontend
│   └── src/
│       ├── pages/               # Business pages (20+ pages)
│       ├── components/          # Components (incl. workflow canvas)
│       ├── api/                 # API client
│       └── auth/                # Auth state management
├── backend/
│   ├── api/                     # FastAPI route modules (16+)
│   └── operators_migrated/      # Migrated operators (10)
├── agents/                      # Multi-agent collaboration
├── docs/                        # Documentation and assets
├── tests/                       # pytest tests
├── etl.py                       # ETL main process
├── models_loader.py             # Model and LanceDB access
├── multimodal_store.py          # Multimodal topic storage
├── database.py                  # SQLite metadata
├── config.py                    # Global configuration
└── start.py                     # Single entry startup script
```

---

## Typical Scenarios

### 📚 Scenario 1: Enterprise Data Unified Ingestion & Search

> Scattered data, mixed formats, heavy legacy?

- Unified ingestion of PDF, Word, PPT, images, audio/video
- Automatic extraction, chunking, vectorization, indexing
- Unified keyword + semantic search entry
- Unified foundation for Q&A, copilot, governance

### 🛡️ Scenario 2: Multimodal Asset Governance & Version Tracking

> Lots of assets, but lacking version governance?

- Catalog / Schema / Table unified view
- Lance dataset version stats, rollback, compaction
- Governance ledger replaces "memory-based" asset management

### ⚡ Scenario 3: Workflow Orchestration & Task Execution

> Long processes, manual stitching, low operator reuse?

- DAG canvas drag-and-drop orchestration
- Template library, job instances, task center
- Ray distributed compute integration

### 🏭 Scenario 4: Lakehouse Query & Operations

> Data in the lake, queries in the warehouse, ops in multiple systems?

- Doris external tables + MPP proxy + SQL editor
- Alert monitoring + auto patrol + system logs
- Ops and governance no longer siloed

### 🎭 Scenario 5: Multimodal Topics & Auto Labeling

> Detection, review, tracking, labeling?

- Topic dataset management
- Automated labeling tasks
- Detection tracking and review checklists

---

## Positioning

<div align="center">

> **Multimodal Data Lake is an enterprise-grade multimodal data lakehouse operations platform**
> **that unifies data ingestion, content parsing, vectorization, unified search, asset governance,**
> **workflow orchestration, MPP/Doris operations, access control, and AI Agent collaboration.**
>
> **It's not a point solution demo — it's a complete prototype of a platform-level control plane.**

</div>

---

## Contributing

Contributions welcome! Please follow this process:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE)

---

<div align="center">

**Built with ❤️ by the Multimodal Data Lake Team**

[![Star History Chart](https://api.star-history.com/svg?repos=854875058/multimodal-data-lake&type=Date)](https://star-history.com/#854875058/multimodal-data-lake&Date)

</div>
