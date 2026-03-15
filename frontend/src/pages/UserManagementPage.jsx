import { formatDateTime } from '@/utils/format'

const users = [
  {
    name: 'lake-admin',
    display_name: '平台管理员',
    role: '超级管理员',
    scope: '全局',
    status: '启用',
    last_login: '2026-03-15T09:20:00',
    note: '负责平台配置、用户管理和权限策略维护'
  },
  {
    name: 'ops-owner',
    display_name: '接入负责人',
    role: '运维管理员',
    scope: '湖计算 / 接入',
    status: '启用',
    last_login: '2026-03-15T08:45:00',
    note: '关注工作台、任务治理和组件状态'
  },
  {
    name: 'analyst-demo',
    display_name: '查询分析员',
    role: '分析用户',
    scope: '湖管理 / 查询',
    status: '启用',
    last_login: '2026-03-14T17:10:00',
    note: '访问 Doris 查询台、资产目录和总览分析'
  },
  {
    name: 'guest-review',
    display_name: '外部访客',
    role: '只读用户',
    scope: '湖总览',
    status: '待开通',
    last_login: '',
    note: '后续作为外部演示账号与权限隔离样例'
  }
]

const roleBlueprint = [
  {
    title: '超级管理员',
    copy: '拥有系统配置、用户管理和权限管理全量操作权限，负责租户底座和接入策略。'
  },
  {
    title: '运维管理员',
    copy: '聚焦接入工作台、计算编排、任务治理与日志排障，负责湖计算的日常执行。'
  },
  {
    title: '分析用户',
    copy: '面向查询分析、目录浏览和指标看板，默认不开放系统配置和高风险操作。'
  }
]

function getStatusBadgeClass(status) {
  if (status === '启用') {
    return 'is-success'
  }
  if (status === '待开通') {
    return 'is-warning'
  }
  return 'is-muted'
}

export default function UserManagementPage() {
  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">先搭出账号、角色和用户隔离的控制面。当前先展示管理框架，后续再接注册 / 登录 / 按用户保存配置。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary">导出名单</button>
          <button type="button" className="button button-primary">新建用户</button>
        </div>
      </div>

      <div className="mini-kpi-grid">
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">用户总数</div>
          <div className="kpi-value">04</div>
          <div className="kpi-sub">当前控制台内置的示例账号与角色入口</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">管理员</div>
          <div className="kpi-value">02</div>
          <div className="kpi-sub">覆盖系统配置与湖计算运维</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">只读 / 待开通</div>
          <div className="kpi-value">02</div>
          <div className="kpi-sub">为后续审批流和演示权限留出口</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">下一步</div>
          <div className="kpi-value">IAM</div>
          <div className="kpi-sub">接账号体系、角色继承和用户级配置隔离</div>
        </div>
      </div>

      <div className="workbench-grid workbench-grid-wide">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>账号列表</h2>
              <p>展示后续要接入注册、登录、角色绑定和状态管理的目标结构。</p>
            </div>
            <span className="badge">Preview</span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>角色</th>
                  <th>作用域</th>
                  <th>状态</th>
                  <th>最后登录</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.name}>
                    <td>
                      <div className="table-primary">{item.display_name}</div>
                      <div className="table-secondary mono">{item.name}</div>
                    </td>
                    <td>{item.role}</td>
                    <td>{item.scope}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(item.status)}`}>{item.status}</span>
                    </td>
                    <td>{item.last_login ? formatDateTime(item.last_login) : '--'}</td>
                    <td className="table-secondary">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>角色基线</h2>
              <p>先把平台内角色颗粒度固定下来，后续直接接后端账号体系和权限模型。</p>
            </div>
          </div>

          <div className="detail-grid">
            {roleBlueprint.map((item) => (
              <div className="detail-item" key={item.title}>
                <div className="kpi-label">{item.title}</div>
                <div className="detail-value">{item.copy}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
