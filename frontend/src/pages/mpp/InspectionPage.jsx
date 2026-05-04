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

function StatusBadge({ status }) {
  const map = {
    SUCCESS: { label: '成功', cls: 'badge-success' },
    FAILED: { label: '失败', cls: 'badge-error' },
    WARNING: { label: '警告', cls: 'badge-warn' },
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

function ResultDetailModal({ inspection, onClose }) {
  if (!inspection) return null
  const items = inspection.result?.items || []
  return (
    <div className="mpp-modal-overlay" onClick={onClose}>
      <div className="mpp-modal" onClick={e => e.stopPropagation()}>
        <div className="mpp-modal-header">
          <h3 className="mpp-modal-title">巡检详情</h3>
          <button className="mpp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mpp-modal-body">
          <div className="mpp-result-meta">
            <span>巡检时间：{inspection.created_at || '—'}</span>
            <span>耗时：{inspection.duration != null ? `${inspection.duration}s` : '—'}</span>
            <span>综合评分：<ScoreGauge score={inspection.score} /></span>
            <span>状态：<StatusBadge status={inspection.status} /></span>
          </div>
          {items.length > 0 ? (
            <table className="data-table" style={{ marginTop: 12 }}>
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
                    <td>{item.name || '—'}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="mono">{item.value || '—'}</td>
                    <td>{item.suggestion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mpp-empty">暂无检查详情</p>
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
  const [polling, setPolling] = useState(null)

  // 加载集群列表
  useEffect(() => {
    dorisGet('/clusters').then(data => {
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0) {
        setClusterId(list[0].id)
      }
    }).catch(() => {})
  }, [])

  const loadHistory = async () => {
    if (!clusterId) return
    setLoading(true)
    setError('')
    try {
      const data = await dorisGet('/inspection/history', { cluster_id: clusterId, limit: 20 })
      setHistory(data.history || [])
    } catch (e) {
      setError('加载巡检历史失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (clusterId) loadHistory()
  }, [clusterId])

  // 轮询巡检结果
  const pollInspection = (inspectionId) => {
    const timer = setInterval(async () => {
      try {
        const data = await dorisGet(`/inspection/${inspectionId}`)
        const ins = data.inspection || {}
        if (ins.status !== 'RUNNING') {
          clearInterval(timer)
          setPolling(null)
          setRunning(false)
          setMsg(`巡检完成，评分：${ins.score ?? 'N/A'}`)
          await loadHistory()
        }
      } catch (e) {
        clearInterval(timer)
        setPolling(null)
        setRunning(false)
      }
    }, 2000)
    setPolling(timer)
  }

  const handleRunNow = async () => {
    if (!clusterId) return
    setRunning(true)
    setError('')
    setMsg('')
    try {
      const data = await dorisPost('/inspection/run', { cluster_id: clusterId })
      if (data.success) {
        setMsg('巡检任务已启动，正在执行...')
        pollInspection(data.inspection_id)
      } else {
        setRunning(false)
        setError(data.detail || '启动巡检失败')
      }
    } catch (e) {
      setRunning(false)
      setError('启动巡检失败：' + e.message)
    }
  }

  const loadDetail = async (record) => {
    try {
      const data = await dorisGet(`/inspection/${record.id}`)
      setDetail(data.inspection || record)
    } catch (e) {
      setDetail(record)
    }
  }

  return (
    <div className="content-wrap mpp-inspection-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">自动巡检</h1>
          <p className="page-sub">Doris 集群健康巡检</p>
        </div>
        <div className="page-actions">
          <select
            className="field-input"
            value={clusterId}
            onChange={e => setClusterId(e.target.value)}
            style={{ minWidth: 160, marginRight: 8 }}
          >
            <option value="">选择集群</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            className="button button-primary"
            onClick={handleRunNow}
            disabled={running || !clusterId}
          >
            {running ? '巡检中...' : '立即巡检'}
          </button>
          <button className="button button-secondary" onClick={loadHistory} disabled={loading} style={{ marginLeft: 8 }}>刷新</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="info-banner">{msg}</div>}

      {!clusterId && (
        <div className="mpp-empty-state">
          <div className="mpp-empty-icon">🔍</div>
          <div className="mpp-empty-title">请先注册 Doris 集群</div>
          <p className="mpp-empty-desc">在「集群管理」页面注册 Doris 集群后，即可发起巡检</p>
        </div>
      )}

      {clusterId && (
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
                  <th>检查项数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{row.created_at || '—'}</td>
                    <td className="mono">{row.duration != null ? `${row.duration}s` : '—'}</td>
                    <td><ScoreGauge score={row.score} /></td>
                    <td><StatusBadge status={row.status} /></td>
                    <td className="mono">{row.check_count ?? '—'}</td>
                    <td>
                      <button className="button button-small" onClick={() => loadDetail(row)}>查看详情</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {detail && (
        <ResultDetailModal inspection={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
