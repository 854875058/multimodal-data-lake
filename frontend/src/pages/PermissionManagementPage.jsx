const rolePolicies = [
  {
    role: '超级管理员',
    lake_management: '读写',
    lake_compute: '读写',
    system_config: '读写',
    approval: '可审批高风险变更',
    note: '适合平台 owner 和系统管理员'
  },
  {
    role: '运维管理员',
    lake_management: '读取',
    lake_compute: '读写',
    system_config: '部分读写',
    approval: '需二次确认',
    note: '聚焦接入执行、任务治理和排障'
  },
  {
    role: '分析用户',
    lake_management: '读写查询',
    lake_compute: '只读',
    system_config: '只读',
    approval: '不可审批',
    note: '面向数据分析和目录检索'
  },
  {
    role: '只读用户',
    lake_management: '只读',
    lake_compute: '不可见',
    system_config: '不可见',
    approval: '不可审批',
    note: '适合外部演示和受限访客'
  }
]

const scopeRules = [
  {
    title: '资源作用域',
    copy: '后续按湖管理、湖计算、系统配置三大域切分授权范围，避免所有页面共用一套宽权限。'
  },
  {
    title: '危险操作拦截',
    copy: '批量接入、覆盖已有文件、修改平台连接信息等动作应接二次确认和审批记录。'
  },
  {
    title: '用户级配置隔离',
    copy: '配置中心未来按用户保存接入配置、默认模板和最近使用记录，避免多人共用一套表单状态。'
  }
]

export default function PermissionManagementPage() {
  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">权限管理</h1>
          <p className="page-subtitle">先把角色、资源域和危险操作边界梳理清楚，为后面的账号体系和用户隔离提供约束。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary">查看审计日志</button>
          <button type="button" className="button button-primary">新增策略</button>
        </div>
      </div>

      <div className="mini-kpi-grid">
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">角色策略</div>
          <div className="kpi-value">04</div>
          <div className="kpi-sub">对应四类典型账号角色与资源操作边界</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">资源域</div>
          <div className="kpi-value">03</div>
          <div className="kpi-sub">湖管理、湖计算、系统配置三大控制域</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">高风险动作</div>
          <div className="kpi-value">05+</div>
          <div className="kpi-sub">平台连接、覆盖导入、权限变更等动作需要审批链</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">目标状态</div>
          <div className="kpi-value">RBAC</div>
          <div className="kpi-sub">后续接注册 / 登录 / 审批 / 审计的统一权限模型</div>
        </div>
      </div>

      <div className="workbench-grid workbench-grid-wide">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>角色权限矩阵</h2>
              <p>用最小可用的矩阵把三大控制域权限拆开，避免所有用户共享平台最高权限。</p>
            </div>
            <span className="badge">RBAC</span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>角色</th>
                  <th>湖管理</th>
                  <th>湖计算</th>
                  <th>系统配置</th>
                  <th>审批能力</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {rolePolicies.map((item) => (
                  <tr key={item.role}>
                    <td className="table-primary">{item.role}</td>
                    <td>{item.lake_management}</td>
                    <td>{item.lake_compute}</td>
                    <td>{item.system_config}</td>
                    <td>{item.approval}</td>
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
              <h2>规则设计要点</h2>
              <p>这些规则会直接影响后面账号体系、用户配置隔离和操作审计的落地方式。</p>
            </div>
          </div>

          <div className="detail-grid">
            {scopeRules.map((item) => (
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
