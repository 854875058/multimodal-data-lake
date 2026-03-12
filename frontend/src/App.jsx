import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import FilesPage from './pages/FilesPage.jsx'
import IngestionWorkbenchPage from './pages/IngestionWorkbenchPage.jsx'
import LogsPage from './pages/LogsPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import UploadPage from './pages/UploadPage.jsx'

const navItems = [
  { path: '/dashboard', code: '01', label: '平台总览', tag: 'Overview', description: '平台规模、资源态势与知识图谱总览' },
  { path: '/workbench', code: '02', label: 'AI 工作台', tag: 'Ray', description: 'SeaweedFS / Lance / Ray 工作流与任务编排' },
  { path: '/upload', code: '03', label: '数据接入', tag: 'Ingress', description: '手动上传、多模态入湖与接入起点' },
  { path: '/search', code: '04', label: 'Doris 查询台', tag: 'SQL', description: '外表创建、SQL 编辑器、NL2SQL 与向量查询' },
  { path: '/files', code: '05', label: '资产浏览器', tag: 'Catalog', description: 'Gravitino 三级目录资产浏览与预览治理' },
  { path: '/logs', code: '06', label: '系统日志', tag: 'Logs', description: '服务日志、排障线索与运行状态追踪' }
]

function AppShell() {
  const location = useLocation()
  const currentNav = navItems.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  ) || navItems[0]
  const checkedDate = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).format(new Date())

  return (
    <div className="app-shell">
      <aside className="sidebar shell-panel">
        <div className="brand-block">
          <div className="brand-logo">BONC</div>
          <div className="brand-copy">
            <div className="shell-eyebrow">BONC Multimodal Lake</div>
            <div className="brand-title">BONC Lake Console</div>
            <div className="brand-subtitle">多模态数据湖统一管理平台</div>
          </div>
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-section-label">Navigation</div>

        <nav className="nav-list">
          {navItems.map((item) => (
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
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-section-label">Platform Stack</div>
          <div className="sidebar-pill-row">
            <span className="sidebar-pill">Gravitino</span>
            <span className="sidebar-pill">SeaweedFS</span>
            <span className="sidebar-pill">Lance</span>
            <span className="sidebar-pill">Ray</span>
            <span className="sidebar-pill">Doris</span>
          </div>
          <div className="sidebar-pill-row">
            <span className="sidebar-pill">FastAPI</span>
            <span className="sidebar-pill">React</span>
          </div>
          <div className="sidebar-note">
            参考文档里的主线能力已经映射进当前导航：平台总览、AI 工作台、资产浏览器和 Doris 查询台。
          </div>
        </div>
      </aside>

      <main className="app-main">
        <section className="shell-header">
          <div>
            <div className="shell-eyebrow">BONC Data Lake Control Plane</div>
            <div className="shell-title-row">
              <h1 className="shell-title">{currentNav.label}</h1>
              <span className="shell-badge">{currentNav.tag}</span>
            </div>
            <p className="shell-subtitle">{currentNav.description}</p>
          </div>

          <div className="shell-stat-grid">
            <div className="shell-stat-card">
              <div className="shell-stat-label">当前模块</div>
              <div className="shell-stat-value">{currentNav.code}</div>
              <div className="shell-stat-note">{currentNav.label}</div>
            </div>
            <div className="shell-stat-card">
              <div className="shell-stat-label">访问入口</div>
              <div className="shell-stat-value">8090</div>
              <div className="shell-stat-note">后端静态托管入口</div>
            </div>
            <div className="shell-stat-card">
              <div className="shell-stat-label">参考方向</div>
              <div className="shell-stat-value">{checkedDate}</div>
              <div className="shell-stat-note">Gravitino / SeaweedFS / Lance / Ray / Doris</div>
            </div>
          </div>
        </section>

        <div className="page-stage">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workbench" element={<ErrorBoundary pageName="AI 工作台"><IngestionWorkbenchPage /></ErrorBoundary>} />
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
