# multimodal-data-lake

多模态数据湖统一管理平台，当前采用 `React + Vite + FastAPI` 架构，围绕湖管理、湖计算、系统配置三条主线组织控制台能力。

## 当前定位

- 湖管理：湖总览、资产目录、数据接入、查询分析
- 湖计算：接入工作台、计算编排、任务治理、系统日志
- 系统配置：接入配置、用户管理、权限管理

当前前端主入口为：

- `frontend/src/main.jsx`
- `frontend/src/App.jsx`

当前后端主入口为：

- `backend/main.py`

## 技术栈

- 前端：React 18、React Router、Vite、ECharts
- 后端：FastAPI
- 数据与能力：LanceDB、SeaweedFS / S3、Doris、Ray、Gravitino

## 启动方式

### 1. 安装前端依赖

```bash
cd frontend
npm install
```

### 2. 构建前端

```bash
cd frontend
npm run build
```

### 3. 从仓库根目录启动后端

必须在仓库根目录执行，不要在 `backend/` 目录里直接跑 `python main.py` 作为主验证方式。

```bash
python backend/main.py
```

启动成功后，默认检查以下地址：

- `http://127.0.0.1:8090/`
- `http://127.0.0.1:8090/api/health`
- `http://127.0.0.1:8090/api/workbench/settings`

## 开发验证顺序

根据仓库约定，优先做轻量验证：

```bash
python -m py_compile backend/main.py
cd frontend && npm run build
```

如果变更了运维脚本，再补充：

```bash
python deploy.py env
python deploy.py status
```

## 目录说明

```text
backend/                  FastAPI 后端
backend/api/              平台、查询、文件、工作台等接口
frontend/                 React + Vite 前端
frontend/src/pages/       控制台各功能页
frontend/src/assets/      全局样式与静态资源
etl.py                    批处理与接入逻辑
ingestion_workbench.py    接入工作台后端逻辑
database.py               SQLite 设置与任务数据
config.py                 平台配置
```

## 当前状态说明

- GitHub 仓库目标名称已切换为 `multimodal-data-lake`
- 控制台导航已按“湖管理 / 湖计算 / 系统配置”重构
- `用户管理` 与 `权限管理` 页面已预留前端框架，用于后续接入账号体系与权限模型
- `接入配置` 页面继续复用现有平台配置与默认接入模板能力

## 备注

- 仓库中仍保留部分历史文档，例如 `README_VUE.md`，它们更多用于旧阶段留档，不代表当前主入口
- 在当前环境中，`vite dev` 可能受限；手工验证优先使用后端 `8090` 提供的生产构建页面
