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
    key: 'lake-management',
    title: '湖管理',
    note: '围绕总览、目录、接入与查询组织湖管理主界面',
    items: [
      { path: '/dashboard', code: '01', label: '湖总览', tag: 'Overview', description: '多模态数据湖规模、资产态势与关键链路总览' },
      { path: '/files', code: '02', label: '资产目录', tag: 'Catalog', description: '分层浏览入湖资产、Schema 与样本预览' },
      { path: '/upload', code: '03', label: '数据接入', tag: 'Ingress', description: '手工上传、批量接入与演示入湖入口' },
      { path: '/search', code: '04', label: '查询分析', tag: 'Query', description: 'Doris 外表、SQL 分析与语义检索入口' }
    ]
  },
  {
    key: 'lake-compute',
    title: '湖计算',
    note: '聚焦接入工作台、计算编排与任务治理链路',
    items: [
      { path: '/workbench', code: '05', label: '接入工作台', tag: 'LakeOps', description: '统一组织来源连接、扫描、索引和接入执行' },
      { path: '/workflow', code: '06', label: '计算编排', tag: 'Workflow', description: '围绕 Ray、Daft 与任务模板组织计算流程' },
      { path: '/governance', code: '07', label: '任务治理', tag: 'Ops', description: '跟踪批量任务状态、日志与回填结果' },
      { path: '/logs', code: '08', label: '系统日志', tag: 'Logs', description: '查看运行日志、诊断线索与系统告警' }
    ]
  },
  {
    key: 'system-config',
    title: '系统配置',
    note: '沉淀账号、接入与权限治理入口，作为平台配置面',
    items: [
      { path: '/settings/access', code: '09', label: '接入配置', tag: 'Config', description: '统一管理平台连接、接入模板和组件状态卡' },
      { path: '/settings/users', code: '10', label: '用户管理', tag: 'Users', description: '维护账号、角色和后续用户隔离能力底座' },
      { path: '/settings/permissions', code: '11', label: '权限管理', tag: 'IAM', description: '整理角色权限、资源范围和审批规则' }
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
            <div className="shell-eyebrow">Multimodal Data Lake</div>
            <div className="brand-title">Lake Control Center</div>
            <div className="brand-subtitle">湖管理 · 湖计算 · 系统配置</div>
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
          <div className="sidebar-section-label">Control Room</div>
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
              <div className="runtime-metric-note">Lake control routing</div>
            </div>
          </div>
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-section-label">Platform Fabric</div>
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
            当前界面按湖管理、湖计算、系统配置三组重排，先把控制面收口成白底黑字的湖平台风格。
          </div>
        </div>
      </aside>

      <main className="app-main">
        <section className="shell-toolbar shell-panel">
          <div className="shell-toolbar-main">
            <div className="shell-toolbar-kicker">Arco-aligned Enterprise Console</div>
            <div className="shell-toolbar-title">Lake Operations Control Surface</div>
            <div className="shell-toolbar-meta">
              <span className="toolbar-token is-primary">{currentGroup.title}</span>
              <span className="toolbar-token">Module {currentNav.code}</span>
              <span className="toolbar-token">{currentNav.path}</span>
            </div>
          </div>
          <div className="shell-toolbar-rail">
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">Control Plane</div>
              <div className="toolbar-pulse-value">{String(navItems.length).padStart(2, '0')}</div>
              <div className="toolbar-pulse-note">功能模块已编排</div>
            </div>
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">Current Group</div>
              <div className="toolbar-pulse-value">{currentGroup.title}</div>
              <div className="toolbar-pulse-note">企业控制台主分区</div>
            </div>
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">Checked</div>
              <div className="toolbar-pulse-value">{absoluteDate}</div>
              <div className="toolbar-pulse-note">控制面巡检日期</div>
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
              <div className="shell-stat-label">Console Brief</div>
              <div className="shell-brief-title">统一接入、编排、治理与权限控制</div>
              <div className="shell-brief-copy">
                以更接近 Arco Design 的企业控制台语言重排主壳层：强化层级、收敛色彩、突出状态与路径感。
              </div>
              <div className="shell-brief-metrics">
                <div className="shell-brief-metric">
                  <div className="shell-brief-metric-label">Active Route</div>
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
                <div className="shell-stat-label">核心栈</div>
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
