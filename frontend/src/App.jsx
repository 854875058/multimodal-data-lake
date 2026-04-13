import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { clearAuthSession, loadAuthSession, saveAuthSession, subscribeAuthSession } from '@/auth/session'
import ConfigCenterPage from './pages/ConfigCenterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import FilesPage from './pages/FilesPage.jsx'
import IngestionWorkbenchPage from './pages/IngestionWorkbenchPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import LogsPage from './pages/LogsPage.jsx'
import PermissionManagementPage from './pages/PermissionManagementPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import TaskGovernancePage from './pages/TaskGovernancePage.jsx'
import UploadPage from './pages/UploadPage.jsx'
import UserManagementPage from './pages/UserManagementPage.jsx'
import WorkflowCenterPage from './pages/WorkflowCenterPage.jsx'

const navGroups = [
  {
    key: 'lake-overview',
    title: '湖总览',
    note: '概览、目录与运行态势',
    items: [
      { path: '/dashboard', code: '01', label: '湖总览', tag: '总览', description: '指标总览与运行态势' },
      { path: '/files', code: '02', label: '资产目录', tag: '目录', description: '分层浏览入湖资产' }
    ]
  },
  {
    key: 'lake-compute',
    title: '湖计算',
    note: '查询、编排与任务治理',
    items: [
      { path: '/search', code: '03', label: '查询分析', tag: '查询', description: 'SQL 与语义检索' },
      { path: '/workflow', code: '04', label: '工作流编排', tag: '编排', description: '流程模板与资源编排' },
      { path: '/governance', code: '05', label: '任务治理', tag: '治理', description: '作业状态与执行回填' }
    ]
  },
  {
    key: 'lake-storage',
    title: '湖存储',
    note: '接入与本地上传',
    items: [
      { path: '/workbench', code: '06', label: '接入工作台', tag: '工作台', description: 'S3、SFTP 与批量入湖' },
      { path: '/upload', code: '07', label: '本地上传', tag: '上传', description: '本地文件与压缩包上传' }
    ]
  }
]

const systemGroup = {
  key: 'system-config',
  title: '系统配置',
  note: '连接配置、日志与巡检诊断',
  items: [
    { path: '/settings/access', code: '08', label: '来源配置', tag: '配置', description: '连接参数与默认模板' },
    { path: '/logs', code: '09', label: '系统日志', tag: '日志', description: '日志诊断与巡检视图' }
  ]
}

const adminGroup = {
  key: 'admin-tools',
  title: '管理入口',
  note: '账号、角色与权限控制',
  items: [
    { path: '/settings/users', code: '10', label: '用户管理', tag: '用户', description: '账号与启停状态', requiresAdmin: true },
    { path: '/settings/permissions', code: '11', label: '权限管理', tag: '权限', description: '角色与授权范围', requiresAdmin: true }
  ]
}

const navItems = navGroups.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupKey: group.key,
    groupTitle: group.title,
    groupNote: group.note
  }))
)

const systemNavItems = systemGroup.items.map((item) => ({
  ...item,
  groupKey: systemGroup.key,
  groupTitle: systemGroup.title,
  groupNote: systemGroup.note
}))

const adminNavItems = adminGroup.items.map((item) => ({
  ...item,
  groupKey: adminGroup.key,
  groupTitle: adminGroup.title,
  groupNote: adminGroup.note
}))

const allNavItems = [...navItems, ...systemNavItems, ...adminNavItems]

const navGroupsByKey = [...navGroups, systemGroup, adminGroup].reduce((acc, group) => {
  acc[group.key] = group
  return acc
}, {})

const primaryNavItems = navItems
const primaryGroupKeys = navGroups.map((group) => group.key)

function buildIntentPath(location) {
  return `${location.pathname}${location.search || ''}`
}

function getDisplayName(user) {
  if (!user) {
    return '未登录用户'
  }

  return user.full_name || user.username
}

function getUserInitials(user) {
  const source = getDisplayName(user).replace(/\s+/g, '')
  if (!source) {
    return 'U'
  }

  return source.slice(0, 2).toUpperCase()
}

function RequireAuth({ isAuthenticated, children }) {
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: buildIntentPath(location) }} />
  }

  return children
}

function AccessDeniedPage({ user }) {
  const roleLabel = user?.is_admin ? '系统管理员' : '普通用户'

  return (
    <div className="content-wrap">
      <section className="auth-guard-card glass-card">
        <div className="auth-guard-icon">!</div>
        <div className="auth-guard-copy">
          <div className="shell-eyebrow">Admin Only</div>
          <h1 className="auth-guard-title">当前账号没有该管理入口权限</h1>
          <p className="auth-guard-text">
            用户管理和权限管理已经挂到登录会话之后，但当前账号身份为 <strong>{roleLabel}</strong>，
            只能查看普通业务模块。若需要访问该页面，请使用管理员账号登录。
          </p>
          <div className="page-actions">
            <NavLink to="/dashboard" className="button button-primary">
              返回控制台
            </NavLink>
          </div>
        </div>
      </section>
    </div>
  )
}

function RequireAdmin({ user, children }) {
  if (user?.is_admin) {
    return children
  }

  return <AccessDeniedPage user={user} />
}

function AppShell({ authSession, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentNav = allNavItems.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  ) || primaryNavItems[0]
  const currentGroup = navGroupsByKey[currentNav.groupKey] || navGroups[0]
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
  const currentUser = authSession.user
  const roleLabel = currentUser?.is_admin ? '系统管理员' : '平台用户'
  const showAdminLinks = Boolean(currentUser?.is_admin)
  const visibleItemCount = currentGroup.items.length
  const [openPrimaryGroupKey, setOpenPrimaryGroupKey] = useState(() => (
    primaryGroupKeys.includes(currentNav.groupKey) ? currentNav.groupKey : navGroups[0].key
  ))
  const [openToolGroupKey, setOpenToolGroupKey] = useState(() => (
    currentNav.groupKey === adminGroup.key && showAdminLinks ? adminGroup.key : systemGroup.key
  ))

  useEffect(() => {
    if (primaryGroupKeys.includes(currentNav.groupKey)) {
      setOpenPrimaryGroupKey(currentNav.groupKey)
    }
  }, [currentNav.groupKey])

  useEffect(() => {
    if (currentNav.groupKey === systemGroup.key) {
      setOpenToolGroupKey(systemGroup.key)
      return
    }

    if (currentNav.groupKey === adminGroup.key && showAdminLinks) {
      setOpenToolGroupKey(adminGroup.key)
      return
    }

    if (!showAdminLinks && openToolGroupKey === adminGroup.key) {
      setOpenToolGroupKey(systemGroup.key)
    }
  }, [currentNav.groupKey, openToolGroupKey, showAdminLinks])

  const handleLogoutClick = () => {
    onLogout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell shell-frame">
      <aside className="sidebar shell-panel shell-sidebar">
        <div className="brand-block">
          <div className="brand-logo">ML</div>
          <div className="brand-copy">
            <div className="shell-eyebrow">多模态数据湖</div>
            <div className="brand-title">湖仓控制台</div>
            <div className="brand-subtitle">湖总览 · 湖计算 · 湖存储</div>
          </div>
        </div>

        <div className="sidebar-divider" />

        <nav className="nav-list">
          {navGroups.map((group) => (
            <section className="nav-group" key={group.key}>
              <button
                type="button"
                className={`nav-group-trigger${openPrimaryGroupKey === group.key ? ' is-open' : ''}${currentGroup.key === group.key ? ' is-current' : ''}`}
                onClick={() => setOpenPrimaryGroupKey((current) => (current === group.key ? '' : group.key))}
              >
                <span className="nav-group-trigger-copy">
                  <span className="nav-group-title">{group.title}</span>
                </span>
                <span className="nav-group-chevron" aria-hidden="true">⌄</span>
              </button>
              {openPrimaryGroupKey === group.key ? (
                <div className="nav-group-list">
                  {group.items.map((item) => {
                    const isGuarded = Boolean(item.requiresAdmin && !currentUser?.is_admin)

                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}${isGuarded ? ' is-guarded' : ''}`}
                      >
                        <span className="nav-copy">
                          <span className="nav-label">{item.label}</span>
                        </span>
                      </NavLink>
                    )
                  })}
                </div>
              ) : null}
            </section>
          ))}
        </nav>

        <div className="sidebar-tools-card">
          <div className="sidebar-tools-head">
            <div className="sidebar-section-label">平台工具</div>
          </div>

          <div className="sidebar-tool-section">
            <button
              type="button"
              className={`sidebar-tool-trigger${openToolGroupKey === systemGroup.key ? ' is-open' : ''}${currentGroup.key === systemGroup.key ? ' is-current' : ''}`}
              onClick={() => setOpenToolGroupKey((current) => (current === systemGroup.key ? '' : systemGroup.key))}
            >
              <span className="sidebar-tool-trigger-copy">
                <span className="sidebar-tool-section-title">{systemGroup.title}</span>
              </span>
              <span className="nav-group-chevron" aria-hidden="true">⌄</span>
            </button>
            {openToolGroupKey === systemGroup.key ? (
              <div className="sidebar-admin-links">
                {systemGroup.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `sidebar-admin-link${isActive ? ' is-active' : ''}`}
                >
                  <span className="sidebar-admin-link-title">{item.label}</span>
                </NavLink>
              ))}
            </div>
            ) : null}
          </div>

          {showAdminLinks ? (
            <div className="sidebar-tool-section">
              <button
                type="button"
                className={`sidebar-tool-trigger${openToolGroupKey === adminGroup.key ? ' is-open' : ''}${currentGroup.key === adminGroup.key ? ' is-current' : ''}`}
                onClick={() => setOpenToolGroupKey((current) => (current === adminGroup.key ? '' : adminGroup.key))}
              >
                <span className="sidebar-tool-trigger-copy">
                  <span className="sidebar-tool-section-title">{adminGroup.title}</span>
                </span>
                <span className="nav-group-chevron" aria-hidden="true">⌄</span>
              </button>
              {openToolGroupKey === adminGroup.key ? (
                <div className="sidebar-admin-links">
                  {adminGroup.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `sidebar-admin-link${isActive ? ' is-active' : ''}`}
                  >
                    <span className="sidebar-admin-link-title">{item.label}</span>
                  </NavLink>
                ))}
              </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="sidebar-runtime-card">
          <div className="sidebar-section-label">控制室</div>
          <div className="sidebar-runtime-grid">
            <div className="runtime-metric">
              <div className="runtime-metric-label">当前页面</div>
              <div className="runtime-metric-value">{currentNav.label}</div>
              <div className="runtime-metric-note">{currentNav.description}</div>
            </div>
            <div className="runtime-metric">
              <div className="runtime-metric-label">当前分组</div>
              <div className="runtime-metric-value">{currentGroup.title}</div>
              <div className="runtime-metric-note">{currentGroup.note}</div>
            </div>
            <div className="runtime-metric is-wide">
              <div className="runtime-metric-label">当前路径</div>
              <div className="runtime-metric-path">{currentNav.path}</div>
              <div className="runtime-metric-note">控制台路由定位</div>
            </div>
          </div>
        </div>

        <div className="sidebar-account-card">
          <div className="sidebar-section-label">当前登录</div>
          <div className="sidebar-account-top">
            <div className={`sidebar-account-avatar${currentUser?.is_admin ? ' is-admin' : ''}`}>
              {getUserInitials(currentUser)}
            </div>
            <div className="sidebar-account-copy">
              <div className="sidebar-account-name">{getDisplayName(currentUser)}</div>
              <div className="sidebar-account-meta">@{currentUser?.username}</div>
            </div>
          </div>
          <div className="sidebar-pill-row">
            <span className="sidebar-pill">{roleLabel}</span>
            <span className="sidebar-pill">{currentUser?.email ? '已绑定邮箱' : '未绑定邮箱'}</span>
          </div>
          <div className="sidebar-note">
            {currentUser?.email || '当前账号尚未配置邮箱信息，可在用户管理中补充。'}
          </div>
          <button type="button" className="button button-secondary button-small sidebar-account-action" onClick={handleLogoutClick}>
            退出登录
          </button>
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
            主业务导航只保留湖总览、湖计算、湖存储三条主线；来源配置、系统日志与权限入口单独收口，避免打断业务路径。
          </div>
        </div>
      </aside>

      <main className="app-main shell-main">
        <section className="shell-toolbar shell-panel shell-hero">
          <div className="shell-toolbar-main">
            <div className="shell-toolbar-kicker">多模态数据湖统一控制面</div>
            <div className="shell-toolbar-title">湖仓运行控制台</div>
            <div className="shell-toolbar-meta">
              <span className="toolbar-token is-primary">{currentGroup.title}</span>
              <span className="toolbar-token">{currentNav.label}</span>
              <span className="toolbar-token">可见入口 {String(visibleItemCount).padStart(2, '0')}</span>
              <span className="toolbar-token">{currentUser?.is_admin ? '管理员会话' : '用户会话'}</span>
              <span className="toolbar-token">@{currentUser?.username}</span>
            </div>
          </div>
          <div className="shell-toolbar-rail">
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">主导航</div>
              <div className="toolbar-pulse-value">{String(navGroups.length).padStart(2, '0')}</div>
              <div className="toolbar-pulse-note">按湖总览、湖计算、湖存储组织</div>
            </div>
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">当前页面</div>
              <div className="toolbar-pulse-value">{currentNav.label}</div>
              <div className="toolbar-pulse-note">{currentNav.description}</div>
            </div>
            <div className="toolbar-pulse-card">
              <div className="toolbar-pulse-label">巡检日期</div>
              <div className="toolbar-pulse-value">{absoluteDate}</div>
              <div className="toolbar-pulse-note">控制面最近核验日期</div>
            </div>
          </div>
        </section>

        <section className="shell-header shell-overview">
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
              {currentGroup.items.map((item) => {
                const isGuarded = Boolean(item.requiresAdmin && !currentUser?.is_admin)

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `subnav-item${isActive ? ' is-active' : ''}${isGuarded ? ' is-guarded' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          </div>

          <div className="shell-side-panel">
            <div className="shell-brief-card">
              <div className="shell-stat-label">控制台简报</div>
              <div className="shell-brief-title">主导航按总览、计算、存储三条主线组织</div>
              <div className="shell-brief-copy">
                业务入口只保留主任务路径，来源配置、系统日志与账号权限从主菜单剥离到独立入口，减少“同层混放”的导航噪音。
              </div>
              <div className="shell-brief-metrics">
                <div className="shell-brief-metric">
                  <div className="shell-brief-metric-label">当前页面</div>
                  <div className="shell-brief-metric-value">{currentNav.label}</div>
                </div>
                <div className="shell-brief-metric">
                  <div className="shell-brief-metric-label">页面归属</div>
                  <div className="shell-brief-metric-value">{currentGroup.title}</div>
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
                <div className="shell-stat-value">{String(visibleItemCount).padStart(2, '0')}</div>
                <div className="shell-stat-note">当前分组下可切换的功能模块</div>
              </div>
              <div className="shell-stat-card">
                <div className="shell-stat-label">当前身份</div>
                <div className="shell-stat-value">{currentUser?.is_admin ? 'Admin' : 'User'}</div>
                <div className="shell-stat-note">{roleLabel} · @{currentUser?.username}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="page-stage shell-content-stage">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workbench" element={<ErrorBoundary pageName="接入工作台"><IngestionWorkbenchPage /></ErrorBoundary>} />
            <Route path="/workflow" element={<WorkflowCenterPage />} />
            <Route path="/governance" element={<TaskGovernancePage />} />
            <Route path="/settings" element={<Navigate to="/settings/access" replace />} />
            <Route path="/settings/access" element={<ConfigCenterPage />} />
            <Route path="/settings/users" element={<RequireAdmin user={currentUser}><UserManagementPage /></RequireAdmin>} />
            <Route path="/settings/permissions" element={<RequireAdmin user={currentUser}><PermissionManagementPage /></RequireAdmin>} />
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
  const [authSession, setAuthSession] = useState(() => loadAuthSession())

  useEffect(() => subscribeAuthSession(setAuthSession), [])

  const handleLoginSuccess = (payload) => {
    setAuthSession(saveAuthSession(payload))
  }

  const handleLogout = () => {
    setAuthSession(clearAuthSession())
  }

  const isAuthenticated = Boolean(authSession.accessToken && authSession.user)

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} />}
      />
      <Route
        path="*"
        element={
          <RequireAuth isAuthenticated={isAuthenticated}>
            <AppShell authSession={authSession} onLogout={handleLogout} />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
