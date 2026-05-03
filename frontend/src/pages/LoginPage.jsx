import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import boncLogo from '@/assets/bonc.jpg'

function resolveRedirectTarget(location) {
  const candidate = location.state?.from
  if (typeof candidate !== 'string') return '/dashboard'
  if (!candidate.startsWith('/') || candidate.startsWith('/login')) return '/dashboard'
  return candidate
}

const FEATURES = [
  { icon: '🗄️', title: '多模态存储', desc: '图文音视频统一入湖，向量化索引' },
  { icon: '🔍', title: '语义检索', desc: 'SQL + 向量双引擎，精准召回' },
  { icon: '🔒', title: '权限管控', desc: 'RBAC 角色体系，细粒度授权' },
  { icon: '⚡', title: '高性能计算', desc: 'Ray 分布式编排，弹性扩缩' },
]

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
    if (error) setError('')
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
      if (typeof onLoginSuccess === 'function') onLoginSuccess(payload)
      navigate(redirectTarget, { replace: true })
    } catch (e) {
      setError(getErrorMessage(e, '登录失败，请检查用户名和密码'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lp-shell">
      {/* 左侧品牌区 */}
      <div className="lp-left">
        <div className="lp-left-header">
          <img src={boncLogo} alt="东方国信 BONC" className="lp-logo-img" />
          <span className="lp-brand-name">多模态数据湖</span>
        </div>

        <div className="lp-hero">
          <h1 className="lp-hero-title">多模态数据湖仓</h1>
          <p className="lp-hero-sub">AI 数据集管理与多模态检索平台</p>
        </div>

        <div className="lp-features-grid">
          {FEATURES.map((f) => (
            <div className="lp-feature-card" key={f.title}>
              <span className="lp-feature-icon">{f.icon}</span>
              <div className="lp-feature-body">
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="lp-left-footer">
          <span className="lp-pill">Doris MPP</span>
          <span className="lp-pill">SeaweedFS</span>
          <span className="lp-pill">Lance</span>
          <span className="lp-pill">Ray</span>
          <span className="lp-pill">Gravitino</span>
        </div>
      </div>

      {/* 右侧登录区 */}
      <div className="lp-right">
        <div className="lp-card">
          <div className="lp-card-header">
            <h2 className="lp-card-title">欢迎登录</h2>
            <p className="lp-card-sub">多模态数据湖管理平台</p>
          </div>

          {error && <div className="error-banner lp-error">{error}</div>}
          {redirectTarget !== '/dashboard' && (
            <div className="warning-banner lp-error">
              登录后将返回 <span className="mono">{redirectTarget}</span>
            </div>
          )}

          <form className="lp-form" onSubmit={handleSubmit}>
            <div className="lp-field">
              <input
                className="lp-input"
                autoComplete="username"
                value={form.username}
                onChange={handleInputChange('username')}
                placeholder="请输入用户名"
              />
            </div>
            <div className="lp-field">
              <input
                className="lp-input"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleInputChange('password')}
                placeholder="请输入密码"
              />
            </div>
            <button type="submit" className="lp-btn" disabled={submitting}>
              {submitting ? '登录中...' : '登录'}
            </button>
          </form>

          <p className="lp-footer-note">© 2025 东方国信 BONC · 多模态数据湖仓平台</p>
        </div>
      </div>
    </div>
  )
}
