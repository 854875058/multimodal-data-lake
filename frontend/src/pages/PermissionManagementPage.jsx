import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '@/api'

export default function PermissionManagementPage() {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', permissions: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadRoles = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getRoles()
      setRoles(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(getErrorMessage(e, '加载角色列表失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRoles() }, [])

  const handleCreate = async () => {
    if (!form.name) return
    setSubmitting(true)
    try {
      const perms = form.permissions
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      await api.createRole({ name: form.name, description: form.description, permissions: perms })
      setForm({ name: '', description: '', permissions: '' })
      setShowForm(false)
      loadRoles()
    } catch (e) {
      setError(getErrorMessage(e, '创建角色失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (roleId) => {
    if (!confirm('确认删除该角色？')) return
    try {
      await api.deleteRole(roleId)
      loadRoles()
    } catch (e) {
      setError(getErrorMessage(e, '删除角色失败'))
    }
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">权限管理</h1>
          <p className="page-subtitle">管理角色、权限策略和用户角色分配。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={loadRoles} disabled={loading}>
            {loading ? '加载中...' : '刷新'}
          </button>
          <button type="button" className="button button-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? '取消' : '新增角色'}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="mini-kpi-grid">
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">角色总数</div>
          <div className="kpi-value">{String(roles.length).padStart(2, '0')}</div>
          <div className="kpi-sub">当前系统定义的角色数量</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">资源域</div>
          <div className="kpi-value">03</div>
          <div className="kpi-sub">湖管理、湖计算、系统配置</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">权限模型</div>
          <div className="kpi-value">RBAC</div>
          <div className="kpi-sub">基于角色的访问控制</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">目标状态</div>
          <div className="kpi-value">IAM</div>
          <div className="kpi-sub">统一身份与访问管理</div>
        </div>
      </div>

      {showForm ? (
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>新增角色</h2>
              <p>定义角色名称、描述和权限列表。</p>
            </div>
          </div>
          <div className="workbench-form-grid">
            <label className="field-group">
              <span className="field-label">角色名称</span>
              <input className="field-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="如: data_analyst" />
            </label>
            <label className="field-group">
              <span className="field-label">描述</span>
              <input className="field-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="角色描述" />
            </label>
            <label className="field-group">
              <span className="field-label">权限列表</span>
              <input className="field-input" value={form.permissions} onChange={e => setForm({...form, permissions: e.target.value})} placeholder="逗号分隔，如: read, write, upload" />
            </label>
          </div>
          <div className="page-actions" style={{marginTop: '16px'}}>
            <button type="button" className="button button-primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? '创建中...' : '确认创建'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>角色列表</h2>
            <p>系统中所有角色及其权限配置。</p>
          </div>
          <span className="badge">Live</span>
        </div>

        {loading ? (
          <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>加载中...</div>
        ) : roles.length === 0 ? (
          <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>暂无角色数据</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>角色名称</th>
                  <th>描述</th>
                  <th>权限</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td className="mono">{role.id}</td>
                    <td className="table-primary">{role.name}</td>
                    <td>{role.description || '--'}</td>
                    <td>
                      <div className="toolbar-group" style={{flexWrap: 'wrap', gap: '4px'}}>
                        {(role.permissions || []).map((perm, i) => (
                          <span key={i} className="badge is-muted">{perm}</span>
                        ))}
                      </div>
                    </td>
                    <td>{role.created_at || '--'}</td>
                    <td>
                      <button type="button" className="button button-small button-ghost" onClick={() => handleDelete(role.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
