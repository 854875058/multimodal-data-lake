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

// 懒加载：只在用户访问对应路由时才加载
const ComputeJobsOverviewPage = lazy(() => import('./pages/ComputeJobsOverviewPage.jsx'))
const ConfigCenterPage = lazy(() => import('./pages/ConfigCenterPage.jsx'))
const DataGovernancePage = lazy(() => import('./pages/DataGovernancePage.jsx'))
const FilesPage = lazy(() => import('./pages/FilesPage.jsx'))
const IngestionCenterPage = lazy(() => import('./pages/IngestionCenterPage.jsx'))
const LakeQueryPage = lazy(() => import('./pages/LakeQueryPage.jsx'))
const LogsPage = lazy(() => import('./pages/LogsPage.jsx'))
const OperatorCenterPage = lazy(() => import('./pages/OperatorCenterPage.jsx'))
const PermissionManagementPage = lazy(() => import('./pages/PermissionManagementPage.jsx'))
const RayJobsPage = lazy(() => import('./pages/RayJobsPage.jsx'))
const TaskCenterPage = lazy(() => import('./pages/TaskCenterPage.jsx'))
const TemplateLibraryPage = lazy(() => import('./pages/TemplateLibraryPage.jsx'))
const UserManagementPage = lazy(() => import('./pages/UserManagementPage.jsx'))
const WorkflowCenterPage = lazy(() => import('./pages/WorkflowCenterPage.jsx'))
const AlertPage = lazy(() => import('./pages/mpp/AlertPage.jsx'))
const ClusterPage = lazy(() => import('./pages/mpp/ClusterPage.jsx'))
const InspectionPage = lazy(() => import('./pages/mpp/InspectionPage.jsx'))
const SqlEditorPage = lazy(() => import('./pages/mpp/SqlEditorPage.jsx'))

function PageLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
      <Spin size={32} tip="加载中..." />
    </div>
  )
}

const { Sider, Header, Content } = Layout
const { SubMenu, Item: MenuItem } = Menu
const { Title, Text } = Typography

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
  const roleLabel = user?.is_admin ? '系统管理员' : '平台用户'
  return (
    <div style={{ padding: 64, textAlign: 'center' }}>
      <Title heading={4}>当前账号无权访问管理入口</Title>
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
  const currentNav = findCurrentNav(location.pathname)

  const currentUser = authSession.user
  const showAdminLinks = Boolean(currentUser?.is_admin)
  const visibleGroups = getVisibleNavGroups({ isAdmin: showAdminLinks })
  const [collapsed, setCollapsed] = useState(false)
  const [paletteVisible, setPaletteVisible] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleLogoutClick = () => {
    onLogout()
    navigate('/login', { replace: true })
  }

  const userMenu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'logout') handleLogoutClick()
      }}
    >
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
        width={260}
        collapsedWidth={60}
        trigger={null}
        style={{
          background: 'var(--color-bg-2)',
          borderRight: 'none',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: 76,
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 16,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0 14px' : '0 18px',
            borderBottom: '1px solid var(--color-border-2)',
          }}
        >
          <img
            src={boncLogo}
            alt="BONC"
            style={{
              width: collapsed ? 38 : 'auto',
              height: collapsed ? 38 : 58,
              maxWidth: collapsed ? 38 : 96,
              objectFit: 'contain',
              borderRadius: 6,
              flexShrink: 0,
            }}
          />
          {!collapsed ? (
            <div
              style={{
                overflow: 'hidden',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: '22px', color: 'var(--color-text-1)' }}>
                湖仓控制台
              </div>
              <div style={{ marginTop: 3, fontSize: 12, lineHeight: '18px', color: 'var(--color-text-3)' }}>
                多模态数据湖
              </div>
            </div>
          ) : null}
        </div>

        <Menu
          mode="vertical"
          selectedKeys={[currentNav.path]}
          defaultOpenKeys={visibleGroups.map((group) => group.key)}
          style={{ width: '100%', borderRight: 'none', height: 'calc(100% - 76px)', overflowY: 'auto' }}
          onClickMenuItem={(key) => navigate(key)}
        >
          {visibleGroups.map((group) => (
            <SubMenu
              key={group.key}
              title={
                <span>
                  <span style={{ marginRight: 8 }}>{group.icon}</span>
                  {group.title}
                </span>
              }
            >
              {group.items.map((item) => (
                <MenuItem key={item.path}>
                  <span style={{ marginRight: 8 }}>{item.icon}</span>
                  {item.label}
                </MenuItem>
              ))}
            </SubMenu>
          ))}
        </Menu>
      </Sider>

      <Layout>
        <Header
          style={{
            height: 56,
            background: 'var(--color-bg-2)',
            borderBottom: '1px solid var(--color-border-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
          }}
        >
          <Breadcrumb>
            <Breadcrumb.Item>{currentNav.groupTitle}</Breadcrumb.Item>
            <Breadcrumb.Item>{currentNav.label}</Breadcrumb.Item>
          </Breadcrumb>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Button
              type="text"
              icon={<IconSearch />}
              onClick={() => setPaletteVisible(true)}
              style={{ color: 'var(--color-text-2)', fontSize: 16 }}
            >
              <span style={{ fontSize: 12, marginLeft: 4, color: 'var(--color-text-3)' }}>Ctrl K</span>
            </Button>
            <NotificationCenter onNavigate={(path) => navigate(path)} />
            <div style={{ width: 1, height: 20, background: 'var(--color-border-2)', margin: '0 6px' }} />
            <Dropdown droplist={userMenu} trigger="click" position="br">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                }}
              >
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
          </div>
        </Header>

        <Content style={{ overflow: 'auto', background: 'var(--color-fill-1)' }}>
          <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/ingestion" element={<IngestionCenterPage />} />
            <Route path="/ingestion/workflow" element={<Navigate to="/workflow" replace />} />
            <Route path="/ingestion/tasks" element={<Navigate to="/task-center" replace />} />
            <Route path="/ingestion/:tab" element={<IngestionCenterPage />} />
            <Route path="/workbench" element={<Navigate to="/ingestion/source" replace />} />
            <Route path="/workflow" element={<WorkflowCenterPage />} />
            <Route path="/task-center" element={<TaskCenterPage />} />
            <Route path="/compute/operators" element={<OperatorCenterPage />} />
            <Route path="/compute/jobs" element={<ComputeJobsOverviewPage />} />
            <Route path="/compute/templates" element={<TemplateLibraryPage />} />
            <Route path="/governance" element={<DataGovernancePage />} />
            <Route path="/settings" element={<Navigate to="/settings/access" replace />} />
            <Route path="/settings/access" element={<ConfigCenterPage />} />
            <Route
              path="/settings/users"
              element={(
                <RequireAdmin user={currentUser}>
                  <UserManagementPage />
                </RequireAdmin>
              )}
            />
            <Route
              path="/settings/permissions"
              element={(
                <RequireAdmin user={currentUser}>
                  <PermissionManagementPage />
                </RequireAdmin>
              )}
            />
            <Route path="/upload" element={<Navigate to="/ingestion/upload" replace />} />
            <Route path="/lake-query" element={<Navigate to="/lake-query/sql" replace />} />
            <Route path="/lake-query/:tab" element={<LakeQueryPage />} />
            <Route path="/search" element={<Navigate to="/lake-query/retrieval" replace />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/mpp/cluster" element={<ClusterPage />} />
            <Route path="/mpp/sql" element={<SqlEditorPage />} />
            <Route path="/mpp/alert" element={<AlertPage />} />
            <Route path="/mpp/inspection" element={<InspectionPage />} />
            <Route path="/ray/jobs" element={<RayJobsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </Content>
      </Layout>

      <CommandPalette
        visible={paletteVisible}
        onClose={() => setPaletteVisible(false)}
        onNavigate={(path) => navigate(path)}
      />
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
        element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} />
        }
      />
      <Route
        path="*"
        element={(
          <RequireAuth isAuthenticated={isAuthenticated}>
            <AppShell authSession={authSession} onLogout={handleLogout} />
          </RequireAuth>
        )}
      />
    </Routes>
  )
}
