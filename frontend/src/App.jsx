import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Layout, Menu, Avatar, Dropdown, Button, Typography, Tag, Space, Breadcrumb
} from '@arco-design/web-react'
import {
  IconDashboard, IconStorage, IconSearch, IconCommand, IconCalendarClock,
  IconCloudDownload, IconUpload, IconCommon, IconRobot, IconNotification,
  IconBug, IconSettings, IconUser, IconUserGroup, IconLock, IconFile,
  IconExport, IconCaretDown, IconLayout, IconLanguage
} from '@arco-design/web-react/icon'
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
import TaskCenterPage from './pages/TaskCenterPage.jsx'
import LakeQueryPage from './pages/LakeQueryPage.jsx'

const { Sider, Header, Content } = Layout
const { SubMenu, Item: MenuItem } = Menu
const { Title, Text } = Typography

const navGroups = [
  {
    key: 'lake-overview',
    title: '湖总览',
    icon: <IconDashboard />,
    items: [
      { path: '/dashboard', label: '湖总览', icon: <IconDashboard /> },
      { path: '/files', label: '资产目录', icon: <IconFile /> },
    ],
  },
  {
    key: 'lake-compute',
    title: '湖计算',
    icon: <IconCommand />,
    items: [
      { path: '/lake-query', label: '湖查询', icon: <IconSearch /> },
      { path: '/workflow', label: '工作流编排', icon: <IconLayout /> },
      { path: '/task-center', label: '任务中心', icon: <IconCalendarClock /> },
    ],
  },
  {
    key: 'lake-storage',
    title: '湖存储',
    icon: <IconStorage />,
    items: [
      { path: '/workbench', label: '接入工作台', icon: <IconCloudDownload /> },
      { path: '/upload', label: '本地上传', icon: <IconUpload /> },
    ],
  },
  {
    key: 'mpp-database',
    title: '湖运维',
    icon: <IconCommon />,
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

const allNavItems = navGroups.flatMap(g =>
  g.items.map(item => ({ ...item, groupKey: g.key, groupTitle: g.title }))
)

function buildIntentPath(location) {
  return `${location.pathname}${location.search || ''}`
}

function getDisplayName(user) {
  if (!user) return '未登录用户'
  return user.full_name || user.username
}

function getUserInitials(user) {
  const source = getDisplayName(user).replace(/\s+/g, '')
  if (!source) return 'U'
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
    <div style={{ padding: 64, textAlign: 'center' }}>
      <Title heading={4}>当前账号无该管理入口权限</Title>
      <Text type="secondary">
        当前身份：<Tag color="orange">{roleLabel}</Tag>，请使用管理员账号登录。
      </Text>
      <div style={{ marginTop: 16 }}>
        <NavLink to="/dashboard">
          <Button type="primary">返回控制台</Button>
        </NavLink>
      </div>
    </div>
  )
}

function RequireAdmin({ user, children }) {
  if (user?.is_admin) return children
  return <AccessDeniedPage user={user} />
}

function AppShell({ authSession, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentNav = allNavItems.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  ) || allNavItems[0]

  const currentUser = authSession.user
  const showAdminLinks = Boolean(currentUser?.is_admin)
  const visibleGroups = navGroups.filter(g => !g.requiresAdmin || showAdminLinks)
  const [collapsed, setCollapsed] = useState(false)

  const handleLogoutClick = () => {
    onLogout()
    navigate('/login', { replace: true })
  }

  const userMenu = (
    <Menu onClickMenuItem={(key) => {
      if (key === 'logout') handleLogoutClick()
    }}>
      <Menu.Item key="profile" disabled>
        <Space>
          <IconUser />
          <span>{getDisplayName(currentUser)}</span>
        </Space>
      </Menu.Item>
      <Menu.Item key="role" disabled>
        <Space>
          <IconLock />
          <Text type="secondary">{currentUser?.is_admin ? '系统管理员' : '平台用户'}</Text>
        </Space>
      </Menu.Item>
      <Menu.Item key="logout">
        <Space>
          <IconExport />
          <span>退出登录</span>
        </Space>
      </Menu.Item>
    </Menu>
  )

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        collapsed={collapsed}
        onCollapse={setCollapsed}
        collapsible
        width={232}
        style={{
          background: 'var(--color-bg-2)',
          borderRight: '1px solid var(--color-border-2)',
        }}
      >
        <div style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: collapsed ? '0 16px' : '0 20px',
          borderBottom: '1px solid var(--color-border-2)',
        }}>
          <img src={boncLogo} alt="BONC" style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
          {!collapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>湖仓控制台</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>多模态数据湖</div>
            </div>
          )}
        </div>

        <Menu
          mode="vertical"
          selectedKeys={[currentNav.path]}
          defaultOpenKeys={navGroups.map(g => g.key)}
          style={{ width: '100%', borderRight: 'none', height: 'calc(100% - 60px)', overflowY: 'auto' }}
          onClickMenuItem={(key) => navigate(key)}
        >
          {visibleGroups.map(group => (
            <SubMenu
              key={group.key}
              title={
                <span><span style={{ marginRight: 8 }}>{group.icon}</span>{group.title}</span>
              }
            >
              {group.items.map(item => (
                <MenuItem key={item.path}>
                  <span style={{ marginRight: 8 }}>{item.icon}</span>{item.label}
                </MenuItem>
              ))}
            </SubMenu>
          ))}
        </Menu>
      </Sider>

      <Layout>
        <Header style={{
          height: 56,
          background: 'var(--color-bg-2)',
          borderBottom: '1px solid var(--color-border-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}>
          <Breadcrumb>
            <Breadcrumb.Item>{currentNav.groupTitle}</Breadcrumb.Item>
            <Breadcrumb.Item>{currentNav.label}</Breadcrumb.Item>
          </Breadcrumb>
          <Dropdown droplist={userMenu} trigger="click" position="br">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 8px', borderRadius: 6 }}>
              <Avatar size={28} style={{ backgroundColor: currentUser?.is_admin ? '#165dff' : '#7bc616' }}>
                {getUserInitials(currentUser)}
              </Avatar>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{getDisplayName(currentUser)}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                  {currentUser?.is_admin ? '系统管理员' : '平台用户'}
                </div>
              </div>
              <IconCaretDown style={{ color: 'var(--color-text-3)' }} />
            </div>
          </Dropdown>
        </Header>

        <Content style={{ overflow: 'auto', background: 'var(--color-fill-1)' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workbench" element={<ErrorBoundary pageName="接入工作台"><IngestionWorkbenchPage /></ErrorBoundary>} />
            <Route path="/workflow" element={<WorkflowCenterPage />} />
            <Route path="/task-center" element={<TaskCenterPage />} />
            <Route path="/governance" element={<TaskGovernancePage />} />
            <Route path="/settings" element={<Navigate to="/settings/access" replace />} />
            <Route path="/settings/access" element={<ConfigCenterPage />} />
            <Route path="/settings/users" element={<RequireAdmin user={currentUser}><UserManagementPage /></RequireAdmin>} />
            <Route path="/settings/permissions" element={<RequireAdmin user={currentUser}><PermissionManagementPage /></RequireAdmin>} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/lake-query" element={<LakeQueryPage />} />
            <Route path="/search" element={<Navigate to="/lake-query" replace />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/mpp/cluster" element={<ClusterPage />} />
            <Route path="/mpp/sql" element={<SqlEditorPage />} />
            <Route path="/mpp/alert" element={<AlertPage />} />
            <Route path="/mpp/inspection" element={<InspectionPage />} />
            <Route path="/ray/jobs" element={<RayJobsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default function App() {
  const [authSession, setAuthSession] = useState(() => loadAuthSession())
  useEffect(() => subscribeAuthSession(setAuthSession), [])

  const handleLoginSuccess = (payload) => setAuthSession(saveAuthSession(payload))
  const handleLogout = () => setAuthSession(clearAuthSession())
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
