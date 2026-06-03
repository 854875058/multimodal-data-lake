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
  IconBug,
  IconCalendarClock,
  IconCaretDown,
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
  IconSearch,
  IconSettings,
  IconStorage,
  IconUpload,
  IconUser,
  IconUserGroup,
} from '@arco-design/web-react/icon'
import { clearAuthSession, loadAuthSession, saveAuthSession, subscribeAuthSession } from '@/auth/session'
import boncLogo from '@/assets/bonc.jpg'
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
    key: 'lake-query',
    title: '湖查询',
    icon: <IconSearch />,
    items: [
      { path: '/lake-query/sql', label: 'SQL 查询', icon: <IconCommand /> },
      { path: '/lake-query/retrieval', label: '统一检索', icon: <IconSearch /> },
      { path: '/lake-query/vector', label: '向量检索', icon: <IconSearch />, hidden: true },
      { path: '/lake-query/multimodal', label: '多模态检索', icon: <IconLayout />, hidden: true },
      { path: '/lake-query/hybrid', label: '混合检索', icon: <IconCommon />, hidden: true },
      { path: '/lake-query/copilot', label: 'AI 数据副驾驶', icon: <IconRobot /> },
      { path: '/lake-query/annotation', label: '自动化标注', icon: <IconExport /> },
    ],
  },
  {
    key: 'lake-compute',
    title: '湖计算',
    icon: <IconCommand />,
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
    icon: <IconCalendarClock />,
    items: [
      { path: '/governance', label: '数据治理', icon: <IconCalendarClock /> },
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

const allNavItems = navGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, groupKey: group.key, groupTitle: group.title }))
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
  const currentNav = allNavItems
    .filter((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0] || allNavItems[0]

  const currentUser = authSession.user
  const showAdminLinks = Boolean(currentUser?.is_admin)
  const visibleGroups = navGroups
    .filter((group) => !group.requiresAdmin || showAdminLinks)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.hidden && (!item.requiresAdmin || showAdminLinks)),
    }))
    .filter((group) => group.items.length > 0)
  const [collapsed, setCollapsed] = useState(false)

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
