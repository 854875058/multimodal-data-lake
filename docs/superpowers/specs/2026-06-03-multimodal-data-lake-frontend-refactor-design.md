# 多模态数据湖仓前端重构设计文档

**文档编号** `BONC-DL-REFACTOR-2026-001` · **版本** `V1.0` · **日期** `2026-06-03`  
**适用对象** 前端研发团队 · 产品评审团队  
**文档目的** 将待办清单中的所有功能需求转化为可指导开发的完整技术设计

---

## 一、项目背景与目标

### 1.1 背景

多模态数据湖仓平台当前前端存在以下问题：
- UI 设计不够精致，视觉效果待提升
- 交互体验不顺畅，反馈不及时
- 功能深度不够，部分页面是占位实现
- 信息架构混乱，导航不清晰

### 1.2 目标

- 统一重构前端架构，提升代码质量和开发效率
- 完成待办清单中的所有功能（BL-006 到 BL-204）
- 支持主题切换（深色/浅色）
- 支持多语言（优先中文）

---

## 二、技术方案

### 2.1 技术栈

| 类别 | 技术选型 | 说明 |
|------|---------|------|
| 框架 | Umi 4 + React 18 | 企业级中后台解决方案 |
| UI 库 | Ant Design 5 + ProComponents | 组件丰富，生态成熟 |
| 状态管理 | Redux Toolkit + RTK Query | 适合复杂应用，内置数据请求处理 |
| 图表库 | AntV G2/G6 | Ant Design 官方推荐，风格一致 |
| 国际化 | umi-plugin-locale | Umi 内置国际化方案 |
| 构建工具 | Umi 内置（Webpack） | 约定优于配置 |

### 2.2 项目结构

```
multimodal-data-lake-frontend/
├── src/
│   ├── components/          # 公共组件
│   │   ├── Charts/         # 图表组件
│   │   ├── Layout/         # 布局组件
│   │   └── Custom/         # 业务组件
│   ├── pages/              # 页面组件
│   │   ├── dashboard/      # 湖总览
│   │   ├── query/          # 湖查询
│   │   │   ├── sql/       # SQL 查询
│   │   │   ├── retrieval/ # 统一检索
│   │   │   └── copilot/   # AI 副驾驶
│   │   ├── compute/        # 湖计算
│   │   │   ├── workflow/  # 工作流编排
│   │   │   ├── operators/ # 算子中心
│   │   │   └── tasks/     # 任务中心
│   │   ├── storage/        # 湖存储
│   │   │   ├── datasets/  # 数据集管理
│   │   │   ├── upload/    # 本地上传
│   │   │   └── source/    # 来源接入
│   │   ├── governance/     # 湖治理
│   │   │   ├── catalog/   # 数据目录
│   │   │   └── lineage/   # 血缘追踪
│   │   ├── ops/            # 湖运维
│   │   │   ├── cluster/   # 集群管理
│   │   │   ├── alert/     # 告警监控
│   │   │   ├── sql/       # SQL 编辑器
│   │   │   └── inspection/# 自动巡检
│   │   ├── annotation/     # 自动标注
│   │   │   ├── jobs/      # 标注任务
│   │   │   └── review/    # 标注审核
│   │   └── settings/       # 系统配置
│   │       ├── users/     # 用户管理
│   │       ├── roles/     # 角色权限
│   │       └── config/    # 系统配置
│   ├── services/           # API 服务
│   │   ├── api.ts         # API 定义
│   │   └── *.ts           # 各模块 API
│   ├── models/             # Redux 状态
│   │   ├── global.ts      # 全局状态
│   │   └── *.ts           # 各模块状态
│   ├── utils/              # 工具函数
│   ├── locales/            # 国际化资源
│   │   ├── zh-CN.ts       # 中文
│   │   └── en-US.ts       # 英文
│   ├── app.ts              # 应用入口
│   └── global.less         # 全局样式
├── config/                 # Umi 配置
│   ├── config.ts          # 主配置
│   ├── routes.ts          # 路由配置
│   └── defaultSettings.ts # 默认设置
├── mock/                   # Mock 数据
├── public/                 # 静态资源
├── package.json
└── tsconfig.json
```

### 2.3 路由设计

采用两级路由结构：

```typescript
// config/routes.ts
export default [
  {
    path: '/login',
    component: 'login',
    layout: false,
  },
  {
    path: '/dashboard',
    name: '湖总览',
    icon: 'Dashboard',
    component: 'dashboard',
  },
  {
    path: '/query',
    name: '湖查询',
    icon: 'Search',
    routes: [
      { path: '/query/sql', name: 'SQL 查询', component: 'query/sql' },
      { path: '/query/retrieval', name: '统一检索', component: 'query/retrieval' },
      { path: '/query/copilot', name: 'AI 副驾驶', component: 'query/copilot' },
    ],
  },
  {
    path: '/compute',
    name: '湖计算',
    icon: 'Thunderbolt',
    routes: [
      { path: '/compute/workflow', name: '工作流编排', component: 'compute/workflow' },
      { path: '/compute/operators', name: '算子中心', component: 'compute/operators' },
      { path: '/compute/tasks', name: '任务中心', component: 'compute/tasks' },
      { path: '/compute/jobs', name: '作业实例', component: 'compute/jobs' },
      { path: '/compute/templates', name: '模板库', component: 'compute/templates' },
    ],
  },
  {
    path: '/storage',
    name: '湖存储',
    icon: 'Database',
    routes: [
      { path: '/storage/datasets', name: '数据集管理', component: 'storage/datasets' },
      { path: '/storage/upload', name: '本地上传', component: 'storage/upload' },
      { path: '/storage/source', name: '来源接入', component: 'storage/source' },
    ],
  },
  {
    path: '/governance',
    name: '湖治理',
    icon: 'Safety',
    routes: [
      { path: '/governance/catalog', name: '数据目录', component: 'governance/catalog' },
      { path: '/governance/lineage', name: '血缘追踪', component: 'governance/lineage' },
    ],
  },
  {
    path: '/ops',
    name: '湖运维',
    icon: 'Setting',
    routes: [
      { path: '/ops/cluster', name: '集群管理', component: 'ops/cluster' },
      { path: '/ops/sql', name: 'SQL 编辑器', component: 'ops/sql' },
      { path: '/ops/alert', name: '告警监控', component: 'ops/alert' },
      { path: '/ops/inspection', name: '自动巡检', component: 'ops/inspection' },
    ],
  },
  {
    path: '/annotation',
    name: '自动标注',
    icon: 'Tags',
    routes: [
      { path: '/annotation/jobs', name: '标注任务', component: 'annotation/jobs' },
      { path: '/annotation/review', name: '标注审核', component: 'annotation/review' },
    ],
  },
  {
    path: '/settings',
    name: '系统配置',
    icon: 'Tool',
    routes: [
      { path: '/settings/users', name: '用户管理', component: 'settings/users' },
      { path: '/settings/roles', name: '角色权限', component: 'settings/roles' },
      { path: '/settings/config', name: '系统配置', component: 'settings/config' },
    ],
  },
];
```

### 2.4 权限设计

采用 RBAC 模型，支持菜单级和按钮级权限：

```typescript
// 权限定义
interface Permission {
  id: string;
  name: string;
  type: 'menu' | 'button';
  path?: string;  // 菜单路径
  action?: string; // 按钮动作
}

// 角色定义
interface Role {
  id: string;
  name: string;
  permissions: Permission[];
}

// 默认角色
const defaultRoles = {
  admin: {
    name: '管理员',
    permissions: ['*'], // 所有权限
  },
  editor: {
    name: '编辑者',
    permissions: [
      'menu:dashboard',
      'menu:query',
      'menu:compute',
      'menu:storage',
      'menu:governance',
      'button:upload',
      'button:edit',
    ],
  },
  viewer: {
    name: '查看者',
    permissions: [
      'menu:dashboard',
      'menu:query',
      'button:view',
    ],
  },
};
```

### 2.5 主题设计

支持深色/浅色主题切换：

```typescript
// 主题配置
const themes = {
  light: {
    colorPrimary: '#1677ff',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f5f5',
    colorText: 'rgba(0, 0, 0, 0.88)',
    // ... 其他颜色
  },
  dark: {
    colorPrimary: '#1677ff',
    colorBgContainer: '#141414',
    colorBgLayout: '#000000',
    colorText: 'rgba(255, 255, 255, 0.88)',
    // ... 其他颜色
  },
};

// 主题切换
const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };
  
  return { theme, toggleTheme };
};
```

---

## 三、功能模块设计

### 3.1 BL-006 AI 数据副驾驶

#### 3.1.1 功能概述

- 自然语言转 SQL 查询
- 推理过程完整展示（意图理解 → SQL 生成 → 执行步骤）
- 支持上下文追问

#### 3.1.2 页面结构

```
/query/copilot
├── 对话区（左侧主区域，70% 宽度）
│   ├── 消息列表
│   │   ├── 用户消息（自然语言问题）
│   │   └── AI 消息（推理过程 + 查询结果）
│   ├── 输入框
│   │   ├── 多行输入
│   │   ├── 快捷键（Ctrl+Enter 发送）
│   │   └── 示例问题按钮
│   └── 历史对话列表（可折叠）
└── 推理面板（右侧，30% 宽度，可折叠）
    ├── 意图理解
    │   ├── 识别的意图类型
    │   ├── 提取的关键实体
    │   └── 时间范围、筛选条件
    ├── SQL 生成
    │   ├── 生成的 SQL（语法高亮）
    │   ├── SQL 解释
    │   └── 复制按钮
    ├── 执行步骤
    │   ├── 执行状态
    │   ├── 耗时
    │   └── 结果行数
    └── 结果预览
        ├── 表格视图
        ├── 图表视图（可切换）
        └── 导出按钮（CSV/Excel）
```

#### 3.1.3 交互流程

1. 用户输入自然语言问题
2. 系统展示"思考中"动画
3. 流式返回推理过程：
   - 意图理解（高亮显示识别的实体）
   - SQL 生成（语法高亮，可复制）
   - 执行步骤（进度条，状态更新）
4. 展示查询结果（表格/图表）
5. 用户可以：
   - 基于结果继续追问
   - 切换表格/图表视图
   - 导出结果
   - 查看历史对话

#### 3.1.4 API 设计

```typescript
// POST /api/copilot/chat
interface CopilotRequest {
  message: string;
  conversation_id?: string;  // 会话 ID，用于上下文追问
  context?: {
    previous_sql?: string;   // 上一轮 SQL
    previous_result?: any;   // 上一轮结果
  };
}

interface CopilotResponse {
  conversation_id: string;
  message_id: string;
  reasoning: {
    intent: string;          // 意图类型
    entities: string[];      // 提取的实体
    time_range?: string;     // 时间范围
    filters?: Record<string, any>; // 筛选条件
  };
  sql: string;
  execution: {
    status: 'running' | 'success' | 'error';
    duration_ms?: number;
    row_count?: number;
    error?: string;
  };
  result?: {
    columns: string[];
    rows: any[];
  };
}

// SSE 流式返回
// GET /api/copilot/chat/stream?message=xxx&conversation_id=xxx
```

#### 3.1.5 核心组件

```typescript
// src/pages/query/copilot/components/ChatMessage.tsx
const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  return (
    <div className="chat-message">
      {message.role === 'user' ? (
        <UserMessage content={message.content} />
      ) : (
        <AIMessage
          content={message.content}
          reasoning={message.reasoning}
          sql={message.sql}
          result={message.result}
        />
      )}
    </div>
  );
};

// src/pages/query/copilot/components/ReasoningPanel.tsx
const ReasoningPanel: React.FC<{ reasoning: Reasoning }> = ({ reasoning }) => {
  return (
    <Card title="推理过程">
      <Collapse>
        <Collapse.Panel header="意图理解" key="intent">
          <IntentDisplay intent={reasoning.intent} entities={reasoning.entities} />
        </Collapse.Panel>
        <Collapse.Panel header="SQL 生成" key="sql">
          <SQLDisplay sql={reasoning.sql} />
        </Collapse.Panel>
        <Collapse.Panel header="执行步骤" key="execution">
          <ExecutionDisplay execution={reasoning.execution} />
        </Collapse.Panel>
      </Collapse>
    </Card>
  );
};
```

---

### 3.2 BL-007 多模态检索工作台

#### 3.2.1 功能概述

- 文搜图：文本查询 → 返回相关图片
- 文搜文：文本查询 → 返回相关文本
- 混合布局展示结果

#### 3.2.2 页面结构

```
/query/retrieval
├── 搜索区（顶部）
│   ├── 搜索框（支持文本输入）
│   ├── 搜索类型切换（文搜图/文搜文/混合）
│   └── 高级筛选（时间范围、文件类型、标签）
└── 结果区（主区域）
    ├── 图片结果（网格布局）
    │   ├── 缩略图
    │   ├── 相似度评分
    │   └── 点击查看详情
    └── 文本结果（卡片列表）
        ├── 标题
        ├── 摘要（高亮匹配词）
        ├── 来源文件
        └── 相似度评分
```

#### 3.2.3 交互流程

1. 用户输入搜索文本
2. 选择搜索类型（文搜图/文搜文/混合）
3. 系统展示搜索结果：
   - 图片结果：网格布局，显示缩略图和相似度
   - 文本结果：卡片列表，高亮匹配词
4. 用户可以：
   - 点击图片查看大图
   - 点击文本查看原文
   - 切换搜索类型
   - 使用高级筛选

#### 3.2.4 API 设计

```typescript
// POST /api/search
interface SearchRequest {
  query: string;
  mode: 'text' | 'image' | 'hybrid';
  filters?: {
    file_types?: string[];
    date_range?: [string, string];
    tags?: string[];
  };
  limit?: number;
  offset?: number;
}

interface SearchResult {
  id: string;
  type: 'image' | 'text';
  score: number;  // 相似度评分
  content: {
    // 图片结果
    url?: string;
    thumbnail?: string;
    width?: number;
    height?: number;
    // 文本结果
    title?: string;
    snippet?: string;
    source_file?: string;
  };
  metadata: Record<string, any>;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query_time_ms: number;
}
```

#### 3.2.5 核心组件

```typescript
// src/pages/query/retrieval/components/ImageResultGrid.tsx
const ImageResultGrid: React.FC<{ results: SearchResult[] }> = ({ results }) => {
  return (
    <Row gutter={[16, 16]}>
      {results.map(result => (
        <Col key={result.id} xs={24} sm={12} md={8} lg={6}>
          <Card
            hoverable
            cover={<img src={result.content.thumbnail} alt={result.id} />}
            onClick={() => showImageDetail(result)}
          >
            <Card.Meta
              title={`相似度: ${(result.score * 100).toFixed(1)}%`}
              description={result.content.source_file}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

// src/pages/query/retrieval/components/TextResultList.tsx
const TextResultList: React.FC<{ results: SearchResult[] }> = ({ results }) => {
  return (
    <List
      dataSource={results}
      renderItem={result => (
        <List.Item>
          <Card>
            <Card.Meta
              title={result.content.title}
              description={
                <div>
                  <p dangerouslySetInnerHTML={{ __html: highlightKeywords(result.content.snippet, query) }} />
                  <Tag>{result.content.source_file}</Tag>
                  <Tag color="blue">相似度: {(result.score * 100).toFixed(1)}%</Tag>
                </div>
              }
            />
          </Card>
        </List.Item>
      )}
    />
  );
};
```

---

### 3.3 BL-101 数据治理目录页

#### 3.3.1 功能概述

- Catalog → Schema → Table 三级目录
- 元数据和治理标签展示
- 有向图可视化展示血缘关系

#### 3.3.2 页面结构

```
/governance/catalog
├── 目录树（左侧，25% 宽度）
│   ├── Catalog 列表
│   ├── Schema 列表（展开 Catalog）
│   └── Table 列表（展开 Schema）
└── 详情区（右侧，75% 宽度）
    ├── 基本信息
    │   ├── 名称、类型、创建时间
    │   ├── 所有者
    │   └── 描述
    ├── 元数据
    │   ├── 列信息（列名、类型、描述）
    │   ├── 行数、大小
    │   └── 分区信息
    ├── 治理标签
    │   ├── 数据分类
    │   ├── 敏感级别
    │   └── 业务标签
    └── 血缘关系
        ├── 上游来源
        ├── 下游消费
        └── 有向图可视化
```

#### 3.3.3 血缘可视化

使用 AntV G6 实现有向图：

```typescript
// src/pages/governance/catalog/components/LineageGraph.tsx
import G6 from '@antv/g6';

const LineageGraph: React.FC<{ data: LineageData }> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new G6.Graph({
      container: containerRef.current,
      width: containerRef.current.scrollWidth,
      height: 500,
      layout: {
        type: 'dagre',
        rankdir: 'LR',
        nodesep: 50,
        ranksep: 100,
      },
      defaultNode: {
        type: 'rect',
        size: [150, 40],
        style: {
          fill: '#E6F7FF',
          stroke: '#1890FF',
          radius: 4,
        },
        labelCfg: {
          style: {
            fill: '#333',
            fontSize: 12,
          },
        },
      },
      defaultEdge: {
        type: 'polyline',
        style: {
          stroke: '#ccc',
          lineWidth: 2,
          endArrow: {
            path: G6.Arrow.triangle(8, 10, 15),
            fill: '#ccc',
          },
        },
      },
    });

    // 渲染图
    graph.data(data);
    graph.render();

    graphRef.current = graph;

    return () => {
      graph.destroy();
    };
  }, [data]);

  return <div ref={containerRef} />;
};
```

#### 3.3.4 API 设计

```typescript
// GET /api/platform/assets/catalogs
interface Catalog {
  id: string;
  name: string;
  description: string;
  schema_count: number;
  table_count: number;
}

// GET /api/platform/assets/schemas?catalog_id=xxx
interface Schema {
  id: string;
  name: string;
  catalog_id: string;
  table_count: number;
}

// GET /api/platform/assets/tables?schema_id=xxx
interface Table {
  id: string;
  name: string;
  schema_id: string;
  type: 'managed' | 'external' | 'view';
  row_count: number;
  size_bytes: number;
  columns: Column[];
  tags: string[];
  owner: string;
  created_at: string;
  updated_at: string;
}

// GET /api/governance/lineage?table_id=xxx
interface LineageData {
  nodes: {
    id: string;
    type: 'table' | 'job' | 'service';
    name: string;
  }[];
  edges: {
    source: string;
    target: string;
    type: 'produces' | 'consumes' | 'processes';
  }[];
}
```

---

### 3.4 BL-102 湖查询能力收口

#### 3.4.1 功能概述

- SQL 查询、统一检索、AI 副驾驶各自独立页面
- 侧边栏分开入口
- 清晰的职责边界

#### 3.4.2 页面结构

```
湖查询（侧边栏分组）
├── SQL 查询 (/query/sql)
│   ├── Monaco Editor（SQL 编辑器）
│   ├── Catalog/Schema 树浏览器
│   ├── 查询历史
│   └── 结果表格
├── 统一检索 (/query/retrieval)
│   ├── 搜索框
│   ├── 搜索类型切换
│   └── 结果展示（混合布局）
└── AI 副驾驶 (/query/copilot)
    ├── 对话区
    └── 推理面板
```

---

### 3.5 BL-103 接入/上传/工作流/任务中心融合

#### 3.5.1 功能概述

- 接入总览 → 来源接入、本地上传、工作流编排、任务中心
- 层级清晰的导航结构

#### 3.5.2 页面结构

```
湖存储（侧边栏分组）
├── 总览 (/storage/overview)
│   ├── 数据源统计
│   ├── 最近任务
│   └── 快捷入口
├── 数据集管理 (/storage/datasets)
│   ├── 数据集列表
│   ├── 数据集详情
│   └── 版本管理
├── 本地上传 (/storage/upload)
│   ├── 文件选择
│   ├── 上传进度
│   └── 处理状态
└── 来源接入 (/storage/source)
    ├── 数据源配置
    ├── 连接测试
    └── 扫描任务
```

---

### 3.6 BL-104 湖运维信息架构收口

#### 3.6.1 功能概述

- 集群为中心的运维导航
- 告警、慢 SQL、巡检、日志等围绕集群组织

#### 3.6.2 页面结构

```
湖运维（侧边栏分组）
├── 集群管理 (/ops/cluster)
│   ├── 集群列表
│   ├── 集群详情
│   │   ├── 节点拓扑
│   │   ├── 资源使用
│   │   └── 健康状态
│   └── 集群操作（扩缩容、重启等）
├── SQL 编辑器 (/ops/sql)
│   ├── Monaco Editor
│   ├── Catalog/Schema 树
│   └── 查询历史
├── 告警监控 (/ops/alert)
│   ├── 告警列表
│   ├── 告警详情
│   └── 告警策略
└── 自动巡检 (/ops/inspection)
    ├── 巡检报告
    ├── 评分详情
    └── 历史趋势
```

---

### 3.7 BL-105 Ray 作业与任务治理联动

#### 3.7.1 功能概述

- 统一任务视图
- 展示 Ray Job、入湖任务、审计记录

#### 3.7.2 页面结构

```
/compute/tasks
├── 任务列表
│   ├── 筛选（类型、状态、时间）
│   ├── 任务表格
│   │   ├── 任务 ID
│   │   ├── 任务类型（Ray Job/入湖任务/审计）
│   │   ├── 状态（运行中/成功/失败）
│   │   ├── 开始时间
│   │   └── 操作
│   └── 分页
└── 任务详情
    ├── 基本信息
    ├── 执行日志
    ├── 结果数据
    └── 操作（重试、取消等）
```

---

### 3.8 BL-201/202 自动标注能力

#### 3.8.1 功能概述

- 自动标注任务管理
- 批量审核标注结果
- 训练集导出

#### 3.8.2 页面结构

```
自动标注（侧边栏分组）
├── 标注任务 (/annotation/jobs)
│   ├── 任务列表
│   ├── 创建任务
│   │   ├── 选择数据集
│   │   ├── 选择标注模型
│   │   └── 配置参数
│   └── 任务详情
│       ├── 进度
│       ├── 标注结果
│       └── 导出
└── 标注审核 (/annotation/review)
    ├── 审核列表
    │   ├── 批量选择
    │   ├── 筛选（状态、标签）
    │   └── 批量操作（通过/拒绝）
    ├── 审核详情
    │   ├── 原图/原文
    │   ├── 标注结果
    │   └── 修改标注
    └── 训练集导出
        ├── 选择标注结果
        ├── 导出格式（COCO/VOC/YOLO）
        └── 下载
```

---

### 3.9 BL-203 检索质量指标

#### 3.9.1 功能概述

- 用户行为指标统计
- 检索质量评估视图

#### 3.9.2 页面结构

```
/query/quality
├── 总览
│   ├── 总查询数
│   ├── 平均响应时间
│   ├── 点击率
│   └── 用户满意度
├── 查询分析
│   ├── 热门查询
│   ├── 查询趋势
│   └── 失败查询
└── 结果分析
    ├── 点击位置分布
    ├── 结果相关性评分
    └── 用户反馈统计
```

---

## 四、开发计划

### 4.1 阶段一：基础架构（2 周）

- 初始化 Umi + Ant Design Pro 项目
- 配置路由、权限、国际化
- 实现基础布局（侧边栏、顶部导航）
- 配置 Redux Toolkit + RTK Query
- 配置主题切换

### 4.2 阶段二：核心功能（4 周）

- BL-006 AI 数据副驾驶
- BL-007 多模态检索工作台
- BL-101 数据治理目录页
- BL-102 湖查询能力收口

### 4.3 阶段三：运维功能（3 周）

- BL-104 湖运维信息架构收口
- BL-105 Ray 作业与任务治理联动
- BL-103 接入/上传/工作流/任务中心融合

### 4.4 阶段四：标注功能（2 周）

- BL-201 自动标注能力接入
- BL-202 标注审核与训练集构建
- BL-203 检索质量指标

### 4.5 阶段五：优化完善（1 周）

- 性能优化
- UI 细节打磨
- 测试和修复

---

## 五、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 技术栈迁移成本高 | 开发周期延长 | 分阶段迁移，先核心功能后边缘功能 |
| 后端 API 不兼容 | 前后端联调困难 | 先定义 API 接口，前后端并行开发 |
| 主题切换实现复杂 | UI 一致性问题 | 使用 Ant Design 主题方案，统一配置 |
| 国际化工作量大 | 影响开发进度 | 优先中文，英文后续补充 |

---

## 六、验收标准

- [ ] 所有页面使用 Ant Design Pro 组件库
- [ ] 路由层级清晰，侧边栏导航正确
- [ ] 权限控制生效（菜单级 + 按钮级）
- [ ] 主题切换正常工作（深色/浅色）
- [ ] 国际化配置完成（中文优先）
- [ ] 所有功能模块可正常使用
- [ ] 页面加载时间 < 3 秒
- [ ] 无控制台错误
- [ ] 移动端响应式适配

---

*文档版本: V1.0*  
*最后更新: 2026-06-03*
