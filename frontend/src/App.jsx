import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage.jsx'
import ConfigCenterPage from './pages/ConfigCenterPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import FilesPage from './pages/FilesPage.jsx'
import IngestionWorkbenchPage from './pages/IngestionWorkbenchPage.jsx'
import LogsPage from './pages/LogsPage.jsx'
import PermissionManagementPage from './pages/PermissionManagementPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import TaskGovernancePage from './pages/TaskGovernancePage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import UserManagementPage from './pages/UserManagementPage.jsx'
import WorkflowCenterPage from './pages/WorkflowCenterPage.jsx'

const navGroups = [
  {
    key: 'data-lake',
    title: '数据湖',
    note: '围绕总览、目录、接入与查询组织数据湖主界面',
    items: [
      { path: '/dashboard', code: '01', label: '湖总览', tag: '总览', description: '多模态数据湖规模、资产态势与关键链路总览' },
      { path: '/files', code: '02', label: '资产目录', tag: '目录', description: '分层浏览入湖资产、Schema 与样本预览' },
      { path: '/upload', code: '03', label: '数据接入', tag: '接入', description: '手工上传、批量接入与统一入湖入口' },
      { path: '/search', code: '04', label: '查询分析', tag: '查询', description: 'Doris 外表、SQL 分析与语义检索入口' }
    ]
  },
  {
    key: 'task-center',
    title: '任务中心',
    note: '聚焦接入执行、计算编排与任务治理链路',
    items: [
      { path: '/workbench', code: '05', label: '接入工作台', tag: '工作台', description: '统一组织来源连接、扫描、索引和接入执行' },
      { path: '/workflow', code: '06', label: '工作流编排', tag: '编排', description: '围绕 Ray、Daft 与任务模板组织计算流程' },
      { path: '/governance', code: '07', label: '任务治理', tag: '治理', description: '跟踪批量任务状态、执行回填与任务结果' }
    ]
  },
  {
    key: 'platform-admin',
    title: '平台管理',
    note: '统一承接平台配置、账号权限与系统运维入口',
    items: [
      { path: '/logs', code: '08', label: '系统日志', tag: '日志', description: '查看运行日志、诊断线索、系统告警与巡检状态' },
      { path: '/settings/access', code: '09', label: '接入配置', tag: '配置', description: '统一管理平台连接、接入模板和组件状态卡' },
      { path: '/settings/users', code: '10', label: '用户管理', tag: '用户', description: '维护账号、角色和后续用户隔离能力底座' },
      { path: '/settings/permissions', code: '11', label: '权限管理', tag: '权限', description: '整理角色权限、资源范围和审批规则' }
    ]
  }
]

const navItems = navGroups.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupKey: group.key,
    groupTitle: group.title,
    groupNote: group.note
  }))
)

function AppShell() {
  const location = useLocation()
  const currentNav = navItems.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  ) || navItems[0]
  const currentGroup = navGroups.find((group) => group.key === currentNav.groupKey) || navGroups[0]
  const checkedDate = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).format(new Date())
  const absoluteDate = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
  const highlightedModules = currentGroup.items.slice(0, 4)

  return (
    <div className="app-shell">
      <aside className="sidebar shell-panel">
        <div className="brand-block">
          <div className="brand-logo">ML</div>
          <div className="brand-copy">
            <div className="shell-eyebrow">多模态数据湖</div>
            <div className="brand-title">湖仓控制台</div>
            <div className="brand-subtitle">数据湖 · 任务中心 · 平台管理</div>
          </div>
        </div>

        <div className="sidebar-divider" />

        <nav className="nav-list">
          {navGroups.map((group) => (
            <section className="nav-group" key={group.key}>
              <div className="sidebar-section-label">{group.title}</div>
              <div className="nav-group-note">{group.note}</div>
              <div className="nav-group-list">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
                  >
                    <span className="nav-index" aria-hidden="true">{item.code}</span>
                    <span className="nav-copy">
                      <span className="nav-label">{item.label}</span>
                      <span className="nav-hint">{item.description}</span>
                    </span>
                    <span className="nav-tag">{item.tag}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="sidebar-runtime-card">
          <div className="sidebar-section-label">控制室</div>
          <div className="sidebar-runtime-grid">
            <div className="runtime-metric">
              <div className="runtime-metric-label">当前模块</div>
              <div className="runtime-metric-value">{currentNav.code}</div>
              <div className="runtime-metric-note">{currentNav.label}</div>
            </div>
            <div className="runtime-metric">
              <div className="runtime-metric-label">模块总数</div>
              <div className="runtime-metric-value">{String(navItems.length).padStart(2, '0')}</div>
              <div className="runtime-metric-note">控制台导航矩阵</div>
            </div>
            <div className="runtime-metric is-wide">
              <div className="runtime-metric-label">当前路径</div>
              <div className="runtime-metric-path">{currentNav.path}</div>
              <div className="runtime-metric-note">控制台路由定位</div>
            </div>
          </div>
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-section-label">平台基座</div>
          <div className="sidebar-pill-row">
            <span className="sidebar-pill">Gravitino</span>
            <span className="sidebar-pill">SeaweedFS</span>
            <span className="sidebar-pill">Lance</span>
          </div>
          <div className="sidebar-pill-row">
            <span className="sidebar-pill">Ray</span>
            <span className="sidebar-pill">Doris</span>
            <span className="sidebar-pill">React</span>
            <span className="sidebar-pill">FastAPI</span>
          </div>
          <div className="sidebar-note">
            当前界面按数据湖、任务中心、平台管理三组重排，突出控制台主路径、状态信息与模块切换关系。
          </div>
        </div>
      </aside>

      <main className="app-main">
        <section className="shell-toolbar shell-panel">
          <div className="shell-toolbar-main">
            <div className="shell-toolbar-kicker">多模态数据湖统一控制面</div>
            <div className="shell-toolbar-title">湖仓运行控制台</div>
            <div className="shell-toolbar-meta">
              <span className="toolbar-token is-primary">{currentGroup.title}</span>
              <span className="toolbar-token">模块 {currentNav.code}</span>
              <span className="toolbar-token">{currentNav.path}</span>
            </div>
          </div>
          <div className="shell-toolbar-rail">
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">控制面</div>
              <div className="toolbar-pulse-value">{String(navItems.length).padStart(2, '0')}</div>
              <div className="toolbar-pulse-note">功能模块已编入控制台</div>
            </div>
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">当前分组</div>
              <div className="toolbar-pulse-value">{currentGroup.title}</div>
              <div className="toolbar-pulse-note">企业控制台主分区</div>
            </div>
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">巡检日期</div>
              <div className="toolbar-pulse-value">{absoluteDate}</div>
              <div className="toolbar-pulse-note">控制面最近核验日期</div>
            </div>
          </div>
        </section>

        <section className="shell-header">
          <div className="shell-header-main">
            <div className="shell-eyebrow">{currentGroup.title}</div>
            <div className="shell-title-row">
              <h1 className="shell-title">{currentNav.label}</h1>
              <span className="shell-badge">{currentNav.tag}</span>
            </div>
            <p className="shell-subtitle">{currentNav.description}</p>

            <div className="shell-command-row">
              {highlightedModules.map((item) => (
                <div key={item.path} className={`command-pill${item.path === currentNav.path ? ' is-active' : ''}`}>
                  <span className="command-pill-code">{item.code}</span>
                  <span className="command-pill-label">{item.label}</span>
                </div>
              ))}
            </div>

            <div className="shell-subnav">
              {currentGroup.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `subnav-item${isActive ? ' is-active' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="shell-side-panel">
            <div className="shell-brief-card">
              <div className="shell-stat-label">控制台简报</div>
              <div className="shell-brief-title">统一接入、任务协同与平台治理</div>
              <div className="shell-brief-copy">
                以平台控制面的方式组织导航、状态卡和子路由，让业务操作、任务执行与系统管理各归其位。
              </div>
              <div className="shell-brief-metrics">
                <div className="shell-brief-metric">
                  <div className="shell-brief-metric-label">当前路由</div>
                  <div className="shell-brief-metric-value">{currentNav.path}</div>
                </div>
                <div className="shell-brief-metric">
                  <div className="shell-brief-metric-label">巡检时间</div>
                  <div className="shell-brief-metric-value">{checkedDate}</div>
                </div>
              </div>
            </div>
            <div className="shell-stat-grid">
              <div className="shell-stat-card">
                <div className="shell-stat-label">当前分组</div>
                <div className="shell-stat-value">{currentGroup.title}</div>
                <div className="shell-stat-note">{currentGroup.note}</div>
              </div>
              <div className="shell-stat-card">
                <div className="shell-stat-label">二级模块</div>
                <div className="shell-stat-value">{String(currentGroup.items.length).padStart(2, '0')}</div>
                <div className="shell-stat-note">当前分组下可切换的功能模块</div>
              </div>
              <div className="shell-stat-card">
                <div className="shell-stat-label">技术底座</div>
                <div className="shell-stat-value">R / F</div>
                <div className="shell-stat-note">React / FastAPI / Gravitino / Lance</div>
              </div>
            </div>
          </div>
        </section>

        <div className="page-stage">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workbench" element={<ErrorBoundary pageName="接入工作台"><IngestionWorkbenchPage /></ErrorBoundary>} />
            <Route path="/workflow" element={<WorkflowCenterPage />} />
            <Route path="/governance" element={<TaskGovernancePage />} />
            <Route path="/settings" element={<Navigate to="/settings/access" replace />} />
            <Route path="/settings/access" element={<ConfigCenterPage />} />
            <Route path="/settings/users" element={<UserManagementPage />} />
            <Route path="/settings/permissions" element={<PermissionManagementPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return <AppShell />
}
