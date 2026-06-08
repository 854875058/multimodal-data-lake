# Core Workflow UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first implementation package for the confirmed UI refactor: preserve left-side first-level navigation names, clean visible Chinese text, add a reusable page shell, add shared state components, and create a low-fidelity structure prototype.

**Architecture:** Keep the existing Vite + React + Arco stack. Extract navigation and layout primitives from `App.jsx` into focused modules, then adopt them without changing page business logic. This plan intentionally stops before deep rewrites of `LakeQueryPage.jsx`, `IngestionCenterPage.jsx`, `WorkflowCenterPage.jsx`, `TaskCenterPage.jsx`, and `FilesPage.jsx`; those page-specific rewrites should each get a follow-up plan after the foundation lands.

**Tech Stack:** React 18, React Router 6, Arco Design React, Vitest, Vite, CSS modules via existing global CSS imports.

---

## File Structure

- Create `frontend/src/navigation/navConfig.jsx`
  - Owns first-level sidebar groups and second-level route entries.
  - Preserves current first-level group names: `湖总览`, `湖查询`, `湖计算`, `湖存储`, `湖治理`, `湖运维`, `系统配置`, `管理入口`.
  - Exports `navGroups`, `allNavItems`, `findCurrentNav()`, and `getVisibleNavGroups()`.
- Create `frontend/src/navigation/navConfig.test.js`
  - Verifies first-level names remain unchanged.
  - Verifies admin-only entries hide for non-admin users.
  - Verifies longest route match wins.
- Modify `frontend/src/App.jsx`
  - Imports navigation helpers.
  - Removes inline `navGroups` and `allNavItems`.
  - Replaces visible garbled text in app shell, loading state, user menu, and access denied page.
- Create `frontend/src/components/layout/PageScaffold.jsx`
  - Provides reusable page title, subtitle, actions, metric strip, and body regions.
- Create `frontend/src/components/layout/PageScaffold.test.jsx`
  - Verifies title, subtitle, actions, and metrics render.
- Create `frontend/src/components/states/PageStates.jsx`
  - Provides `LoadingState`, `EmptyState`, `ErrorState`, and `PermissionState`.
- Create `frontend/src/components/states/PageStates.test.jsx`
  - Verifies state components render actionable Chinese text.
- Create `frontend/src/assets/ui-foundation.css`
  - Adds scoped classes for page shell, metric strip, state blocks, filter/tool rows, and detail panels.
- Modify `frontend/src/main.jsx`
  - Imports `ui-foundation.css` after Arco overrides and before page-specific PRD styles, so foundation styles can be shared without breaking existing pages.
- Create `docs/design/core-workflow-ui-structure-prototype.html`
  - Static low-fidelity prototype showing the preserved first-level navigation and the core workflow structure.
- Modify `docs/superpowers/specs/2026-06-08-core-workflow-ui-refactor-design.md`
  - Add a short implementation note linking this plan as Phase 1.

---

### Task 1: Navigation Config Extraction

**Files:**
- Create: `frontend/src/navigation/navConfig.jsx`
- Create: `frontend/src/navigation/navConfig.test.js`

- [ ] **Step 1: Write the failing navigation tests**

Create `frontend/src/navigation/navConfig.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { allNavItems, findCurrentNav, getVisibleNavGroups, navGroups } from './navConfig.jsx'

describe('navConfig', () => {
  it('preserves first-level sidebar group names', () => {
    expect(navGroups.map((group) => group.title)).toEqual([
      '湖总览',
      '湖查询',
      '湖计算',
      '湖存储',
      '湖治理',
      '湖运维',
      '系统配置',
      '管理入口',
    ])
  })

  it('hides admin group for non-admin users', () => {
    const visible = getVisibleNavGroups({ isAdmin: false })
    expect(visible.map((group) => group.title)).not.toContain('管理入口')
    expect(visible.flatMap((group) => group.items).map((item) => item.path)).not.toContain('/settings/users')
  })

  it('shows admin group for admin users', () => {
    const visible = getVisibleNavGroups({ isAdmin: true })
    expect(visible.map((group) => group.title)).toContain('管理入口')
    expect(visible.flatMap((group) => group.items).map((item) => item.path)).toContain('/settings/users')
  })

  it('finds the longest matching route for nested pages', () => {
    const current = findCurrentNav('/lake-query/sql/history')
    expect(current.path).toBe('/lake-query/sql')
    expect(current.label).toBe('SQL 查询')
  })

  it('exposes every second-level item through allNavItems', () => {
    const itemCount = navGroups.reduce((sum, group) => sum + group.items.length, 0)
    expect(allNavItems).toHaveLength(itemCount)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm --prefix frontend run test -- src/navigation/navConfig.test.js
```

Expected: fails because `frontend/src/navigation/navConfig.jsx` does not exist.

- [ ] **Step 3: Implement navigation config**

Create `frontend/src/navigation/navConfig.jsx`:

```js
import {
  IconApps,
  IconBug,
  IconCalendarClock,
  IconCloudDownload,
  IconCommand,
  IconCommon,
  IconDashboard,
  IconExport,
  IconFile,
  IconLanguage,
  IconLayout,
  IconLock,
  IconNotification,
  IconRobot,
  IconSafe,
  IconSearch,
  IconSettings,
  IconStorage,
  IconUpload,
  IconUser,
  IconUserGroup,
} from '@arco-design/web-react/icon'

export const navGroups = [
  {
    key: 'lake-overview',
    title: '湖总览',
    icon: <IconDashboard />,
    items: [
      { path: '/dashboard', label: '湖仓总览', icon: <IconDashboard /> },
      { path: '/files', label: '资产目录', icon: <IconFile /> },
    ],
  },
  {
    key: 'lake-query',
    title: '湖查询',
    icon: <IconSearch />,
    items: [
      { path: '/lake-query/sql', label: 'SQL 查询', icon: <IconCommand /> },
      { path: '/lake-query/retrieval', label: '统一检索', icon: <IconSearch /> },
      { path: '/lake-query/vector', label: '向量检索', icon: <IconSearch /> },
      { path: '/lake-query/multimodal', label: '多模态检索', icon: <IconLayout /> },
      { path: '/lake-query/hybrid', label: '混合检索', icon: <IconCommon /> },
      { path: '/lake-query/copilot', label: 'AI 数据副驾驶', icon: <IconRobot /> },
      { path: '/lake-query/annotation', label: '自动化标注', icon: <IconExport /> },
    ],
  },
  {
    key: 'lake-compute',
    title: '湖计算',
    icon: <IconApps />,
    items: [
      { path: '/workflow', label: '工作流编排', icon: <IconLayout /> },
      { path: '/compute/operators', label: '算子中心', icon: <IconCommon /> },
      { path: '/task-center', label: '任务中心', icon: <IconCalendarClock /> },
      { path: '/compute/jobs', label: '作业实例', icon: <IconRobot /> },
      { path: '/compute/templates', label: '模板库', icon: <IconFile /> },
    ],
  },
  {
    key: 'lake-storage',
    title: '湖存储',
    icon: <IconStorage />,
    items: [
      { path: '/ingestion', label: '总览', icon: <IconStorage /> },
      { path: '/ingestion/source', label: '来源接入', icon: <IconCloudDownload /> },
      { path: '/ingestion/upload', label: '本地上传', icon: <IconUpload /> },
    ],
  },
  {
    key: 'lake-governance',
    title: '湖治理',
    icon: <IconSafe />,
    items: [
      { path: '/governance', label: '数据治理', icon: <IconSafe /> },
    ],
  },
  {
    key: 'mpp-database',
    title: '湖运维',
    icon: <IconDashboard />,
    items: [
      { path: '/mpp/cluster', label: '集群管理', icon: <IconCommon /> },
      { path: '/mpp/sql', label: 'SQL 编辑器', icon: <IconCommand /> },
      { path: '/mpp/alert', label: '告警监控', icon: <IconNotification /> },
      { path: '/mpp/inspection', label: '自动巡检', icon: <IconBug /> },
    ],
  },
  {
    key: 'system-config',
    title: '系统配置',
    icon: <IconSettings />,
    items: [
      { path: '/settings/access', label: '来源配置', icon: <IconSettings /> },
      { path: '/logs', label: '系统日志', icon: <IconLanguage /> },
    ],
  },
  {
    key: 'admin-tools',
    title: '管理入口',
    icon: <IconLock />,
    requiresAdmin: true,
    items: [
      { path: '/settings/users', label: '用户管理', icon: <IconUser />, requiresAdmin: true },
      { path: '/settings/permissions', label: '权限管理', icon: <IconUserGroup />, requiresAdmin: true },
    ],
  },
]

export const allNavItems = navGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, groupKey: group.key, groupTitle: group.title }))
)

export function getVisibleNavGroups({ isAdmin }) {
  return navGroups
    .filter((group) => !group.requiresAdmin || isAdmin)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.hidden && (!item.requiresAdmin || isAdmin)),
    }))
    .filter((group) => group.items.length > 0)
}

export function findCurrentNav(pathname) {
  return (
    allNavItems
      .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
      .sort((left, right) => right.path.length - left.path.length)[0] || allNavItems[0]
  )
}
```

- [ ] **Step 4: Run the navigation test**

Run:

```powershell
npm --prefix frontend run test -- src/navigation/navConfig.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/navigation/navConfig.jsx frontend/src/navigation/navConfig.test.js
git commit -m "feat(frontend): extract preserved navigation config"
```

---

### Task 2: App Shell Text Cleanup and Navigation Adoption

**Files:**
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/navigation/navConfig.test.js`

- [ ] **Step 1: Verify current build works before editing**

Run:

```powershell
npm --prefix frontend run build
```

Expected: build succeeds. If it fails before edits, stop and record the existing failure.

- [ ] **Step 2: Replace inline nav imports and remove icon imports no longer used by `App.jsx`**

Modify the import block in `frontend/src/App.jsx`:

```jsx
import { Suspense, lazy, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Avatar,
  Breadcrumb,
  Button,
  Dropdown,
  Layout,
  Menu,
  Space,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react'
import {
  IconCaretDown,
  IconExport,
  IconSearch,
  IconUser,
  IconLock,
} from '@arco-design/web-react/icon'
import { clearAuthSession, loadAuthSession, saveAuthSession, subscribeAuthSession } from '@/auth/session'
import { findCurrentNav, getVisibleNavGroups } from '@/navigation/navConfig.jsx'
import boncLogo from '@/assets/bonc.jpg'
import CommandPalette from './components/CommandPalette.jsx'
import NotificationCenter from './components/NotificationCenter.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
```

- [ ] **Step 3: Remove inline `navGroups` and `allNavItems` from `App.jsx`**

Delete the inline `const navGroups = [...]` and `const allNavItems = ...` blocks from `frontend/src/App.jsx`.

In `AppShell`, replace current navigation calculation with:

```jsx
  const currentNav = findCurrentNav(location.pathname)

  const currentUser = authSession.user
  const showAdminLinks = Boolean(currentUser?.is_admin)
  const visibleGroups = getVisibleNavGroups({ isAdmin: showAdminLinks })
```

- [ ] **Step 4: Replace visible garbled shell text**

In `frontend/src/App.jsx`, set these exact strings:

```jsx
function PageLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
      <Spin size={32} tip="加载中..." />
    </div>
  )
}

function getDisplayName(user) {
  if (!user) return '未登录用户'
  return user.full_name || user.username
}
```

In the sidebar brand block:

```jsx
<div style={{ fontSize: 16, fontWeight: 700, lineHeight: '22px', color: 'var(--color-text-1)' }}>
  湖仓控制台
</div>
<div style={{ marginTop: 3, fontSize: 12, lineHeight: '18px', color: 'var(--color-text-3)' }}>
  多模态数据湖
</div>
```

In role labels:

```jsx
const roleLabel = user?.is_admin ? '系统管理员' : '平台用户'
```

Access denied page:

```jsx
<Title heading={4}>当前账号无权访问管理入口</Title>
<Text type="secondary">
  当前身份：<Tag color="orange">{roleLabel}</Tag>，请使用管理员账号登录。
</Text>
...
<Button type="primary">返回控制台</Button>
```

User menu logout:

```jsx
<span>退出登录</span>
```

Command palette shortcut text:

```jsx
<span style={{ fontSize: 12, marginLeft: 4, color: 'var(--color-text-3)' }}>Ctrl K</span>
```

- [ ] **Step 5: Run tests and build**

Run:

```powershell
npm --prefix frontend run test -- src/navigation/navConfig.test.js
npm --prefix frontend run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add frontend/src/App.jsx frontend/src/navigation/navConfig.jsx frontend/src/navigation/navConfig.test.js
git commit -m "refactor(frontend): adopt shared navigation config"
```

---

### Task 3: Shared Page Scaffold Component

**Files:**
- Create: `frontend/src/components/layout/PageScaffold.jsx`
- Create: `frontend/src/components/layout/PageScaffold.test.jsx`

- [ ] **Step 1: Write the failing scaffold tests**

Create `frontend/src/components/layout/PageScaffold.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PageScaffold, { MetricStrip } from './PageScaffold'

describe('PageScaffold', () => {
  it('renders title, subtitle, actions, metrics, and children', () => {
    render(
      <PageScaffold
        title="湖查询"
        subtitle="统一 SQL、向量与多模态检索能力"
        actions={<button type="button">新建查询</button>}
        metrics={[
          { label: '今日查询', value: '1,284', trend: '+12%' },
          { label: '平均耗时', value: '320ms', status: 'good' },
        ]}
      >
        <div>查询工作区</div>
      </PageScaffold>
    )

    expect(screen.getByText('湖查询')).toBeInTheDocument()
    expect(screen.getByText('统一 SQL、向量与多模态检索能力')).toBeInTheDocument()
    expect(screen.getByText('新建查询')).toBeInTheDocument()
    expect(screen.getByText('今日查询')).toBeInTheDocument()
    expect(screen.getByText('1,284')).toBeInTheDocument()
    expect(screen.getByText('查询工作区')).toBeInTheDocument()
  })

  it('renders MetricStrip without a page shell', () => {
    render(<MetricStrip metrics={[{ label: '运行中', value: 8 }]} />)
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm --prefix frontend run test -- src/components/layout/PageScaffold.test.jsx
```

Expected: fails because `PageScaffold.jsx` does not exist.

- [ ] **Step 3: Implement scaffold component**

Create `frontend/src/components/layout/PageScaffold.jsx`:

```jsx
import { Space } from '@arco-design/web-react'

export function MetricStrip({ metrics = [] }) {
  if (!metrics.length) return null

  return (
    <div className="ui-metric-strip">
      {metrics.map((metric) => (
        <div className="ui-metric-card" data-status={metric.status || 'neutral'} key={metric.label}>
          <div className="ui-metric-label">{metric.label}</div>
          <div className="ui-metric-value">{metric.value}</div>
          {metric.trend ? <div className="ui-metric-trend">{metric.trend}</div> : null}
        </div>
      ))}
    </div>
  )
}

export default function PageScaffold({
  title,
  subtitle,
  actions,
  metrics = [],
  children,
  className = '',
}) {
  return (
    <section className={`ui-page-shell ${className}`.trim()}>
      <header className="ui-page-header">
        <div className="ui-page-heading">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <Space className="ui-page-actions">{actions}</Space> : null}
      </header>
      <MetricStrip metrics={metrics} />
      <div className="ui-page-body">{children}</div>
    </section>
  )
}
```

- [ ] **Step 4: Run scaffold tests**

Run:

```powershell
npm --prefix frontend run test -- src/components/layout/PageScaffold.test.jsx
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/components/layout/PageScaffold.jsx frontend/src/components/layout/PageScaffold.test.jsx
git commit -m "feat(frontend): add shared page scaffold"
```

---

### Task 4: Shared Page State Components

**Files:**
- Create: `frontend/src/components/states/PageStates.jsx`
- Create: `frontend/src/components/states/PageStates.test.jsx`

- [ ] **Step 1: Write failing state component tests**

Create `frontend/src/components/states/PageStates.test.jsx`:

```jsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState, ErrorState, LoadingState, PermissionState } from './PageStates'

describe('PageStates', () => {
  it('renders loading state', () => {
    render(<LoadingState text="正在加载资产目录" />)
    expect(screen.getByText('正在加载资产目录')).toBeInTheDocument()
  })

  it('renders empty state with action', () => {
    const onAction = vi.fn()
    render(<EmptyState title="暂无数据集" description="上传文件后会在这里生成数据集。" actionText="去上传" onAction={onAction} />)
    fireEvent.click(screen.getByText('去上传'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders error state with retry', () => {
    const onRetry = vi.fn()
    render(<ErrorState title="加载失败" description="服务暂时不可用，请稍后重试。" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('重试'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders permission state', () => {
    render(<PermissionState role="平台用户" />)
    expect(screen.getByText('当前账号无权访问')).toBeInTheDocument()
    expect(screen.getByText(/平台用户/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm --prefix frontend run test -- src/components/states/PageStates.test.jsx
```

Expected: fails because `PageStates.jsx` does not exist.

- [ ] **Step 3: Implement page states**

Create `frontend/src/components/states/PageStates.jsx`:

```jsx
import { Button, Spin } from '@arco-design/web-react'

export function LoadingState({ text = '加载中...' }) {
  return (
    <div className="ui-state-block" role="status">
      <Spin size={28} />
      <div className="ui-state-title">{text}</div>
    </div>
  )
}

export function EmptyState({ title = '暂无数据', description, actionText, onAction }) {
  return (
    <div className="ui-state-block">
      <div className="ui-state-icon">--</div>
      <div className="ui-state-title">{title}</div>
      {description ? <div className="ui-state-desc">{description}</div> : null}
      {actionText && onAction ? (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      ) : null}
    </div>
  )
}

export function ErrorState({ title = '页面加载失败', description = '请稍后重试。', onRetry }) {
  return (
    <div className="ui-state-block ui-state-error" role="alert">
      <div className="ui-state-icon">!</div>
      <div className="ui-state-title">{title}</div>
      <div className="ui-state-desc">{description}</div>
      {onRetry ? (
        <Button type="primary" status="danger" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  )
}

export function PermissionState({ role = '当前用户' }) {
  return (
    <div className="ui-state-block ui-state-warning">
      <div className="ui-state-icon">!</div>
      <div className="ui-state-title">当前账号无权访问</div>
      <div className="ui-state-desc">当前身份：{role}。如需访问，请联系管理员开通权限。</div>
    </div>
  )
}
```

- [ ] **Step 4: Run state component tests**

Run:

```powershell
npm --prefix frontend run test -- src/components/states/PageStates.test.jsx
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/components/states/PageStates.jsx frontend/src/components/states/PageStates.test.jsx
git commit -m "feat(frontend): add shared page state components"
```

---

### Task 5: UI Foundation Styles

**Files:**
- Create: `frontend/src/assets/ui-foundation.css`
- Modify: `frontend/src/main.jsx`
- Test: `frontend/src/components/layout/PageScaffold.test.jsx`
- Test: `frontend/src/components/states/PageStates.test.jsx`

- [ ] **Step 1: Create foundation CSS**

Create `frontend/src/assets/ui-foundation.css`:

```css
.ui-page-shell {
  min-height: 100%;
  padding: 20px 24px 28px;
  color: var(--text-primary, #1f2937);
}

.ui-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ui-page-heading {
  min-width: 0;
}

.ui-page-heading h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.3;
  font-weight: 700;
  color: var(--ink-strong, #111827);
  letter-spacing: 0;
}

.ui-page-heading p {
  margin: 6px 0 0;
  max-width: 760px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary, #4b5563);
}

.ui-page-actions {
  flex-shrink: 0;
}

.ui-page-body {
  display: grid;
  gap: 14px;
}

.ui-metric-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.ui-metric-card {
  min-height: 84px;
  padding: 14px;
  border: 1px solid var(--panel-border, #e5e7eb);
  border-radius: 8px;
  background: var(--panel-bg, #fff);
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(15, 23, 42, 0.04));
}

.ui-metric-label {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-muted, #6b7280);
}

.ui-metric-value {
  margin-top: 8px;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--ink-strong, #111827);
  font-variant-numeric: tabular-nums;
}

.ui-metric-trend {
  margin-top: 6px;
  font-size: 12px;
  color: var(--success, #12b886);
}

.ui-state-block {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 40px 20px;
  border: 1px solid var(--panel-border, #e5e7eb);
  border-radius: 8px;
  background: var(--panel-bg, #fff);
  text-align: center;
}

.ui-state-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-soft, rgba(22, 100, 255, 0.08));
  color: var(--accent, #1664ff);
  font-weight: 700;
}

.ui-state-title {
  font-size: 15px;
  line-height: 1.5;
  font-weight: 700;
  color: var(--ink-strong, #111827);
}

.ui-state-desc {
  max-width: 520px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary, #4b5563);
}

.ui-state-error .ui-state-icon {
  background: var(--danger-soft, rgba(250, 82, 82, 0.12));
  color: var(--danger, #fa5252);
}

.ui-state-warning .ui-state-icon {
  background: var(--warning-soft, rgba(245, 159, 0, 0.12));
  color: var(--warning, #f59f00);
}

.ui-tool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--panel-border, #e5e7eb);
  border-radius: 8px;
  background: var(--panel-bg, #fff);
}

.ui-detail-panel {
  border: 1px solid var(--panel-border, #e5e7eb);
  border-radius: 8px;
  background: var(--panel-bg, #fff);
  overflow: hidden;
}

@media (max-width: 760px) {
  .ui-page-shell {
    padding: 16px;
  }

  .ui-page-header {
    flex-direction: column;
  }

  .ui-page-actions {
    width: 100%;
  }
}
```

- [ ] **Step 2: Import foundation CSS**

Modify `frontend/src/main.jsx` import order:

```jsx
import './assets/styles.css'
import './assets/arco-overrides.css'
import './assets/ui-foundation.css'
import './assets/prd-style.css'
```

- [ ] **Step 3: Run component tests**

Run:

```powershell
npm --prefix frontend run test -- src/components/layout/PageScaffold.test.jsx src/components/states/PageStates.test.jsx
```

Expected: pass.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm --prefix frontend run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/assets/ui-foundation.css frontend/src/main.jsx
git commit -m "style(frontend): add UI foundation styles"
```

---

### Task 6: Low-Fidelity Structure Prototype

**Files:**
- Create: `docs/design/core-workflow-ui-structure-prototype.html`
- Modify: `docs/superpowers/specs/2026-06-08-core-workflow-ui-refactor-design.md`

- [ ] **Step 1: Create static prototype HTML**

Create `docs/design/core-workflow-ui-structure-prototype.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>核心业务流 UI 结构原型</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, "Microsoft YaHei", Arial, sans-serif; color: #111827; background: #f5f7fb; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: 260px 1fr; }
    .side { background: #fff; border-right: 1px solid #e5e7eb; padding: 16px 12px; }
    .brand { height: 54px; display: flex; align-items: center; gap: 10px; font-weight: 800; }
    .logo { width: 34px; height: 34px; border-radius: 8px; background: #165dff; }
    .group { margin-top: 14px; }
    .group-title { font-size: 12px; font-weight: 800; color: #475569; margin: 0 8px 8px; }
    .item { height: 32px; display: flex; align-items: center; padding: 0 10px; border-radius: 7px; color: #334155; font-size: 13px; }
    .item.active { background: #eff6ff; color: #165dff; font-weight: 700; }
    .main { min-width: 0; display: grid; grid-template-rows: 56px 1fr; }
    .top { background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; padding: 0 22px; }
    .content { padding: 22px; display: grid; gap: 16px; }
    .title h1 { margin: 0; font-size: 22px; }
    .title p { margin: 6px 0 0; color: #64748b; font-size: 13px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .metric, .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .metric .k { color: #64748b; font-size: 12px; }
    .metric .v { margin-top: 8px; font-size: 24px; font-weight: 800; }
    .flow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
    .step { min-height: 112px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .step strong { display: block; margin-bottom: 8px; }
    .step span { color: #64748b; font-size: 12px; line-height: 1.7; }
    .workspace { display: grid; grid-template-columns: 1.15fr .85fr; gap: 16px; }
    .rows { display: grid; gap: 8px; }
    .row { height: 34px; border-radius: 6px; background: #f8fafc; border: 1px solid #edf2f7; }
    @media (max-width: 900px) { .shell { grid-template-columns: 1fr; } .side { display: none; } .metrics, .flow, .workspace { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="side">
      <div class="brand"><div class="logo"></div><div>湖仓控制台</div></div>
      <div class="group"><div class="group-title">湖总览</div><div class="item active">湖仓总览</div><div class="item">资产目录</div></div>
      <div class="group"><div class="group-title">湖查询</div><div class="item">SQL 查询</div><div class="item">统一检索</div><div class="item">AI 数据副驾驶</div></div>
      <div class="group"><div class="group-title">湖计算</div><div class="item">工作流编排</div><div class="item">算子中心</div><div class="item">任务中心</div></div>
      <div class="group"><div class="group-title">湖存储</div><div class="item">总览</div><div class="item">来源接入</div><div class="item">本地上传</div></div>
      <div class="group"><div class="group-title">湖治理</div><div class="item">数据治理</div></div>
      <div class="group"><div class="group-title">湖运维</div><div class="item">集群管理</div><div class="item">告警监控</div></div>
    </aside>
    <main class="main">
      <header class="top"><span>湖总览 / 湖仓总览</span><span>平台用户</span></header>
      <section class="content">
        <div class="title">
          <h1>核心业务流工作台</h1>
          <p>保留一级导航名称，重构页面内部结构和跨页面流转。</p>
        </div>
        <div class="metrics">
          <div class="metric"><div class="k">接入任务</div><div class="v">18</div></div>
          <div class="metric"><div class="k">今日查询</div><div class="v">1,284</div></div>
          <div class="metric"><div class="k">运行作业</div><div class="v">9</div></div>
          <div class="metric"><div class="k">数据资产</div><div class="v">326</div></div>
        </div>
        <div class="flow">
          <div class="step"><strong>湖存储</strong><span>来源接入、本地上传、入湖结果。</span></div>
          <div class="step"><strong>湖查询</strong><span>SQL、统一检索、向量和多模态检索。</span></div>
          <div class="step"><strong>湖计算</strong><span>工作流编排、算子、作业实例。</span></div>
          <div class="step"><strong>任务中心</strong><span>统一任务状态、日志、重试和取消。</span></div>
          <div class="step"><strong>湖治理</strong><span>资产目录、版本、Schema 和血缘。</span></div>
        </div>
        <div class="workspace">
          <div class="panel"><strong>列表/表格区域</strong><div class="rows"><div class="row"></div><div class="row"></div><div class="row"></div><div class="row"></div></div></div>
          <div class="panel"><strong>详情/状态区域</strong><div class="rows"><div class="row"></div><div class="row"></div><div class="row"></div></div></div>
        </div>
      </section>
    </main>
  </div>
</body>
</html>
```

- [ ] **Step 2: Link the plan from the spec**

Append this note to `docs/superpowers/specs/2026-06-08-core-workflow-ui-refactor-design.md`:

```markdown
## 14. Implementation Plans

- Phase 1 UI foundation: `docs/superpowers/plans/2026-06-08-core-workflow-ui-foundation.md`
```

- [ ] **Step 3: Verify the prototype file exists and contains Chinese text**

Run:

```powershell
Select-String -Path docs\design\core-workflow-ui-structure-prototype.html -Pattern '核心业务流工作台'
```

Expected: output contains the matching line.

- [ ] **Step 4: Commit**

Run:

```powershell
git add docs/design/core-workflow-ui-structure-prototype.html docs/superpowers/specs/2026-06-08-core-workflow-ui-refactor-design.md
git commit -m "docs: add core workflow UI structure prototype"
```

---

### Task 7: Foundation Verification

**Files:**
- Verify: `frontend/src/navigation/navConfig.test.js`
- Verify: `frontend/src/components/layout/PageScaffold.test.jsx`
- Verify: `frontend/src/components/states/PageStates.test.jsx`
- Verify: `frontend/src/App.jsx`
- Verify: `frontend/src/assets/ui-foundation.css`

- [ ] **Step 1: Run targeted frontend tests**

Run:

```powershell
npm --prefix frontend run test -- src/navigation/navConfig.test.js src/components/layout/PageScaffold.test.jsx src/components/states/PageStates.test.jsx
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full frontend tests**

Run:

```powershell
npm --prefix frontend run test
```

Expected: all existing tests pass. If existing tests fail because of pre-existing garbled expectations, update the affected test expectations only when the corresponding production text is corrected in the same task.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm --prefix frontend run build
```

Expected: build succeeds.

- [ ] **Step 4: Check for visible app-shell garbled text**

Run:

```powershell
Select-String -Path frontend\src\App.jsx -Pattern '�|鈥|绯|鏉|婀|涓|鍔|閫'
```

Expected: no matches in user-visible text. Matches inside comments should be removed or rewritten as readable Chinese.

- [ ] **Step 5: Check git status**

Run:

```powershell
git status --short
```

Expected: no uncommitted changes from the implementation tasks. Pre-existing unrelated files may still appear; do not add them to foundation commits.

---

## Self-Review

- Spec coverage:
  - Preserved first-level sidebar titles: Task 1 and Task 2.
  - UI foundation and page scaffold: Task 3 and Task 5.
  - Shared loading, empty, error, permission states: Task 4.
  - Prototype strategy: Task 6.
  - Verification: Task 7.
- Known planned follow-up:
  - Deep page-specific refactors for `LakeQueryPage.jsx`, `IngestionCenterPage.jsx`, `WorkflowCenterPage.jsx`, `TaskCenterPage.jsx`, and `FilesPage.jsx` are intentionally excluded from this foundation plan and should each receive a focused plan after this one lands.
