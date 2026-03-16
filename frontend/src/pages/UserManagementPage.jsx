import { useEffect, useState } from 'react'
import api, { getErrorMessage } from '@/api'
import { formatDateTime } from '@/utils/format'

function getStatusBadgeClass(isActive) {
  return isActive ? 'is-success' : 'is-warning'
}

export default function UserManagementPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', password: '', full_name: '' })
  const [submitting, setSubmitting] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(getErrorMessage(e, '加载用户列表失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleCreate = async () => {
    if (!form.username || !form.email || !form.password) return
    setSubmitting(true)
    try {
      await api.createUser(form)
      setForm({ username: '', email: '', password: '', full_name: '' })
      setShowForm(false)
      loadUsers()
    } catch (e) {
      setError(getErrorMessage(e, '创建用户失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (userId) => {
    if (!confirm('确认删除该用户？')) return
    try {
      await api.deleteUser(userId)
      loadUsers()
    } catch (e) {
      setError(getErrorMessage(e, '删除用户失败'))
    }
  }

  const handleToggleActive = async (user) => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active })
      loadUsers()
    } catch (e) {
      setError(getErrorMessage(e, '更新用户状态失败'))
    }
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-subtitle">管理平台账号、角色绑定和用户状态。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={loadUsers} disabled={loading}>
            {loading ? '加载中...' : '刷新'}
          </button>
          <button type="button" className="button button-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? '取消' : '新建用户'}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="mini-kpi-grid">
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">用户总数</div>
          <div className="kpi-value">{String(users.length).padStart(2, '0')}</div>
          <div className="kpi-sub">当前平台注册用户数</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">已启用</div>
          <div className="kpi-value">{String(users.filter(u => u.is_active).length).padStart(2, '0')}</div>
          <div className="kpi-sub">活跃账号数</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">管理员</div>
          <div className="kpi-value">{String(users.filter(u => u.is_admin).length).padStart(2, '0')}</div>
          <div className="kpi-sub">拥有管理权限的账号</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">权限模型</div>
          <div className="kpi-value">RBAC</div>
          <div className="kpi-sub">基于角色的访问控制</div>
        </div>
      </div>

      {showForm ? (
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>新建用户</h2>
              <p>填写用户信息创建新账号。</p>
            </div>
          </div>
          <div className="workbench-form-grid">
            <label className="field-group">
              <span className="field-label">用户名</span>
              <input className="field-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="请输入用户名" />
            </label>
            <label className="field-group">
              <span className="field-label">邮箱</span>
              <input className="field-input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="请输入邮箱" />
            </label>
            <label className="field-group">
              <span className="field-label">密码</span>
              <input className="field-input" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="请输入密码" />
            </label>
            <label className="field-group">
              <span className="field-label">姓名</span>
              <input className="field-input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder="请输入姓名（可选）" />
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
            <h2>账号列表</h2>
            <p>管理平台用户账号、状态和权限。</p>
          </div>
          <span className="badge">Live</span>
        </div>

        {loading ? (
          <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>加载中...</div>
        ) : users.length === 0 ? (
          <div style={{textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>暂无用户数据</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>用户名</th>
                  <th>邮箱</th>
                  <th>姓名</th>
                  <th>状态</th>
                  <th>角色</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="mono">{user.id}</td>
                    <td className="table-primary">{user.username}</td>
                    <td className="mono">{user.email}</td>
                    <td>{user.full_name || '--'}</td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(user.is_active)}`}>
                        {user.is_active ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${user.is_admin ? 'is-accent' : 'is-muted'}`}>
                        {user.is_admin ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td>{user.created_at ? formatDateTime(user.created_at) : '--'}</td>
                    <td>
                      <div className="toolbar-group">
                        <button type="button" className="button button-small button-secondary" onClick={() => handleToggleActive(user)}>
                          {user.is_active ? '禁用' : '启用'}
                        </button>
                        <button type="button" className="button button-small button-ghost" onClick={() => handleDelete(user.id)}>
                          删除
                        </button>
                      </div>
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
