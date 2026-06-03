# Phase 1: 基础架构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Umi + Ant Design Pro 前端项目基础架构，包含路由、权限、国际化、主题切换等核心能力。

**Architecture:** 使用 Umi 4 框架 + Ant Design 5 + ProComponents 构建企业级中后台应用。Redux Toolkit 管理全局状态，RTK Query 处理 API 请求。支持深色/浅色主题切换和多语言国际化。

**Tech Stack:** Umi 4, React 18, Ant Design 5, ProComponents, Redux Toolkit, RTK Query, AntV G2/G6, TypeScript

---

## File Structure

```
multimodal-data-lake-frontend/
├── src/
│   ├── components/
│   │   └── ThemeSwitch/
│   │       └── index.tsx          # 主题切换组件
│   ├── layouts/
│   │   └── BasicLayout/
│   │       └── index.tsx          # 基础布局组件
│   ├── pages/
│   │   ├── login/
│   │   │   └── index.tsx          # 登录页
│   │   ├── dashboard/
│   │   │   └── index.tsx          # 首页看板
│   │   └── 404.tsx                # 404 页面
│   ├── services/
│   │   └── api.ts                 # API 基础配置
│   ├── models/
│   │   └── global.ts              # 全局状态模型
│   ├── locales/
│   │   ├── zh-CN.ts               # 中文语言包
│   │   └── en-US.ts               # 英文语言包
│   ├── app.tsx                    # 应用入口
│   └── global.less                # 全局样式
├── config/
│   ├── config.ts                  # Umi 主配置
│   ├── routes.ts                  # 路由配置
│   ├── defaultSettings.ts         # ProLayout 默认设置
│   └── proxy.ts                   # 代理配置
├── mock/
│   └── user.ts                    # 用户 Mock 数据
├── tests/
│   └── setup.ts                   # 测试配置
├── package.json
├── tsconfig.json
├── .umirc.ts                      # Umi 配置（备选）
└── .env                           # 环境变量
```

---

### Task 1: 初始化 Umi 项目

**Files:**
- Create: `multimodal-data-lake-frontend/package.json`
- Create: `multimodal-data-lake-frontend/tsconfig.json`
- Create: `multimodal-data-lake-frontend/.umirc.ts`
- Create: `multimodal-data-lake-frontend/.env`

- [ ] **Step 1: 创建项目目录和 package.json**

```bash
mkdir -p E:\工作\国信\AI数据集项目\多模态数据湖仓\multimodal-data-lake-frontend
cd E:\工作\国信\AI数据集项目\多模态数据湖仓\multimodal-data-lake-frontend
```

创建 `package.json`:

```json
{
  "name": "multimodal-data-lake-frontend",
  "version": "1.0.0",
  "private": true,
  "description": "多模态数据湖仓前端",
  "scripts": {
    "dev": "umi dev",
    "build": "umi build",
    "postinstall": "umi setup",
    "start": "npm run dev",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix"
  },
  "dependencies": {
    "@ant-design/icons": "^5.3.0",
    "@ant-design/pro-components": "^2.6.0",
    "@ant-design/pro-layout": "^7.17.0",
    "@antv/g2": "^5.1.0",
    "@antv/g6": "^4.8.0",
    "@reduxjs/toolkit": "^2.2.0",
    "@umijs/max": "^4.1.0",
    "antd": "^5.15.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-redux": "^9.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@umijs/lint": "^4.1.0",
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

创建 `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", "config/**/*", "mock/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 Umi 配置**

创建 `.umirc.ts`:

```typescript
import { defineConfig } from '@umijs/max';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: '多模态数据湖仓',
    locale: true,
  },
  locale: {
    default: 'zh-CN',
    antd: true,
    title: true,
    baseNavigator: true,
    baseSeparator: '-',
  },
  proxy: {
    '/api': {
      target: 'http://localhost:27843',
      changeOrigin: true,
    },
  },
  routes: [],
  theme: {
    'primary-color': '#1677ff',
  },
});
```

- [ ] **Step 4: 创建环境变量**

创建 `.env`:

```
UMI_ENV=development
API_BASE_URL=http://localhost:27843
```

- [ ] **Step 5: 安装依赖并验证**

```bash
npm install
```

验证安装成功：

```bash
npm ls @umijs/max
npm ls antd
npm ls @ant-design/pro-components
```

- [ ] **Step 6: 提交**

```bash
git init
git add .
git commit -m "chore: initialize Umi + Ant Design Pro project"
```

---

### Task 2: 配置路由系统

**Files:**
- Create: `config/routes.ts`
- Modify: `.umirc.ts`

- [ ] **Step 1: 创建路由配置**

创建 `config/routes.ts`:

```typescript
import type { IBestAFRoute } from '@umijs/max';

const routes: IBestAFRoute[] = [
  {
    path: '/login',
    component: 'login',
    layout: false,
    name: '登录',
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
      { path: '/storage/overview', name: '总览', component: 'storage/overview' },
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
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '*',
    component: '404',
  },
];

export default routes;
```

- [ ] **Step 2: 更新 Umi 配置使用路由**

修改 `.umirc.ts`:

```typescript
import { defineConfig } from '@umijs/max';
import routes from './config/routes';

export default defineConfig({
  antd: {},
  access: {},
  model: {},
  initialState: {},
  request: {},
  layout: {
    title: '多模态数据湖仓',
    locale: true,
  },
  locale: {
    default: 'zh-CN',
    antd: true,
    title: true,
    baseNavigator: true,
    baseSeparator: '-',
  },
  proxy: {
    '/api': {
      target: 'http://localhost:27843',
      changeOrigin: true,
    },
  },
  routes,
  theme: {
    'primary-color': '#1677ff',
  },
});
```

- [ ] **Step 3: 提交**

```bash
git add config/routes.ts .umirc.ts
git commit -m "feat: add route configuration"
```

---

### Task 3: 创建基础页面组件

**Files:**
- Create: `src/pages/login/index.tsx`
- Create: `src/pages/dashboard/index.tsx`
- Create: `src/pages/404.tsx`

- [ ] **Step 1: 创建登录页**

创建 `src/pages/login/index.tsx`:

```tsx
import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      // TODO: 调用登录 API
      if (values.username === 'admin' && values.password === 'admin123') {
        localStorage.setItem('token', 'mock-token');
        message.success('登录成功');
        history.push('/dashboard');
      } else {
        message.error('用户名或密码错误');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="多模态数据湖仓" style={{ width: 400 }}>
        <Form onFinish={onFinish}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
```

- [ ] **Step 2: 创建首页看板**

创建 `src/pages/dashboard/index.tsx`:

```tsx
import React from 'react';
import { Card, Col, Row, Statistic } from 'antd';
import { FileOutlined, DatabaseOutlined, CloudServerOutlined, RobotOutlined } from '@ant-design/icons';

const DashboardPage: React.FC = () => {
  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总文件数"
              value={112893}
              prefix={<FileOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="数据集数量"
              value={256}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="集群节点数"
              value={12}
              prefix={<CloudServerOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="AI 模型数"
              value={3}
              prefix={<RobotOutlined />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
```

- [ ] **Step 3: 创建 404 页面**

创建 `src/pages/404.tsx`:

```tsx
import React from 'react';
import { Button, Result } from 'antd';
import { history } from '@umijs/max';

const NotFoundPage: React.FC = () => {
  return (
    <Result
      status="404"
      title="404"
      subTitle="抱歉，您访问的页面不存在"
      extra={
        <Button type="primary" onClick={() => history.push('/dashboard')}>
          返回首页
        </Button>
      }
    />
  );
};

export default NotFoundPage;
```

- [ ] **Step 4: 验证页面渲染**

```bash
npm run dev
```

浏览器访问 http://localhost:8000，验证：
- 自动跳转到 /dashboard
- 登录页 /login 可访问
- 404 页面正常显示

- [ ] **Step 5: 提交**

```bash
git add src/pages/login/index.tsx src/pages/dashboard/index.tsx src/pages/404.tsx
git commit -m "feat: add login, dashboard, and 404 pages"
```

---

### Task 4: 配置 Redux 状态管理

**Files:**
- Create: `src/models/global.ts`
- Create: `src/app.tsx`

- [ ] **Step 1: 创建全局状态模型**

创建 `src/models/global.ts`:

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface GlobalState {
  theme: 'light' | 'dark';
  locale: 'zh-CN' | 'en-US';
  currentUser: {
    id?: string;
    name?: string;
    role?: string;
  } | null;
  collapsed: boolean;
}

const initialState: GlobalState = {
  theme: 'light',
  locale: 'zh-CN',
  currentUser: null,
  collapsed: false,
};

const globalSlice = createSlice({
  name: 'global',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    setLocale: (state, action: PayloadAction<'zh-CN' | 'en-US'>) => {
      state.locale = action.payload;
    },
    setCurrentUser: (state, action: PayloadAction<GlobalState['currentUser']>) => {
      state.currentUser = action.payload;
    },
    setCollapsed: (state, action: PayloadAction<boolean>) => {
      state.collapsed = action.payload;
    },
  },
});

export const { setTheme, setLocale, setCurrentUser, setCollapsed } = globalSlice.actions;
export default globalSlice.reducer;
```

- [ ] **Step 2: 创建应用入口**

创建 `src/app.tsx`:

```tsx
import React from 'react';
import { Provider } from 'react-redux';
import { store } from '@@/plugin-model/model'; // Umi 内置
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';

// 运行时布局配置
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    logo: '/logo.png',
    menu: {
      locale: true,
    },
    token: {
      header: {
        colorBgHeader: '#fff',
      },
      sider: {
        colorMenuBackground: '#fff',
      },
    },
    logout: () => {
      localStorage.removeItem('token');
      history.push('/login');
    },
    onPageChange: () => {
      const { location } = history;
      if (location.pathname !== '/login' && !localStorage.getItem('token')) {
        history.push('/login');
      }
    },
  };
};

// 请求配置
export const request: RequestConfig = {
  timeout: 10000,
  requestInterceptors: [
    (config: any) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
      return config;
    },
  ],
  responseInterceptors: [
    (response: any) => {
      return response;
    },
  ],
};
```

- [ ] **Step 3: 验证状态管理**

```bash
npm run dev
```

验证：
- 页面正常加载
- 控制台无 Redux 相关错误

- [ ] **Step 4: 提交**

```bash
git add src/models/global.ts src/app.tsx
git commit -m "feat: add Redux global state and app entry"
```

---

### Task 5: 配置国际化

**Files:**
- Create: `src/locales/zh-CN.ts`
- Create: `src/locales/en-US.ts`

- [ ] **Step 1: 创建中文语言包**

创建 `src/locales/zh-CN.ts`:

```typescript
export default {
  'menu.dashboard': '湖总览',
  'menu.query': '湖查询',
  'menu.query.sql': 'SQL 查询',
  'menu.query.retrieval': '统一检索',
  'menu.query.copilot': 'AI 副驾驶',
  'menu.compute': '湖计算',
  'menu.compute.workflow': '工作流编排',
  'menu.compute.operators': '算子中心',
  'menu.compute.tasks': '任务中心',
  'menu.compute.jobs': '作业实例',
  'menu.compute.templates': '模板库',
  'menu.storage': '湖存储',
  'menu.storage.overview': '总览',
  'menu.storage.datasets': '数据集管理',
  'menu.storage.upload': '本地上传',
  'menu.storage.source': '来源接入',
  'menu.governance': '湖治理',
  'menu.governance.catalog': '数据目录',
  'menu.governance.lineage': '血缘追踪',
  'menu.ops': '湖运维',
  'menu.ops.cluster': '集群管理',
  'menu.ops.sql': 'SQL 编辑器',
  'menu.ops.alert': '告警监控',
  'menu.ops.inspection': '自动巡检',
  'menu.annotation': '自动标注',
  'menu.annotation.jobs': '标注任务',
  'menu.annotation.review': '标注审核',
  'menu.settings': '系统配置',
  'menu.settings.users': '用户管理',
  'menu.settings.roles': '角色权限',
  'menu.settings.config': '系统配置',
  'login.username': '用户名',
  'login.password': '密码',
  'login.submit': '登录',
  'login.success': '登录成功',
  'login.error': '用户名或密码错误',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.add': '新增',
  'common.search': '搜索',
  'common.reset': '重置',
  'common.loading': '加载中...',
  'common.noData': '暂无数据',
  'common.success': '操作成功',
  'common.error': '操作失败',
};
```

- [ ] **Step 2: 创建英文语言包**

创建 `src/locales/en-US.ts`:

```typescript
export default {
  'menu.dashboard': 'Dashboard',
  'menu.query': 'Query',
  'menu.query.sql': 'SQL Query',
  'menu.query.retrieval': 'Retrieval',
  'menu.query.copilot': 'AI Copilot',
  'menu.compute': 'Compute',
  'menu.compute.workflow': 'Workflow',
  'menu.compute.operators': 'Operators',
  'menu.compute.tasks': 'Tasks',
  'menu.compute.jobs': 'Jobs',
  'menu.compute.templates': 'Templates',
  'menu.storage': 'Storage',
  'menu.storage.overview': 'Overview',
  'menu.storage.datasets': 'Datasets',
  'menu.storage.upload': 'Upload',
  'menu.storage.source': 'Source',
  'menu.governance': 'Governance',
  'menu.governance.catalog': 'Catalog',
  'menu.governance.lineage': 'Lineage',
  'menu.ops': 'Operations',
  'menu.ops.cluster': 'Cluster',
  'menu.ops.sql': 'SQL Editor',
  'menu.ops.alert': 'Alerts',
  'menu.ops.inspection': 'Inspection',
  'menu.annotation': 'Annotation',
  'menu.annotation.jobs': 'Jobs',
  'menu.annotation.review': 'Review',
  'menu.settings': 'Settings',
  'menu.settings.users': 'Users',
  'menu.settings.roles': 'Roles',
  'menu.settings.config': 'Config',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Login',
  'login.success': 'Login successful',
  'login.error': 'Invalid username or password',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.search': 'Search',
  'common.reset': 'Reset',
  'common.loading': 'Loading...',
  'common.noData': 'No Data',
  'common.success': 'Success',
  'common.error': 'Error',
};
```

- [ ] **Step 3: 验证国际化**

```bash
npm run dev
```

验证：
- 菜单显示中文
- 切换语言后菜单显示英文

- [ ] **Step 4: 提交**

```bash
git add src/locales/zh-CN.ts src/locales/en-US.ts
git commit -m "feat: add i18n locale files"
```

---

### Task 6: 配置主题切换

**Files:**
- Create: `src/components/ThemeSwitch/index.tsx`
- Modify: `src/app.tsx`

- [ ] **Step 1: 创建主题切换组件**

创建 `src/components/ThemeSwitch/index.tsx`:

```tsx
import React from 'react';
import { Switch, Tooltip } from 'antd';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { setTheme } from '@/models/global';

const ThemeSwitch: React.FC = () => {
  const dispatch = useDispatch();
  const theme = useSelector((state: any) => state.global.theme);

  const handleThemeChange = (checked: boolean) => {
    dispatch(setTheme(checked ? 'dark' : 'light'));
    document.documentElement.setAttribute('data-theme', checked ? 'dark' : 'light');
  };

  return (
    <Tooltip title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}>
      <Switch
        checked={theme === 'dark'}
        onChange={handleThemeChange}
        checkedChildren={<MoonOutlined />}
        unCheckedChildren={<SunOutlined />}
      />
    </Tooltip>
  );
};

export default ThemeSwitch;
```

- [ ] **Step 2: 更新应用入口集成主题切换**

修改 `src/app.tsx`，在 layout 配置中添加主题切换：

```tsx
import React from 'react';
import type { RequestConfig, RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';
import ThemeSwitch from '@/components/ThemeSwitch';

// 运行时布局配置
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    logo: '/logo.png',
    menu: {
      locale: true,
    },
    token: {
      header: {
        colorBgHeader: '#fff',
      },
      sider: {
        colorMenuBackground: '#fff',
      },
    },
    actionsRender: () => [<ThemeSwitch key="theme" />],
    logout: () => {
      localStorage.removeItem('token');
      history.push('/login');
    },
    onPageChange: () => {
      const { location } = history;
      if (location.pathname !== '/login' && !localStorage.getItem('token')) {
        history.push('/login');
      }
    },
  };
};

// 请求配置
export const request: RequestConfig = {
  timeout: 10000,
  requestInterceptors: [
    (config: any) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
      return config;
    },
  ],
  responseInterceptors: [
    (response: any) => {
      return response;
    },
  ],
};
```

- [ ] **Step 3: 添加全局样式**

创建 `src/global.less`:

```less
:root {
  --primary-color: #1677ff;
  --bg-color: #fff;
  --text-color: rgba(0, 0, 0, 0.88);
}

[data-theme='dark'] {
  --primary-color: #1677ff;
  --bg-color: #141414;
  --text-color: rgba(255, 255, 255, 0.88);
}

body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

- [ ] **Step 4: 验证主题切换**

```bash
npm run dev
```

验证：
- 右上角显示主题切换开关
- 切换后页面主题变化

- [ ] **Step 5: 提交**

```bash
git add src/components/ThemeSwitch/index.tsx src/app.tsx src/global.less
git commit -m "feat: add theme switching support"
```

---

### Task 7: 配置权限系统

**Files:**
- Create: `src/access.ts`

- [ ] **Step 1: 创建权限定义**

创建 `src/access.ts`:

```typescript
export default function access(initialState: { currentUser?: API.CurrentUser }) {
  const { currentUser } = initialState || {};

  return {
    canAdmin: currentUser && currentUser.role === 'admin',
    canEdit: currentUser && ['admin', 'editor'].includes(currentUser.role || ''),
    canView: currentUser !== null,
    canUpload: currentUser && ['admin', 'editor'].includes(currentUser.role || ''),
    canDelete: currentUser && currentUser.role === 'admin',
  };
}
```

- [ ] **Step 2: 更新路由配置使用权限**

修改 `config/routes.ts`，为需要权限的路由添加 access：

```typescript
import type { IBestAFRoute } from '@umijs/max';

const routes: IBestAFRoute[] = [
  {
    path: '/login',
    component: 'login',
    layout: false,
    name: '登录',
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
      { path: '/storage/overview', name: '总览', component: 'storage/overview' },
      { path: '/storage/datasets', name: '数据集管理', component: 'storage/datasets' },
      { path: '/storage/upload', name: '本地上传', component: 'storage/upload', access: 'canUpload' },
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
    access: 'canAdmin',
    routes: [
      { path: '/settings/users', name: '用户管理', component: 'settings/users', access: 'canAdmin' },
      { path: '/settings/roles', name: '角色权限', component: 'settings/roles', access: 'canAdmin' },
      { path: '/settings/config', name: '系统配置', component: 'settings/config' },
    ],
  },
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '*',
    component: '404',
  },
];

export default routes;
```

- [ ] **Step 3: 验证权限**

```bash
npm run dev
```

验证：
- 未登录时跳转到登录页
- 登录后显示所有菜单
- 管理员菜单仅管理员可见

- [ ] **Step 4: 提交**

```bash
git add src/access.ts config/routes.ts
git commit -m "feat: add access control system"
```

---

### Task 8: 配置 API 服务

**Files:**
- Create: `src/services/api.ts`

- [ ] **Step 1: 创建 API 基础配置**

创建 `src/services/api.ts`:

```typescript
import { request } from '@umijs/max';

// API 响应类型
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 用户类型
export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
}

// 登录请求
export interface LoginRequest {
  username: string;
  password: string;
}

// 登录响应
export interface LoginResponse {
  token: string;
  user: User;
}

// 用户 API
export const userApi = {
  login: (data: LoginRequest) => request<ApiResponse<LoginResponse>>('/api/users/login', { method: 'POST', data }),
  logout: () => request<ApiResponse<void>>('/api/users/logout', { method: 'POST' }),
  getCurrentUser: () => request<ApiResponse<User>>('/api/users/current'),
  getUsers: () => request<ApiResponse<User[]>>('/api/users/list'),
};

// 数据集类型
export interface Dataset {
  id: string;
  name: string;
  description: string;
  type: string;
  row_count: number;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

// 数据集 API
export const datasetApi = {
  getDatasets: () => request<ApiResponse<Dataset[]>>('/api/platform/assets/tables'),
  getDataset: (id: string) => request<ApiResponse<Dataset>>(`/api/platform/assets/tables/${id}`),
};

// 搜索类型
export interface SearchResult {
  id: string;
  type: 'image' | 'text';
  score: number;
  content: any;
  metadata: Record<string, any>;
}

export interface SearchRequest {
  query: string;
  mode: 'text' | 'image' | 'hybrid';
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
}

// 搜索 API
export const searchApi = {
  search: (data: SearchRequest) => request<ApiResponse<{ results: SearchResult[]; total: number }>>('/api/search', { method: 'POST', data }),
};

// 副驾驶类型
export interface CopilotRequest {
  message: string;
  conversation_id?: string;
}

export interface CopilotResponse {
  conversation_id: string;
  message_id: string;
  reasoning: any;
  sql: string;
  execution: any;
  result?: any;
}

// 副驾驶 API
export const copilotApi = {
  chat: (data: CopilotRequest) => request<ApiResponse<CopilotResponse>>('/api/copilot/chat', { method: 'POST', data }),
};

// 仪表盘类型
export interface DashboardStats {
  total_files: number;
  total_datasets: number;
  cluster_nodes: number;
  ai_models: number;
}

// 仪表盘 API
export const dashboardApi = {
  getStats: () => request<ApiResponse<DashboardStats>>('/api/dashboard/stats'),
};
```

- [ ] **Step 2: 更新登录页使用 API**

修改 `src/pages/login/index.tsx`:

```tsx
import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import { userApi } from '@/services/api';

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const response = await userApi.login(values);
      if (response.code === 0) {
        localStorage.setItem('token', response.data.token);
        message.success('登录成功');
        history.push('/dashboard');
      } else {
        message.error(response.message || '登录失败');
      }
    } catch (error) {
      message.error('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="多模态数据湖仓" style={{ width: 400 }}>
        <Form onFinish={onFinish}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
```

- [ ] **Step 3: 验证 API 服务**

```bash
npm run dev
```

验证：
- 登录页正常显示
- 提交登录请求到后端

- [ ] **Step 4: 提交**

```bash
git add src/services/api.ts src/pages/login/index.tsx
git commit -m "feat: add API service layer"
```

---

### Task 9: 创建测试配置

**Files:**
- Create: `tests/setup.ts`
- Create: `jest.config.ts`

- [ ] **Step 1: 创建 Jest 配置**

创建 `jest.config.ts`:

```typescript
export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@@/(.*)$': '<rootDir>/src/.umi/$1',
  },
  setupFilesAfterSetup: ['<rootDir>/tests/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
```

- [ ] **Step 2: 创建测试设置文件**

创建 `tests/setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 3: 添加测试脚本**

修改 `package.json`，添加测试依赖：

```json
{
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^14.2.0",
    "jest-environment-jsdom": "^29.7.0",
    "ts-jest": "^29.1.0"
  }
}
```

- [ ] **Step 4: 运行测试验证**

```bash
npm test
```

验证测试环境正常工作。

- [ ] **Step 5: 提交**

```bash
git add tests/setup.ts jest.config.ts package.json
git commit -m "chore: add test configuration"
```

---

### Task 10: 验证完整项目

- [ ] **Step 1: 构建项目**

```bash
npm run build
```

验证构建成功，无错误。

- [ ] **Step 2: 启动开发服务器**

```bash
npm run dev
```

验证：
- 访问 http://localhost:8000
- 自动跳转到 /dashboard
- 登录页正常
- 侧边栏菜单显示正确
- 主题切换工作
- 国际化工作

- [ ] **Step 3: 运行测试**

```bash
npm test
```

验证所有测试通过。

- [ ] **Step 4: 最终提交**

```bash
git add .
git commit -m "chore: complete phase 1 foundation setup"
```

---

## Next Steps

Phase 1 完成后，继续 Phase 2: 核心功能，包括：
- BL-006 AI 数据副驾驶
- BL-007 多模态检索工作台
- BL-101 数据治理目录页
- BL-102 湖查询能力收口

---

*Plan Version: V1.0*  
*Created: 2026-06-03*
