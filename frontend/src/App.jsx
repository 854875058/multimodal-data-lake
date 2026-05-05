import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { clearAuthSession, loadAuthSession, saveAuthSession, subscribeAuthSession } from '@/auth/session'
import boncLogo from '@/assets/bonc.jpg'
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
import ClusterPage from './pages/mpp/ClusterPage.jsx'
import SqlEditorPage from './pages/mpp/SqlEditorPage.jsx'
import AlertPage from './pages/mpp/AlertPage.jsx'
import InspectionPage from './pages/mpp/InspectionPage.jsx'
import RayJobsPage from './pages/RayJobsPage.jsx'

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
      { path: '/governance', code: '05', label: '任务治理', tag: '治理', description: '作业状态与执行回填' },
      { path: '/ray/jobs', code: '16', label: 'Ray 作业监控', tag: 'Ray', description: 'Ray 分布式计算作业管理' }
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
  },
  {
    key: 'mpp-database',
    title: 'Doris 集群',
    note: 'Doris 集群管理与运维',
    items: [
      { path: '/mpp/cluster', code: '12', label: '集群管理', tag: '集群', description: 'Doris 集群运维与监控' },
      { path: '/mpp/sql', code: '13', label: 'SQL 编辑器', tag: 'SQL', description: '多标签 SQL 查询工具' },
      { path: '/mpp/alert', code: '14', label: '告警监控', tag: '告警', description: '告警规则与记录管理' },
      { path: '/mpp/inspection', code: '15', label: '自动巡检', tag: '巡检', description: '集群健康定时巡检' }
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
  const currentUser = authSession.user
  const roleLabel = currentUser?.is_admin ? '系统管理员' : '平台用户'
  const showAdminLinks = Boolean(currentUser?.is_admin)
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
          <img src={boncLogo} alt="东方国信 BONC" className="brand-logo-img" />
          <div className="brand-copy">
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
          </div>
          <button type="button" className="button button-secondary button-small sidebar-account-action" onClick={handleLogoutClick}>
            退出登录
          </button>
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-pill-row">
            <span className="sidebar-pill">Gravitino</span>
            <span className="sidebar-pill">SeaweedFS</span>
            <span className="sidebar-pill">Lance</span>
            <span className="sidebar-pill">Ray</span>
            <span className="sidebar-pill">FastAPI</span>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-topbar">
          <div className="topbar-breadcrumb">
            <span className="topbar-breadcrumb-group">{currentGroup.title}</span>
            <span className="topbar-breadcrumb-sep"> / </span>
            <span className="topbar-breadcrumb-page">{currentNav.label}</span>
          </div>
          <div className="topbar-user">
            <span className="topbar-user-name">@{currentUser?.username}</span>
            <span className="topbar-user-role">{roleLabel}</span>
          </div>
        </div>

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
            <Route path="/mpp/cluster" element={<ClusterPage />} />
            <Route path="/mpp/sql" element={<SqlEditorPage />} />
            <Route path="/mpp/alert" element={<AlertPage />} />
            <Route path="/mpp/inspection" element={<InspectionPage />} />
            <Route path="/ray/jobs" element={<RayJobsPage />} />
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
