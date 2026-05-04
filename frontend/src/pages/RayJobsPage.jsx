import { useEffect, useState } from 'react'

async function rayGet(path) {
  const res = await fetch('/api/ray' + path, { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function rayPost(path, body = {}) {
  const res = await fetch('/api/ray' + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function rayDelete(path) {
  const res = await fetch('/api/ray' + path, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function StatusBadge({ status }) {
  const map = {
    SUCCEEDED: { label: '已完成', cls: 'badge-success' },
    FAILED: { label: '失败', cls: 'badge-error' },
    RUNNING: { label: '执行中', cls: 'badge-warn' },
    PENDING: { label: '等待中', cls: 'badge-neutral' },
    STOPPED: { label: '已停止', cls: 'badge-neutral' },
  }
  const s = (status || '').toUpperCase()
  const { label, cls } = map[s] || { label: status || '—', cls: 'badge-neutral' }
  return <span className={`status-badge ${cls}`}>{label}</span>
}

function ClusterOverview({ cluster }) {
  if (!cluster) return null
  const cpuUsed = (cluster.cpus_total || 0) - (cluster.cpus_available || 0)
  const cpuPct = cluster.cpus_total > 0 ? Math.round((cpuUsed / cluster.cpus_total) * 100) : 0
  return (
    <div className="ray-cluster-grid">
      <div className="ray-stat-card">
        <div className="ray-stat-label">节点数</div>
        <div className="ray-stat-value">{cluster.nodes ?? '—'}</div>
      </div>
      <div className="ray-stat-card">
        <div className="ray-stat-label">CPU 使用</div>
        <div className="ray-stat-value">{cpuUsed} / {cluster.cpus_total ?? '—'}</div>
        <div className="ray-stat-bar">
          <div className="ray-stat-bar-fill" style={{ width: `${cpuPct}%` }} />
        </div>
        <div className="ray-stat-sub">{cpuPct}%</div>
      </div>
      <div className="ray-stat-card">
        <div className="ray-stat-label">GPU 总量</div>
        <div className="ray-stat-value">{cluster.gpus_total ?? 0}</div>
        <div className="ray-stat-sub">可用 {cluster.gpus_available ?? 0}</div>
      </div>
      <div className="ray-stat-card">
        <div className="ray-stat-label">内存 (GB)</div>
        <div className="ray-stat-value">{cluster.memory_total_gb ?? '—'}</div>
        <div className="ray-stat-sub">对象存储 {cluster.object_store_gb ?? 0} GB</div>
      </div>
    </div>
  )
}

function JobLogsModal({ job, onClose }) {
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!job) return
    rayGet(`/jobs/${job.job_id}`)
      .then(d => setLogs(d.logs || '暂无日志'))
      .catch(e => setLogs('加载日志失败：' + e.message))
      .finally(() => setLoading(false))
  }, [job])

  if (!job) return null
  return (
    <div className="mpp-modal-overlay" onClick={onClose}>
      <div className="mpp-modal" style={{ maxWidth: 720, width: '90vw' }} onClick={e => e.stopPropagation()}>
        <div className="mpp-modal-header">
          <h3 className="mpp-modal-title">任务日志 — {job.job_id}</h3>
          <button className="mpp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mpp-modal-body">
          {loading ? (
            <div className="mpp-loading">加载中...</div>
          ) : (
            <pre className="ray-log-viewer">{logs}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

function SubmitJobModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    entrypoint: '',
    num_cpus: 1,
    num_gpus: 0,
    runtime_env: '{}',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.entrypoint.trim()) {
      setError('入口命令不能为空')
      return
    }
    let runtime_env = {}
    try {
      runtime_env = JSON.parse(form.runtime_env || '{}')
    } catch {
      setError('runtime_env 必须是合法 JSON')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({ ...form, runtime_env, num_cpus: Number(form.num_cpus), num_gpus: Number(form.num_gpus) })
      onClose()
    } catch (e) {
      setError('提交失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mpp-modal-overlay" onClick={onClose}>
      <div className="mpp-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="mpp-modal-header">
          <h3 className="mpp-modal-title">提交 Ray Job</h3>
          <button className="mpp-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="mpp-modal-body">
          {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="mpp-form-row">
            <label className="mpp-form-label">任务名称</label>
            <input className="field-input" name="name" value={form.name} onChange={handleChange} placeholder="自定义任务名称" />
          </div>
          <div className="mpp-form-row">
            <label className="mpp-form-label">入口命令 *</label>
            <input className="field-input" name="entrypoint" value={form.entrypoint} onChange={handleChange} placeholder="python train.py --epochs 10" />
          </div>
          <div className="mpp-form-row" style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="mpp-form-label">CPU 数量</label>
              <input className="field-input" name="num_cpus" type="number" min="0.5" step="0.5" value={form.num_cpus} onChange={handleChange} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mpp-form-label">GPU 数量</label>
              <input className="field-input" name="num_gpus" type="number" min="0" step="1" value={form.num_gpus} onChange={handleChange} />
            </div>
          </div>
          <div className="mpp-form-row">
            <label className="mpp-form-label">Runtime Env (JSON)</label>
            <textarea
              className="field-input"
              name="runtime_env"
              value={form.runtime_env}
              onChange={handleChange}
              rows={3}
              placeholder='{"pip": ["pandas"], "env_vars": {"MY_VAR": "value"}}'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="button button-secondary" onClick={onClose}>取消</button>
            <button className="button button-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '提交中...' : '提交任务'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RayJobsPage() {
  const [status, setStatus] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [logJob, setLogJob] = useState(null)
  const [showSubmit, setShowSubmit] = useState(false)
  const [activeTab, setActiveTab] = useState('jobs')

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError('')
    try {
      const [st, jb] = await Promise.all([
        rayGet('/status').catch(() => ({ connected: false, cluster: {} })),
        rayGet('/jobs').catch(() => ({ jobs: [] })),
      ])
      setStatus(st)
      setJobs(jb.jobs || [])
    } catch (e) {
      setError('加载失败：' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadAll(false) }, [])

  // 有运行中任务时自动轮询
  useEffect(() => {
    const hasActive = jobs.some(j => ['RUNNING', 'PENDING'].includes((j.status || '').toUpperCase()))
    if (!hasActive) return
    const timer = setInterval(() => loadAll(true), 5000)
    return () => clearInterval(timer)
  }, [jobs])

  const handleStop = async (jobId) => {
    try {
      await rayDelete(`/jobs/${jobId}`)
      setMsg(`任务 ${jobId} 已停止`)
      loadAll(true)
    } catch (e) {
      setError('停止失败：' + e.message)
    }
  }

  const handleSubmitJob = async (form) => {
    await rayPost('/jobs', form)
    setMsg('任务已提交')
    loadAll(true)
  }

  const runningCount = jobs.filter(j => (j.status || '').toUpperCase() === 'RUNNING').length
  const failedCount = jobs.filter(j => (j.status || '').toUpperCase() === 'FAILED').length
  const doneCount = jobs.filter(j => (j.status || '').toUpperCase() === 'SUCCEEDED').length

  if (loading) return <div className="loading-state">Ray 计算编排加载中...</div>

  return (
    <div className="content-wrap ray-jobs-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ray 计算编排</h1>
          <p className="page-sub">分布式计算任务提交、监控与管理</p>
        </div>
        <div className="page-actions">
          <button className="button button-primary" onClick={() => setShowSubmit(true)}>
            + 提交任务
          </button>
          <button className="button button-secondary" onClick={() => loadAll(true)} disabled={refreshing}>
            {refreshing ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="info-banner">{msg}</div>}

      {/* 集群连接状态 */}
      <div className="ray-conn-bar">
        <span className={`ray-conn-dot ${status?.connected ? 'is-online' : 'is-offline'}`} />
        <span>{status?.connected ? 'Ray 集群已连接' : 'Ray 集群未连接'}</span>
        {status?.message && <span className="ray-conn-msg"> — {status.message}</span>}
      </div>

      {/* KPI */}
      <div className="ray-cluster-grid" style={{ marginBottom: 16 }}>
        <div className="ray-stat-card">
          <div className="ray-stat-label">执行中</div>
          <div className="ray-stat-value" style={{ color: '#f77234' }}>{runningCount}</div>
        </div>
        <div className="ray-stat-card">
          <div className="ray-stat-label">已完成</div>
          <div className="ray-stat-value" style={{ color: '#00b42a' }}>{doneCount}</div>
        </div>
        <div className="ray-stat-card">
          <div className="ray-stat-label">失败</div>
          <div className="ray-stat-value" style={{ color: '#f53f3f' }}>{failedCount}</div>
        </div>
        <div className="ray-stat-card">
          <div className="ray-stat-label">任务总数</div>
          <div className="ray-stat-value">{jobs.length}</div>
        </div>
      </div>

      <div className="mpp-tabs">
        {[{ key: 'jobs', label: '任务列表' }, { key: 'cluster', label: '集群资源' }].map(t => (
          <button
            key={t.key}
            className={`mpp-tab${activeTab === t.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === 'jobs' && (
        <div className="glass-card mpp-tab-content">
          {jobs.length === 0 ? (
            <div className="mpp-empty-state">
              <div className="mpp-empty-icon">⚡</div>
              <div className="mpp-empty-title">暂无 Ray Job</div>
              <p className="mpp-empty-desc">点击「提交任务」创建第一个分布式计算任务</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>状态</th>
                  <th>入口命令</th>
                  <th>开始时间</th>
                  <th>结束时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, i) => {
                  const s = (job.status || '').toUpperCase()
                  return (
                    <tr key={i}>
                      <td className="mono" style={{ fontSize: 12 }}>{job.job_id}</td>
                      <td><StatusBadge status={job.status} /></td>
                      <td className="mono" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.entrypoint || '—'}
                      </td>
                      <td>{job.start_time || '—'}</td>
                      <td>{job.end_time || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="button button-small" onClick={() => setLogJob(job)}>查看日志</button>
                          {['RUNNING', 'PENDING'].includes(s) && (
                            <button className="button button-small button-danger" onClick={() => handleStop(job.job_id)}>停止</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'cluster' && (
        <div className="glass-card mpp-tab-content">
          {status?.connected ? (
            <>
              <h3 className="mpp-section-title">集群资源概况</h3>
              <ClusterOverview cluster={status.cluster} />
            </>
          ) : (
            <div className="mpp-empty-state">
              <div className="mpp-empty-icon">🔌</div>
              <div className="mpp-empty-title">Ray 集群未连接</div>
              <p className="mpp-empty-desc">请确认 Ray Dashboard 已启动（默认 http://127.0.0.1:8265）</p>
            </div>
          )}
        </div>
      )}

      {logJob && <JobLogsModal job={logJob} onClose={() => setLogJob(null)} />}
      {showSubmit && <SubmitJobModal onClose={() => setShowSubmit(false)} onSubmit={handleSubmitJob} />}
    </div>
  )
}
