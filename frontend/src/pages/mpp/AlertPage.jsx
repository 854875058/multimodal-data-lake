import { useEffect, useState } from 'react'

const MPP_BASE = '/api/mpp'

async function mppGet(path, params = {}) {
  const url = new URL(MPP_BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`MPP 请求失败: ${res.status}`)
  return res.json()
}

async function mppPost(path, body = {}) {
  const res = await fetch(MPP_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`MPP 请求失败: ${res.status}`)
  return res.json()
}

function SeverityBadge({ level }) {
  const map = {
    CRITICAL: { label: '严重', cls: 'badge-error' },
    WARNING: { label: '警告', cls: 'badge-warn' },
    INFO: { label: '信息', cls: 'badge-neutral' },
    HIGH: { label: '高', cls: 'badge-error' },
    MEDIUM: { label: '中', cls: 'badge-warn' },
    LOW: { label: '低', cls: 'badge-success' },
  }
  const { label, cls } = map[level] || { label: level || '—', cls: 'badge-neutral' }
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function StatusBadge({ enabled }) {
  return enabled
    ? <span className="status-badge badge-success">已启用</span>
    : <span className="status-badge badge-neutral">已禁用</span>
}

// 告警记录面板
function AlertHistoryPanel({ clusterId }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const load = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const now = Date.now()
      const start = now - 7 * 24 * 60 * 60 * 1000
      const data = await mppGet('/alarm/record/list/page', {
        clusterId,
        pageNum: page,
        pageSize,
        startTime: start,
        endTime: now,
      })
      setRecords(data.data?.list || data.data || data || [])
    } catch (e) {
      console.warn('告警记录加载失败:', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clusterId, page])

  return (
    <div className="mpp-alert-panel glass-card">
      <div className="mpp-panel-header">
        <h3 className="mpp-section-title">告警记录（近 7 天）</h3>
        <button className="button button-secondary button-small" onClick={load} disabled={loading}>刷新</button>
      </div>
      {loading ? <div className="mpp-loading">加载中...</div> : (
        records.length === 0 ? <p className="mpp-empty">暂无告警记录</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>告警时间</th>
                <th>告警名称</th>
                <th>级别</th>
                <th>告警内容</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i}>
                  <td>{r.createTime || r.alarmTime || r.time || '—'}</td>
                  <td>{r.ruleName || r.name || r.alarmName || '—'}</td>
                  <td><SeverityBadge level={r.level || r.severity || r.alarmLevel} /></td>
                  <td className="mpp-alert-msg">{r.message || r.content || r.alarmContent || '—'}</td>
                  <td>{r.status === 'resolved' ? <span className="status-badge badge-success">已恢复</span> : <span className="status-badge badge-error">未恢复</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
      <div className="mpp-pagination">
        <button className="button button-small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
        <span className="mpp-page-info">第 {page} 页</span>
        <button className="button button-small" disabled={records.length < pageSize} onClick={() => setPage(p => p + 1)}>下一页</button>
      </div>
    </div>
  )
}

// 告警规则面板
function AlertRulesPanel({ clusterId }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [opMsg, setOpMsg] = useState('')

  const load = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const data = await mppGet('/alarm/rule/list/page', {
        clusterId,
        pageNum: 1,
        pageSize: 50,
      })
      setRules(data.data?.list || data.data || data || [])
    } catch (e) {
      // 尝试新版接口
      try {
        const data2 = await mppGet('/alert/rules', { clusterId })
        setRules(data2.data || data2 || [])
      } catch (e2) {
        console.warn('告警规则加载失败:', e2.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleRule = async (rule) => {
    setOpMsg('')
    try {
      const newState = !rule.enabled
      await mppGet(`/alarm/rule/enable/${rule.id}`, { enabled: newState })
      setOpMsg(`规则「${rule.ruleName || rule.name}」已${newState ? '启用' : '禁用'}`)
      load()
    } catch (e) {
      setOpMsg('操作失败：' + e.message)
    }
  }

  const deleteRule = async (rule) => {
    if (!window.confirm(`确认删除告警规则「${rule.ruleName || rule.name}」？`)) return
    setOpMsg('')
    try {
      await mppGet(`/alarm/rule/delete/${rule.id}`)
      setOpMsg('规则已删除')
      load()
    } catch (e) {
      setOpMsg('删除失败：' + e.message)
    }
  }

  useEffect(() => { load() }, [clusterId])

  return (
    <div className="mpp-alert-panel glass-card">
      <div className="mpp-panel-header">
        <h3 className="mpp-section-title">告警规则管理</h3>
        <button className="button button-secondary button-small" onClick={load} disabled={loading}>刷新</button>
      </div>
      {opMsg && <div className="info-banner">{opMsg}</div>}
      {loading ? <div className="mpp-loading">加载中...</div> : (
        rules.length === 0 ? <p className="mpp-empty">暂无告警规则</p> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>规则名称</th>
                <th>指标类型</th>
                <th>阈值</th>
                <th>级别</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={i}>
                  <td>{rule.ruleName || rule.name || '—'}</td>
                  <td>{rule.metricType || rule.metric || rule.category || '—'}</td>
                  <td className="mono">{rule.threshold !== undefined ? String(rule.threshold) : '—'}</td>
                  <td><SeverityBadge level={rule.level || rule.severity} /></td>
                  <td><StatusBadge enabled={rule.enabled !== false} /></td>
                  <td>
                    <div className="mpp-action-row">
                      <button className="button button-small" onClick={() => toggleRule(rule)}>
                        {rule.enabled !== false ? '禁用' : '启用'}
                      </button>
                      <button className="button button-small button-danger" onClick={() => deleteRule(rule)}>删除</button>
                    </div>
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
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [form, setForm] = useState({ ruleName: '', threshold: '', level: 'WARNING' })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    mppGet('/alarm/template/list').then(data => {
      setTemplates(data.data || data || [])
    }).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!clusterId || !form.ruleName) {
      setMsg('请填写规则名称')
      return
    }
    setSubmitting(true)
    setMsg('')
    try {
      await mppPost('/alarm/rule/create', {
        clusterId: Number(clusterId) || clusterId,
        templateId: selectedTemplate || undefined,
        ruleName: form.ruleName,
        threshold: Number(form.threshold) || undefined,
        level: form.level,
      })
      setMsg('告警规则已创建')
      setForm({ ruleName: '', threshold: '', level: 'WARNING' })
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
          <label className="mpp-form-label">规则模板</label>
          <select className="field-input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
            <option value="">自定义规则（不使用模板）</option>
            {templates.map((t, i) => (
              <option key={i} value={t.id}>{t.name || t.templateName}</option>
            ))}
          </select>
        </div>
        <div className="mpp-form-field">
          <label className="mpp-form-label">规则名称 *</label>
          <input
            className="field-input"
            value={form.ruleName}
            onChange={e => setForm(f => ({ ...f, ruleName: e.target.value }))}
            placeholder="请输入规则名称"
          />
        </div>
        <div className="mpp-form-field">
          <label className="mpp-form-label">告警阈值</label>
          <input
            className="field-input"
            type="number"
            value={form.threshold}
            onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
            placeholder="如：80（%）"
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
    mppGet('/new/cluster/list').then(data => {
      const list = data.data || data || []
      setClusters(list)
      if (list.length > 0) {
        setClusterId(String(list[0].clusterId || list[0].id))
      }
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
            {clusters.map((c, i) => (
              <option key={i} value={c.clusterId || c.id}>{c.clusterName || c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!clusterId && (
        <div className="mpp-empty-state">
          <div className="mpp-empty-icon">🔔</div>
          <div className="mpp-empty-title">请选择集群</div>
          <p className="mpp-empty-desc">选择一个 Doris 集群后，可查看告警记录并管理告警规则</p>
        </div>
      )}

      {clusterId && (
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
