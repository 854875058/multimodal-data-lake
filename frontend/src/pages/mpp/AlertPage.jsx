import { useEffect, useState } from 'react'

const DORIS_BASE = '/api/doris'

async function dorisGet(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPost(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisDelete(path) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function SeverityBadge({ level }) {
  const map = {
    CRITICAL: { label: '严重', cls: 'badge-error' },
    WARNING: { label: '警告', cls: 'badge-warn' },
    INFO: { label: '信息', cls: 'badge-neutral' },
  }
  const { label, cls } = map[level] || { label: level || '—', cls: 'badge-neutral' }
  return <span className={`status-badge ${cls}`}>{label}</span>
}

// 告警记录面板
function AlertHistoryPanel({ clusterId }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const data = await dorisGet('/alerts/records', { cluster_id: clusterId, limit: 50 })
      setRecords(data.records || [])
    } catch (e) {
      console.warn('告警记录加载失败:', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clusterId])

  return (
    <div className="mpp-alert-panel glass-card">
      <div className="mpp-panel-header">
        <h3 className="mpp-section-title">告警记录</h3>
        <button className="button button-secondary button-small" onClick={load} disabled={loading}>刷新</button>
      </div>
      {loading ? <div className="mpp-loading">加载中...</div> : (
        records.length === 0 ? <p className="mpp-empty">暂无告警记录</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>告警时间</th>
                <th>告警名称</th>
                <th>指标</th>
                <th>当前值</th>
                <th>级别</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  <td>{r.created_at || '—'}</td>
                  <td>{r.name || '—'}</td>
                  <td className="mono">{r.metric || '—'}</td>
                  <td className="mono">{r.value !== undefined ? String(r.value) : '—'}</td>
                  <td><SeverityBadge level={r.level} /></td>
                  <td className="mpp-alert-msg">{r.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

// 告警规则面板
function AlertRulesPanel({ clusterId, onRefresh }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [opMsg, setOpMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await dorisGet('/alerts', clusterId ? { cluster_id: clusterId } : {})
      setRules(data.alerts || [])
    } catch (e) {
      console.warn('告警规则加载失败:', e.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteRule = async (rule) => {
    if (!window.confirm(`确认删除告警规则「${rule.name}」？`)) return
    setOpMsg('')
    try {
      await dorisDelete(`/alerts/${rule.id}`)
      setOpMsg('规则已删除')
      load()
    } catch (e) {
      setOpMsg('删除失败：' + e.message)
    }
  }

  useEffect(() => { load() }, [clusterId, onRefresh])

  return (
    <div className="mpp-alert-panel glass-card">
      <div className="mpp-panel-header">
        <h3 className="mpp-section-title">告警规则管理</h3>
        <button className="button button-secondary button-small" onClick={load} disabled={loading}>刷新</button>
      </div>
      {opMsg && <div className="info-banner">{opMsg}</div>}
      {loading ? <div className="mpp-loading">加载中...</div> : (
        rules.length === 0 ? <p className="mpp-empty">暂无告警规则，请新建规则</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>规则名称</th>
                <th>指标</th>
                <th>条件</th>
                <th>阈值</th>
                <th>级别</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={i}>
                  <td>{rule.name || '—'}</td>
                  <td className="mono">{rule.metric || '—'}</td>
                  <td className="mono">{rule.operator || '>'}</td>
                  <td className="mono">{rule.threshold}</td>
                  <td><SeverityBadge level={rule.level} /></td>
                  <td>
                    {rule.enabled
                      ? <span className="status-badge badge-success">已启用</span>
                      : <span className="status-badge badge-neutral">已禁用</span>}
                  </td>
                  <td>
                    <button className="button button-small button-danger" onClick={() => deleteRule(rule)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

// 新建告警规则表单
function CreateRulePanel({ clusterId, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    metric: 'be_disk_usage',
    operator: '>',
    threshold: 80,
    level: 'WARNING',
  })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')

  const metricOptions = [
    { value: 'be_disk_usage', label: 'BE 磁盘使用率 (%)' },
    { value: 'fe_alive_count', label: 'FE 存活节点数' },
    { value: 'be_alive_count', label: 'BE 存活节点数' },
    { value: 'query_latency_ms', label: '查询延迟 (ms)' },
    { value: 'connection_count', label: '当前连接数' },
  ]

  const handleSubmit = async () => {
    if (!clusterId) { setMsg('请先选择集群'); return }
    if (!form.name) { setMsg('请填写规则名称'); return }
    setSubmitting(true)
    setMsg('')
    try {
      await dorisPost('/alerts', {
        cluster_id: clusterId,
        name: form.name,
        metric: form.metric,
        operator: form.operator,
        threshold: Number(form.threshold),
        level: form.level,
      })
      setMsg('告警规则已创建')
      setForm({ name: '', metric: 'be_disk_usage', operator: '>', threshold: 80, level: 'WARNING' })
      if (onCreated) onCreated()
    } catch (e) {
      setMsg('创建失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mpp-alert-panel glass-card">
      <h3 className="mpp-section-title">新建告警规则</h3>
      {msg && <div className={msg.includes('失败') ? 'error-banner' : 'info-banner'}>{msg}</div>}
      <div className="mpp-form-grid">
        <div className="mpp-form-field">
          <label className="mpp-form-label">规则名称 *</label>
          <input
            className="field-input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="如：BE 磁盘使用率过高"
          />
        </div>
        <div className="mpp-form-field">
          <label className="mpp-form-label">监控指标</label>
          <select className="field-input" value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}>
            {metricOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="mpp-form-field">
          <label className="mpp-form-label">触发条件</label>
          <select className="field-input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}>
            <option value=">">大于 (&gt;)</option>
            <option value=">=">大于等于 (&gt;=)</option>
            <option value="<">小于 (&lt;)</option>
            <option value="<=">小于等于 (&lt;=)</option>
          </select>
        </div>
        <div className="mpp-form-field">
          <label className="mpp-form-label">阈值</label>
          <input
            className="field-input"
            type="number"
            value={form.threshold}
            onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
            placeholder="如：80"
          />
        </div>
        <div className="mpp-form-field">
          <label className="mpp-form-label">告警级别</label>
          <select className="field-input" value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
            <option value="INFO">信息</option>
            <option value="WARNING">警告</option>
            <option value="CRITICAL">严重</option>
          </select>
        </div>
      </div>
      <button className="button button-primary" onClick={handleSubmit} disabled={submitting || !clusterId}>
        {submitting ? '创建中...' : '创建规则'}
      </button>
    </div>
  )
}

export default function AlertPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [activeTab, setActiveTab] = useState('history')
  const [rulesKey, setRulesKey] = useState(0)

  useEffect(() => {
    dorisGet('/clusters').then(data => {
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0) setClusterId(list[0].id)
    }).catch(() => {})
  }, [])

  return (
    <div className="content-wrap mpp-alert-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">告警监控</h1>
          <p className="page-sub">Doris 集群告警规则配置与历史记录</p>
        </div>
        <div className="page-actions">
          <select
            className="field-input mpp-cluster-select"
            value={clusterId}
            onChange={e => setClusterId(e.target.value)}
          >
            <option value="">选择集群</option>
            {clusters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!clusterId && clusters.length === 0 && (
        <div className="mpp-empty-state">
          <div className="mpp-empty-icon">🔔</div>
          <div className="mpp-empty-title">暂无集群</div>
          <p className="mpp-empty-desc">请先在「集群管理」页面注册 Doris 集群，再配置告警规则</p>
        </div>
      )}

      {clusters.length > 0 && (
        <>
          <div className="mpp-tabs">
            {[
              { key: 'history', label: '告警记录' },
              { key: 'rules', label: '告警规则' },
              { key: 'create', label: '新建规则' },
            ].map(t => (
              <button
                key={t.key}
                className={`mpp-tab${activeTab === t.key ? ' is-active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >{t.label}</button>
            ))}
          </div>

          {activeTab === 'history' && <AlertHistoryPanel clusterId={clusterId} />}
          {activeTab === 'rules' && <AlertRulesPanel key={rulesKey} clusterId={clusterId} />}
          {activeTab === 'create' && (
            <CreateRulePanel
              clusterId={clusterId}
              onCreated={() => { setActiveTab('rules'); setRulesKey(k => k + 1) }}
            />
          )}
        </>
      )}
    </div>
  )
}
