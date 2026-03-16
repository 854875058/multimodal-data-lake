# DataVerse Pro 部署运维手册

## 1. 系统简介

DataVerse Pro 是一个**多模态数据湖平台**，支持将本地文件（文本、文档、图片、音视频、压缩包等）统一转换为 Lance 列式格式存储，并提供向量检索、文件管理、数据看板等功能。

### 核心能力

| 能力 | 说明 |
|------|------|
| 文件接入 | 支持上传 20+ 种格式：PDF/Word/PPT/Excel/TXT/图片/音视频/压缩包等 |
| 文本向量化 | 使用 `bge-small-zh-v1.5` 对文本切片做向量嵌入，存入 LanceDB |
| 图像向量化 | 使用 `CLIP ViT-B/32` 对图片/PDF 页面做视觉嵌入 |
| 语音转录 | 使用 OpenAI Whisper 将音视频转为文本再向量化 |
| 向量搜索 | 支持文本搜索、以文搜图（跨模态检索） |
| 知识图谱 | 调用 DeepSeek LLM 从文本中自动抽取实体 |
| 对象存储 | 原始文件上传到 S3 兼容存储（SeaweedFS），LanceDB 数据也存于 S3 |
| 数据看板 | 文件统计、任务趋势、类型分布、系统监控 |

### 技术架构

```
                    +------------------+
                    | 浏览器 (React 18) |
                    | React Router     |
                    |   ECharts        |
                    +--------+---------+
                             |
                    HTTP :3000 (开发) / :8090 (生产)
                             |
                    +--------+---------+
                    |  FastAPI 后端     |
                    |  端口: 8090       |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
        +-----+----+  +-----+----+  +------+-----+
        | LanceDB  |  |  SQLite  |  | S3/SeaweedFS|
        | (向量库)  |  | (元数据)  |  | (文件存储)   |
        +----------+  +----------+  +-------------+
```

## 2. 目录结构

```
项目根目录/
  backend/               # 后端 API
    main.py              #   FastAPI 入口，端口 8090
    api/
      upload.py          #   文件上传 API
      search.py          #   向量搜索 API
      files.py           #   文件管理 API (列表/预览/删除)
      dashboard.py       #   仪表盘统计 API
      system.py          #   系统监控 API (CPU/内存/日志)
  frontend/              # 前端 (React + Vite)
    src/
      pages/
        DashboardPage.jsx         #   平台总览
        IngestionWorkbenchPage.jsx #  接入工作台
        UploadPage.jsx            #   文件上传
        SearchPage.jsx            #   向量搜索
        FilesPage.jsx             #   文件管理
        LogsPage.jsx              #   应用日志
      api/index.js       #   API 封装 (axios)
      App.jsx            #   控制台壳层
      main.jsx           #   前端入口
    dist/                #   构建产物（生产模式由后端提供）
  config.py              # 全局配置（路径、S3、LLM、分块参数）
  database.py            # SQLite 操作（文件注册、任务统计、实体存储）
  etl.py                 # ETL 管道（内容提取、向量化、入库）
  models_loader.py       # AI 模型加载 + LanceDB 表管理
  stats_service.py       # 看板统计查询
  s3_utils.py            # S3 工具函数
  start.py               # 跨平台 Python 启动脚本
  deploy.sh              # Linux 自动化运维脚本
  requirements.txt       # Python 依赖清单
  user_data.db           # SQLite 数据库文件（运行时生成）
  app.log                # 应用日志文件（运行时生成）
```

## 3. 环境要求

### 硬件最低要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 4 核 | 8 核+ |
| 内存 | 8 GB | 16 GB+ |
| 磁盘 | 50 GB | 200 GB+ SSD |
| GPU | 无（用 CPU 推理） | NVIDIA GPU 8GB+ 显存（大幅加速模型推理） |

### 软件依赖

| 软件 | 版本要求 | 用途 |
|------|---------|------|
| Python | >= 3.9 | 后端运行环境 |
| Node.js | >= 18 | 前端构建 |
| npm | >= 9 | 前端包管理 |
| ffmpeg | 任意 | 音视频转录（Whisper 依赖） |
| poppler-utils | 任意 | PDF 转图片（pdf2image 依赖） |
| NVIDIA Driver + CUDA | 可选 | GPU 加速 |

### 外部服务依赖

| 服务 | 说明 | 配置项 |
|------|------|--------|
| S3 兼容存储 (SeaweedFS) | 存放原始文件和 LanceDB 数据 | `config.py` 中的 `S3_CONFIG` |
| DeepSeek API (可选) | 知识图谱实体抽取 | `config.py` 中的 `DEEPSEEK_API_KEY` |

## 4. 部署指南

### 4.1 Linux 首次部署（推荐）

```bash
# 1. 克隆代码
git clone <仓库地址> dataverse-pro
cd dataverse-pro

# 2. 一键部署（安装依赖 + 构建前端 + 创建 systemd 服务）
bash deploy.sh install

# 3. 启动服务
bash deploy.sh start
# 或使用 systemd:
sudo systemctl start dataverse-pro

# 4. 验证
bash deploy.sh health
```

### 4.2 Windows 部署

```powershell
# 1. 安装 Python 依赖
pip install -r requirements.txt

# 2. 安装前端依赖 + 构建
cd frontend
npm install
npm run build
cd ..

# 3. 启动（选一种）
python start.py --production    # 生产模式
python start.py --dev           # 开发模式（前后端分离）
python start.py --backend       # 仅后端

# 或按项目约定从仓库根直接启动后端
python backend/main.py
```

### 4.3 配置说明

所有配置集中在 `config.py`，支持环境变量覆盖：

```bash
# S3 对象存储
export S3_ENDPOINT_URL=http://192.168.20.4:8333
export S3_ACCESS_KEY=mykey
export S3_SECRET_KEY=mysecret
export S3_BUCKET_NAME=demo-bucket

# LLM 实体抽取（可选）
export DEEPSEEK_API_KEY=sk-xxx
export DEEPSEEK_BASE_URL=https://api.deepseek.com
export DEEPSEEK_MODEL=deepseek-chat
```

可在 systemd 服务文件中配置环境变量：

```bash
sudo vim /etc/systemd/system/dataverse-pro.service
# 取消 Environment= 行的注释并填入实际值
sudo systemctl daemon-reload
sudo systemctl restart dataverse-pro
```

## 5. 运维操作

### 5.1 日常命令速查

```bash
bash deploy.sh start       # 启动服务
bash deploy.sh stop        # 停止服务
bash deploy.sh restart     # 重启服务
bash deploy.sh status      # 查看状态 + 健康检查
bash deploy.sh logs        # 查看实时日志 (tail -f)
bash deploy.sh health      # 仅健康检查
bash deploy.sh build       # 重新构建前端
bash deploy.sh update      # git pull + 重新部署
bash deploy.sh dev         # 开发模式（前后端分离，热更新）
```

### 5.2 systemd 管理（生产推荐）

```bash
sudo systemctl start dataverse-pro      # 启动
sudo systemctl stop dataverse-pro       # 停止
sudo systemctl restart dataverse-pro    # 重启
sudo systemctl status dataverse-pro     # 状态
journalctl -u dataverse-pro -f          # 实时日志
journalctl -u dataverse-pro --since "1 hour ago"  # 最近1小时日志
```

### 5.3 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 8090 | FastAPI 后端 | API 接口 + 生产模式前端静态文件 |
| 3000 | Vite 开发服务 | 仅开发模式，自动代理 /api 到 8090 |

### 5.4 数据备份

```bash
# SQLite 元数据库
cp user_data.db user_data.db.bak

# 应用日志
cp app.log app.log.bak

# LanceDB 数据存储在 S3 上，备份需操作 S3 存储
# 如果使用本地 LanceDB，备份 lance_lake/ 目录
```

### 5.5 日志清理

```bash
# 清空应用日志（不影响运行）
> app.log

# 清理临时上传文件
rm -rf temp_uploads/*
rm -rf temp_extracted/*
```

## 6. API 接口一览

后端启动后访问 `http://<IP>:8090/docs` 查看完整 Swagger 文档。

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/upload/batch` | POST | 批量上传文件 |
| `/api/search/` | POST | 向量搜索（文本/图像模式） |
| `/api/files/list` | GET | 文件列表（分页） |
| `/api/files/preview/{hash}` | GET | 文件预览 |
| `/api/files/{hash}` | DELETE | 删除文件 |
| `/api/dashboard/stats` | GET | 仪表盘核心指标 |
| `/api/dashboard/trend` | GET | 接入趋势（近N天） |
| `/api/dashboard/file-types` | GET | 文件类型分布 |
| `/api/dashboard/entities` | GET | 知识图谱实体 |
| `/api/system/resources` | GET | CPU/内存使用 |
| `/api/system/status` | GET | 系统整体状态（模型+LanceDB+资源） |
| `/api/system/logs` | GET | 应用日志内容 |
| `/api/workbench/settings` | GET/POST | 工作台配置读取与保存 |
| `/api/workbench/test-connection` | POST | 测试来源连接 |
| `/api/workbench/scan` | POST | 扫描来源对象或目录 |
| `/api/workbench/jobs` | GET/POST | 工作台任务列表与任务创建 |
| `/api/workbench/build-index` | POST | 构建向量索引 |

## 7. 故障排查

### 7.1 后端无法启动

```bash
# 查看日志
tail -100 app.log

# 常见原因:
# 1. 端口被占用
lsof -i :8090
# 解决: kill 占用进程或修改 backend/main.py 中的端口

# 2. Python 依赖缺失
source venv/bin/activate
pip install -r requirements.txt

# 3. S3 连接失败（会有 warning 但不阻塞启动）
# 检查 S3 服务是否可达
curl http://192.168.20.4:8333
```

### 7.2 AI 模型加载失败

```bash
# 模型首次加载需要联网下载，约 1-2 GB
# 如果无法联网，需要手动将模型文件放到 HuggingFace 缓存目录:
# ~/.cache/huggingface/hub/
# ~/.cache/whisper/

# 内存不足 (Windows 常见 os error 1455)
# 解决: 增大系统虚拟内存/分页文件
```

### 7.3 上传文件但看不到

```bash
# 查看后台处理日志
grep "files 表写入" app.log | tail -10
grep "ERROR" app.log | tail -20

# 确认 LanceDB 数据
curl http://localhost:8090/api/files/list
```

### 7.4 前端页面空白

```bash
# 检查前端是否已构建
ls frontend/dist/index.html

# 未构建则执行:
bash deploy.sh build

# 开发模式直接访问 :3000 即可（无需构建）
```

### 7.5 PDF 图像提取失败

```bash
# 需要 poppler-utils
sudo apt install poppler-utils    # Debian/Ubuntu
sudo yum install poppler-utils    # CentOS/RHEL
```

### 7.6 音视频转录失败

```bash
# 需要 ffmpeg
sudo apt install ffmpeg            # Debian/Ubuntu
sudo yum install ffmpeg            # CentOS/RHEL
```

## 8. 生产模式 vs 开发模式

| 对比项 | 生产模式 | 开发模式 |
|--------|---------|---------|
| 启动命令 | `bash deploy.sh start` | `bash deploy.sh dev` |
| 前端服务 | 由后端提供 dist/ 静态文件 | Vite 开发服务器 (:3000) |
| 访问地址 | http://IP:8090 | http://IP:3000 |
| 热更新 | 无，需重新 build | 自动热更新 |
| 适用场景 | 正式部署、演示 | 前端开发调试 |

## 9. 更新部署

```bash
# 方式一: 一键更新
bash deploy.sh update

# 方式二: 手动更新
git pull
source venv/bin/activate
pip install -r requirements.txt
bash deploy.sh build
bash deploy.sh restart
```
