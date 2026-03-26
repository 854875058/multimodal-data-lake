import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'

const DEFAULT_ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
}

function resolveRedirectTarget(location) {
  const candidate = location.state?.from
  if (typeof candidate !== 'string') {
    return '/dashboard'
  }

  if (!candidate.startsWith('/') || candidate.startsWith('/login')) {
    return '/dashboard'
  }

  return candidate
}

export default function LoginPage({ onLoginSuccess }) {
  const location = useLocation()
  const navigate = useNavigate()
  const redirectTarget = resolveRedirectTarget(location)
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleInputChange = (field) => (event) => {
    const nextValue = event.target.value
    setForm((current) => ({ ...current, [field]: nextValue }))
    if (error) {
      setError('')
    }
  }

  const fillDefaultAdmin = () => {
    setForm(DEFAULT_ADMIN_CREDENTIALS)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.username.trim() || !form.password) {
      setError('请输入用户名和密码')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const payload = await api.login(form.username.trim(), form.password)
      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess(payload)
      }
      navigate(redirectTarget, { replace: true })
    } catch (e) {
      setError(getErrorMessage(e, '登录失败'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-grid">
        <section className="login-story glass-card">
          <div className="login-story-kicker">Authenticated Entry</div>
          <h1 className="login-story-title">湖仓控制台登录</h1>
          <p className="login-story-copy">
            现在控制台会先校验登录态，再开放数据湖、任务中心和平台管理入口。用户、角色和权限页不再只是配置摆设，而是挂到真实会话入口之后。
          </p>

          <div className="login-kpi-grid">
            <div className="login-kpi-card">
              <div className="login-kpi-label">访问域</div>
              <div className="login-kpi-value">11</div>
              <div className="login-kpi-note">模块接入统一登录门禁</div>
            </div>
            <div className="login-kpi-card">
              <div className="login-kpi-label">权限模型</div>
              <div className="login-kpi-value">RBAC</div>
              <div className="login-kpi-note">普通用户与管理员分层访问</div>
            </div>
            <div className="login-kpi-card">
              <div className="login-kpi-label">会话形态</div>
              <div className="login-kpi-value">Token</div>
              <div className="login-kpi-note">登录态写入本地并注入 API 请求</div>
            </div>
          </div>

          <div className="login-track-list">
            <div className="login-track-item">
              <span className="login-track-index">01</span>
              <div>
                <div className="login-track-title">统一登录入口</div>
                <div className="login-track-note">未登录访问任意页面会被拦截并回跳登录页。</div>
              </div>
            </div>
            <div className="login-track-item">
              <span className="login-track-index">02</span>
              <div>
                <div className="login-track-title">登录后恢复目标路径</div>
                <div className="login-track-note">通过守卫记录原始访问地址，登录成功后回到目标页面。</div>
              </div>
            </div>
            <div className="login-track-item">
              <span className="login-track-index">03</span>
              <div>
                <div className="login-track-title">管理员能力隔离</div>
                <div className="login-track-note">用户管理和权限管理页面仅向管理员开放。</div>
              </div>
            </div>
          </div>
        </section>

        <section className="login-panel shell-panel">
          <div className="login-form-head">
            <div className="shell-eyebrow">Access Checkpoint</div>
            <h2 className="login-form-title">进入平台控制面</h2>
            <p className="login-form-subtitle">
              使用已有平台账号登录，前端会保存当前会话，并在后续请求中自动带上访问令牌。
            </p>
          </div>

          {redirectTarget !== '/dashboard' ? (
            <div className="warning-banner">
              登录成功后将返回 <span className="mono">{redirectTarget}</span>
            </div>
          ) : null}

          {error ? <div className="error-banner">{error}</div> : null}

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-group login-field">
              <span className="field-label">用户名</span>
              <input
                className="field-input"
                autoComplete="username"
                value={form.username}
                onChange={handleInputChange('username')}
                placeholder="请输入平台用户名"
              />
            </label>

            <label className="field-group login-field">
              <span className="field-label">密码</span>
              <input
                className="field-input"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleInputChange('password')}
                placeholder="请输入登录密码"
              />
            </label>

            <button type="submit" className="button button-primary login-submit" disabled={submitting}>
              {submitting ? '登录中...' : '登录并进入控制台'}
            </button>
          </form>

          <div className="login-credential-card">
            <div className="login-credential-head">
              <div className="sidebar-section-label">开发环境默认管理员</div>
              <button type="button" className="button button-secondary button-small" onClick={fillDefaultAdmin}>
                填入默认账号
              </button>
            </div>
            <div className="login-credential-row">
              <span>用户名</span>
              <code className="mono">admin</code>
            </div>
            <div className="login-credential-row">
              <span>密码</span>
              <code className="mono">admin123</code>
            </div>
            <p className="login-support-note">
              当前后端初始化逻辑会自动创建默认管理员。若后续接入真实身份源，应删除该默认账号并切换到正式认证流程。
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
