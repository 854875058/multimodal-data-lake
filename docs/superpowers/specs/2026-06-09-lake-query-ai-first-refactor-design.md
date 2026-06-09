# 湖查询 AI 优先重构设计

## 背景

当前 `frontend/src/pages/LakeQueryPage.jsx` 已经聚合了 SQL 查询、统一检索、向量检索、多模态检索、混合检索、AI 数据副驾驶、自动化标注等多个工作台。页面文件超过千行，页面结构、交互状态、接口调用、内联样式混在一起，导致后续 UI 调整和功能迭代成本偏高。

本轮重构聚焦 `湖查询` 模块。左侧一级标题保持现有产品命名，不改动：`湖总览`、`湖查询`、`湖计算`、`湖存储`、`湖治理`、`湖运维`、`系统配置`、`管理入口`。

## 产品方向

采用 `AI 优先` 的湖查询体验。`AI 数据副驾驶` 是默认入口，用户先用自然语言表达查询目标，系统再根据问题选择 SQL、语义检索、向量检索、多模态检索或混合检索能力。

同时保留专业模式。AI 不替代 SQL 和检索工作台，而是作为统一调度入口。用户必须能看到 AI 使用了哪些工具、生成了什么 SQL、召回了哪些资产，并能跳转到专业工作台继续调整。

## 信息架构

`湖查询` 下的二级入口收敛为四个：

1. `AI 数据副驾驶`
2. `SQL 查询`
3. `统一检索`
4. `自动化标注`

原先的 `向量检索`、`多模态检索`、`混合检索` 不再作为左侧独立入口展示。它们归并为 `统一检索` 页面内部的检索策略。

`统一检索` 内部提供策略切换：

1. `智能选择`：默认策略，由系统根据关键词、资产类型、过滤条件自动选择检索方式。
2. `语义检索`：面向文本和元数据语义匹配。
3. `向量检索`：面向向量相似度召回。
4. `多模态检索`：面向图片、视频、结构化事件等多模态资产。
5. `混合检索`：组合文本、向量、多模态和结构化过滤。

保留旧路由兼容：

1. `/lake-query/vector` 跳转或映射到 `/lake-query/retrieval?strategy=vector`
2. `/lake-query/multimodal` 跳转或映射到 `/lake-query/retrieval?strategy=multimodal`
3. `/lake-query/hybrid` 跳转或映射到 `/lake-query/retrieval?strategy=hybrid`

`/lake-query` 默认进入 AI 数据副驾驶。推荐实现为重定向到 `/lake-query/copilot`，避免根路径出现空白或旧默认页。

## 页面设计

### AI 数据副驾驶

首屏是查询指挥台，而不是传统表单堆叠。

主区域包含：

1. 自然语言输入框，支持输入查询目标、筛选条件和分析诉求。
2. 推荐问题，覆盖监控事件、资产检索、告警分析、数据质量、工单追踪等常见场景。
3. AI 答案区，展示总结、关键发现、下一步建议。
4. 执行产物区，展示生成 SQL、检索条件、召回资产、相关表、可复制内容。

右侧区域包含：

1. 执行轨迹：理解意图、选择工具、执行 SQL 或检索、生成答案。
2. 查询上下文：当前选中的数据域、过滤条件、资产类型。
3. 最近查询：支持快速复用。

AI 工作台需要显式提供专业模式跳转：

1. `打开 SQL 查询`
2. `转到统一检索`
3. `查看资产详情`
4. `保存为查询模板`

### SQL 查询

SQL 查询保留为专业工作台，重点提升可用性而不是改变能力边界。

页面包含：

1. SQL 编辑器。
2. 表结构和字段浏览。
3. 执行结果表。
4. 查询历史。
5. 错误提示和复制入口。

AI 数据副驾驶生成的 SQL 可以带着上下文进入 SQL 查询页，用户能继续编辑并执行。

### 统一检索

统一检索是所有非 SQL 检索能力的入口。

页面包含：

1. 检索输入框。
2. 策略切换：智能选择、语义、向量、多模态、混合。
3. 高级过滤：事件类型、告警等级、地域、设备、算法、置信度、时间范围、半径等。
4. 结果列表：文本摘要、图片或视频缩略图、结构化字段、来源路径、相关度。
5. 结果操作：查看详情、打开媒体、复制路径、加入 AI 上下文。

默认展示 `智能选择`，降低用户理解检索技术分类的成本。高级策略只在页面内部出现，不占用左侧导航。

### 自动化标注

自动化标注暂时保持独立入口。它更接近数据生产和治理流程，不只是查询策略，因此不并入统一检索。

重构时只做结构和视觉统一，不扩大标注功能范围。

## 技术设计

将当前单文件页面拆成边界清晰的模块：

1. `frontend/src/pages/lake-query/LakeQueryPage.jsx`：路由分发和页面壳。
2. `frontend/src/pages/lake-query/AiCopilotWorkspace.jsx`：AI 数据副驾驶。
3. `frontend/src/pages/lake-query/SqlWorkspace.jsx`：SQL 查询。
4. `frontend/src/pages/lake-query/RetrievalWorkspace.jsx`：统一检索。
5. `frontend/src/pages/lake-query/AnnotationWorkspace.jsx`：自动化标注。
6. `frontend/src/pages/lake-query/components/PromptComposer.jsx`：AI 输入区。
7. `frontend/src/pages/lake-query/components/QueryTracePanel.jsx`：执行轨迹。
8. `frontend/src/pages/lake-query/components/RetrievalStrategyTabs.jsx`：检索策略切换。
9. `frontend/src/pages/lake-query/components/SearchResultCard.jsx`：检索结果卡片。
10. `frontend/src/pages/lake-query/components/SqlResultPanel.jsx`：SQL 结果展示。
11. `frontend/src/pages/lake-query/hooks/useQueryTrace.js`：执行轨迹状态。
12. `frontend/src/pages/lake-query/hooks/useRetrievalQuery.js`：统一检索状态和接口调用。

复用已有 UI 基础：

1. `PageScaffold`
2. `MetricStrip`
3. `LoadingState`
4. `EmptyState`
5. `ErrorState`

减少内联样式。湖查询专属样式集中到页面级 CSS 文件，通用布局能力优先放回已有 UI foundation。

## 数据流

AI 数据副驾驶的数据流：

1. 用户输入自然语言问题。
2. 前端构建查询上下文，包括当前数据域、筛选条件、历史问题。
3. 调用现有 AI 或查询编排接口。
4. 后端返回答案、执行轨迹、SQL、检索条件、结果摘要。
5. 前端按模块展示答案、轨迹和产物。
6. 用户可把产物带入 SQL 查询或统一检索继续操作。

统一检索的数据流：

1. 用户输入关键词并选择策略。
2. `智能选择` 映射为后端默认或混合策略。
3. 前端调用现有检索接口。
4. 返回结果统一转换为结果卡片模型。
5. 图片、视频等媒体继续使用现有媒体 URL 方法打开。

SQL 查询的数据流保持现有接口边界，不在本轮改造后端协议。

## 错误和空状态

AI 调用失败时，页面显示错误状态，并提供两个恢复入口：

1. 重试。
2. 转到 SQL 查询或统一检索手动查询。

统一检索无结果时，展示可操作空状态：

1. 放宽过滤条件。
2. 切换检索策略。
3. 交给 AI 数据副驾驶重新组织问题。

SQL 执行失败时，保留错误信息、SQL 内容和复制入口，便于排查。

## 测试策略

新增或调整前端测试覆盖：

1. 导航配置：`湖查询` 下只展示四个入口，旧路由不作为导航项展示。
2. 路由兼容：`vector`、`multimodal`、`hybrid` 能映射到统一检索策略。
3. AI 工作台：推荐问题、输入区、执行轨迹、结果产物渲染正常。
4. 统一检索：策略切换、过滤条件、空状态、错误状态正常。
5. SQL 工作台：执行结果和错误状态不回归。

验收时运行：

1. `npm --prefix frontend run test`
2. 在 `frontend/` 目录运行 `npm run build`
3. 用浏览器检查 `/lake-query/copilot`、`/lake-query/sql`、`/lake-query/retrieval` 的桌面布局。

## 非目标

本轮不做以下事项：

1. 不重命名左侧一级标题。
2. 不新增后端大模型能力。
3. 不重写 SQL 执行接口。
4. 不把自动化标注并入统一检索。
5. 不一次性重构湖查询以外的页面。

## 验收标准

1. `/lake-query` 默认进入 AI 数据副驾驶。
2. 左侧 `湖查询` 下只保留四个二级入口。
3. 统一检索内部能切换智能选择、语义、向量、多模态、混合策略。
4. AI 结果能显示执行轨迹和可复用产物。
5. 用户仍能直接进入 SQL 查询做专业操作。
6. 旧检索路由不会导致 404 或空白页。
7. 湖查询页面代码从单一大文件拆成多个职责清晰的模块。
