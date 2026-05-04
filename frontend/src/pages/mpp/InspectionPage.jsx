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

function StatusBadge({ status }) {
  const map = {
    SUCCESS: { label: '成功', cls: 'badge-success' },
    FAILED: { label: '失败', cls: 'badge-error' },
    RUNNING: { label: '执行中', cls: 'badge-warn' },
    PENDING: { label: '待执行', cls: 'badge-neutral' },
  }
  const { label, cls } = map[status?.toUpperCase()] || { label: status || '—', cls: 'badge-neutral' }
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function ScoreGauge({ score }) {
  if (score == null) return <span className="mpp-score-na">N/A</span>
  const val = Number(score)
  const cls = val >= 90 ? 'score-good' : val >= 70 ? 'score-warn' : 'score-bad'
  return <span className={`mpp-score ${cls}`}>{val}</span>
}

function ResultDetailModal({ result, onClose }) {
  if (!result) return null
  const items = result.items || result.checkItems || result.details || []
  return (
    <div className="mpp-modal-overlay" onClick={onClose}>
      <div className="mpp-modal" onClick={e => e.stopPropagation()}>
        <div className="mpp-modal-header">
          <h3 className="mpp-modal-title">巡检详情</h3>
          <button className="mpp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mpp-modal-body">
          <div className="mpp-result-meta">
            <span>巡检时间：{result.startTime || result.createTime || '—'}</span>
            <span>综合评分：<ScoreGauge score={result.score} /></span>
            <span>状态：<StatusBadge status={result.status} /></span>
          </div>
          {items.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>检查项</th>
                  <th>状态</th>
                  <th>结果</th>
                  <th>建议</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name || item.checkName || '—'}</td>
                    <td><StatusBadge status={item.status || item.result} /></td>
                    <td className="mono">{item.value || item.detail || '—'}</td>
                    <td>{item.suggestion || item.advice || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className="mpp-result-raw">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InspectionPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [detail, setDetail] = useState(null)
  const [activeTab, setActiveTab] = useState('history')
  const [timedConfig, setTimedConfig] = useState({ cron: '0 2 * * *', enabled: false })

  useEffect(() => {
    mppGet('/new/cluster/list').then(data => {
      const list = data.data || data || []
      setClusters(list)
      if (list.length > 0) {
        const id = list[0].clusterId || list[0].id
        setClusterId(String(id))
      }
    }).catch(() => {})
  }, [])

  const loadHistory = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const data = await mppGet('/cluster/inspection/list-inspection-history', { clusterId })
      setHistory(data.data || data || [])
    } catch (e) {
      setError('加载巡检历史失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (clusterId) loadHistory()
  }, [clusterId])

  const handleRunNow = async () => {
    if (!clusterId) return
    setRunning(true)
    setError('')
    setMsg('')
    try {
      await mppPost('/cluster/inspection/start-inspection', { clusterId })
      setMsg('巡检任务已提交，请稍后刷新查看结果')
      setTimeout(loadHistory, 5000)
    } catch (e) {
      setError('启动巡检失败：' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const handleSaveTimed = async () => {
    if (!clusterId) return
    try {
      await mppPost('/cluster/inspection/start-timed-inspection', {
        clusterId,
        cron: timedConfig.cron,
        enabled: timedConfig.enabled,
      })
      setMsg('定时巡检配置已保存')
    } catch (e) {
      setError('保存定时配置失败：' + e.message)
    }
  }

  const loadDetail = async (record) => {
    try {
      const data = await mppGet('/cluster/inspection/get-inspection-result', {
        clusterId,
        inspectionId: record.id || record.inspectionId,
      })
      setDetail(data.data || data)
    } catch (e) {
      setDetail(record)
    }
  }

  return (
    <div className="content-wrap mpp-inspection-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">自动巡检</h1>
          <p className="page-sub">Doris 集群健康巡检与定时任务管理</p>
        </div>
        <div className="page-actions">
          <select
            className="field-input"
            value={clusterId}
            onChange={e => setClusterId(e.target.value)}
            style={{ minWidth: 160, marginRight: 8 }}
          >
            <option value="">选择集群</option>
            {clusters.map((c, i) => (
              <option key={i} value={c.clusterId || c.id}>{c.clusterName || c.name}</option>
            ))}
          </select>
          <button
            className="button button-primary"
            onClick={handleRunNow}
            disabled={running || !clusterId}
          >
            {running ? '巡检中...' : '立即巡检'}
          </button>
          <button className="button button-secondary" onClick={loadHistory} disabled={loading}>刷新</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="info-banner">{msg}</div>}

      <div className="mpp-tabs">
        {[
          { key: 'history', label: '巡检历史' },
          { key: 'timed', label: '定时配置' },
        ].map(t => (
          <button
            key={t.key}
            className={`mpp-tab${activeTab === t.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === 'history' && (
        <div className="glass-card mpp-tab-content">
          {loading ? (
            <div className="mpp-loading">加载中...</div>
          ) : history.length === 0 ? (
            <div className="mpp-empty-state">
              <div className="mpp-empty-icon">🔍</div>
              <div className="mpp-empty-title">暂无巡检记录</div>
              <p className="mpp-empty-desc">点击「立即巡检」开始第一次集群健康检查</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>巡检时间</th>
                  <th>耗时</th>
                  <th>综合评分</th>
                  <th>状态</th>
                  <th>检查项</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => (
                  <tr key={i}>
                    <td>{row.startTime || row.createTime || '—'}</td>
                    <td className="mono">{row.duration ? `${row.duration}s` : '—'}</td>
                    <td><ScoreGauge score={row.score} /></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="mono">{row.checkCount || row.itemCount || '—'}</td>
                    <td>
                      <button
                        className="button button-small"
                        onClick={() => loadDetail(row)}
                      >查看详情</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'timed' && (
        <div className="glass-card mpp-tab-content">
          <h3 className="mpp-section-title">定时巡检配置</h3>
          <p className="mpp-desc">配置定时巡检任务，系统将按设定周期自动对集群进行健康检查。</p>
          <div className="mpp-form-row">
            <label className="mpp-form-label">Cron 表达式</label>
            <input
              className="field-input"
              value={timedConfig.cron}
              onChange={e => setTimedConfig(prev => ({ ...prev, cron: e.target.value }))}
              placeholder="例：0 2 * * *（每天凌晨2点）"
              style={{ width: 280 }}
            />
          </div>
          <div className="mpp-form-row">
            <label className="mpp-form-label">启用状态</label>
            <label className="mpp-toggle">
              <input
                type="checkbox"
                checked={timedConfig.enabled}
                onChange={e => setTimedConfig(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              <span className="mpp-toggle-slider" />
              <span style={{ marginLeft: 8 }}>{timedConfig.enabled ? '已启用' : '已禁用'}</span>
            </label>
          </div>
          <div className="mpp-cron-presets">
            <span className="mpp-form-label">快捷选择：</span>
            {[
              { label: '每天凌晨2点', value: '0 2 * * *' },
              { label: '每6小时', value: '0 */6 * * *' },
              { label: '每周一凌晨', value: '0 2 * * 1' },
            ].map(p => (
              <button
                key={p.value}
                className="button button-small button-secondary"
                onClick={() => setTimedConfig(prev => ({ ...prev, cron: p.value }))}
              >{p.label}</button>
            ))}
          </div>
          <button className="button button-primary" onClick={handleSaveTimed} style={{ marginTop: 16 }}>
            保存配置
          </button>
        </div>
      )}

      {detail && (
        <ResultDetailModal result={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
