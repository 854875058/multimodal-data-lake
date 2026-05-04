import { useEffect, useState } from 'react'

const API = '/api/doris'

async function dorisGet(path, params = {}) {
  const url = new URL(API + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPost(path, body = {}) {
  const res = await fetch(API + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisDelete(path) {
  const res = await fetch(API + path, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function StatusBadge({ alive }) {
  if (alive === true || alive === 'true')
    return <span className="status-badge badge-success">存活</span>
  if (alive === false || alive === 'false')
    return <span className="status-badge badge-error">离线</span>
  return <span className="status-badge badge-neutral">—</span>
}

function StatCard({ label, value, sub }) {
  return (
    <div className="mpp-stat-card">
      <div className="mpp-stat-label">{label}</div>
      <div className="mpp-stat-value">{value ?? '—'}</div>
      {sub && <div className="mpp-stat-sub">{sub}</div>}
    </div>
  )
}

function AddClusterModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: '', fe_host: '', fe_query_port: 9030, fe_http_port: 8030,
    username: 'root', password: '', description: ''
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleChange = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name || !form.fe_host) { setErr('集群名称和 FE 地址不能为空'); return }
    setSaving(true)
    setErr('')
    try {
      const data = await dorisPost('/clusters', {
        ...form,
        fe_query_port: Number(form.fe_query_port),
        fe_http_port: Number(form.fe_http_port),
      })
      if (data.success) { onSave(); onClose() }
      else setErr(data.detail || '创建失败')
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">注册 Doris 集群</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {err && <div className="error-banner">{err}</div>}
          <div className="form-grid-2">
            {[
              { label: '集群名称 *', key: 'name', placeholder: '如：生产集群' },
              { label: 'FE 地址 *', key: 'fe_host', placeholder: '如：192.168.1.10' },
              { label: 'Query 端口', key: 'fe_query_port', placeholder: '9030' },
              { label: 'HTTP 端口', key: 'fe_http_port', placeholder: '8030' },
              { label: '用户名', key: 'username', placeholder: 'root' },
              { label: '密码', key: 'password', placeholder: '留空则无密码', type: 'password' },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key} className="form-field">
                <label className="form-label">{label}</label>
                <input
                  className="field-input"
                  type={type || 'text'}
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={e => handleChange(key, e.target.value)}
                />
              </div>
            ))}
            <div className="form-field" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">备注</label>
              <input
                className="field-input"
                placeholder="可选"
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="button button-secondary" onClick={onClose}>取消</button>
          <button className="button button-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClusterPage() {
  const [clusters, setClusters] = useState([])
  const [currentCluster, setCurrentCluster] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [showAdd, setShowAdd] = useState(false)

  const loadClusters = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await dorisGet('/clusters')
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0 && !currentCluster) {
        setCurrentCluster(list[0])
      }
    } catch (e) {
      setError('获取集群列表失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStatus = async (clusterId) => {
    if (!clusterId) return
    setStatusLoading(true)
    try {
      const data = await dorisGet(`/clusters/${clusterId}/status`)
      setStatus(data)
    } catch (e) {
      console.warn('集群状态加载失败:', e.message)
    } finally {
      setStatusLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!currentCluster) return
    setActionMsg('')
    try {
      const data = await dorisPost(`/clusters/${currentCluster.id}/test`)
      setActionMsg(data.success ? `✅ 连接成功，版本：${data.version}` : `❌ 连接失败：${data.message}`)
    } catch (e) {
      setActionMsg('❌ 连接测试失败：' + e.message)
    }
  }

  const handleDeleteCluster = async () => {
    if (!currentCluster) return
    if (!window.confirm(`确认删除集群「${currentCluster.name}」？`)) return
    try {
      await dorisDelete(`/clusters/${currentCluster.id}`)
      setCurrentCluster(null)
      setStatus(null)
      loadClusters()
    } catch (e) {
      setError('删除失败：' + e.message)
    }
  }

  useEffect(() => { loadClusters() }, [])

  useEffect(() => {
    if (currentCluster?.id) {
      loadStatus(currentCluster.id)
    }
  }, [currentCluster?.id])

  const feNodes = status?.fe_nodes || []
  const beNodes = status?.be_nodes || []

  return (
    <div className="content-wrap mpp-cluster-page">
      {showAdd && <AddClusterModal onClose={() => setShowAdd(false)} onSave={loadClusters} />}

      <div className="page-header">
        <div>
          <h1 className="page-title">Doris 集群管理</h1>
          <p className="page-sub">MPP 数据库集群运维与监控</p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" onClick={loadClusters} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
          <button className="button button-primary" onClick={() => setShowAdd(true)}>+ 注册集群</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {actionMsg && <div className="info-banner">{actionMsg}</div>}

      {/* 集群选择器 */}
      {clusters.length > 0 && (
        <div className="mpp-cluster-selector">
          <span className="mpp-selector-label">选择集群：</span>
          <div className="mpp-cluster-tabs">
            {clusters.map((c) => (
              <button
                key={c.id}
                className={`mpp-cluster-tab${currentCluster?.id === c.id ? ' is-active' : ''}`}
                onClick={() => setCurrentCluster(c)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {clusters.length === 0 && !loading && !error && (
        <div className="mpp-empty-state">
          <div className="mpp-empty-icon">🗄️</div>
          <div className="mpp-empty-title">暂无集群</div>
          <p className="mpp-empty-desc">请点击「注册集群」添加 Doris FE 节点的连接信息</p>
          <button className="button button-primary" onClick={() => setShowAdd(true)}>注册第一个集群</button>
        </div>
      )}

      {currentCluster && (
        <>
          {/* 统计卡片 */}
          <div className="mpp-stats-row">
            <StatCard label="集群名称" value={currentCluster.name} />
            <StatCard label="FE 地址" value={currentCluster.fe_host} sub={`:${currentCluster.fe_query_port}`} />
            <StatCard label="连接状态" value={statusLoading ? '检测中...' : (status?.connected ? '✅ 已连接' : '❌ 未连接')} />
            <StatCard label="FE 节点数" value={statusLoading ? '—' : feNodes.length} />
            <StatCard label="BE 节点数" value={statusLoading ? '—' : beNodes.length} />
          </div>

          {/* Tab 切换 */}
          <div className="mpp-tabs">
            {[
              { key: 'overview', label: '集群概览' },
              { key: 'fe', label: `FE 节点 (${feNodes.length})` },
              { key: 'be', label: `BE 节点 (${beNodes.length})` },
            ].map(tab => (
              <button
                key={tab.key}
                className={`mpp-tab${activeTab === tab.key ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="mpp-tab-content glass-card">
              <h3 className="mpp-section-title">集群基本信息</h3>
              <div className="mpp-info-grid">
                {[
                  ['集群 ID', currentCluster.id],
                  ['集群名称', currentCluster.name],
                  ['FE 主机', currentCluster.fe_host],
                  ['Query 端口', currentCluster.fe_query_port],
                  ['HTTP 端口', currentCluster.fe_http_port],
                  ['用户名', currentCluster.username],
                  ['备注', currentCluster.description || '—'],
                  ['注册时间', currentCluster.created_at || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="mpp-info-item">
                    <span className="mpp-info-key">{k}</span>
                    <span className="mpp-info-val mono">{v || '—'}</span>
                  </div>
                ))}
              </div>
              <div className="mpp-action-row" style={{ marginTop: 16 }}>
                <button className="button button-primary" onClick={handleTestConnection}>测试连接</button>
                <button className="button button-secondary" onClick={() => loadStatus(currentCluster.id)}>刷新状态</button>
                <button className="button button-danger" onClick={handleDeleteCluster}>删除集群</button>
              </div>
            </div>
          )}

          {activeTab === 'fe' && (
            <div className="mpp-tab-content glass-card">
              <h3 className="mpp-section-title">FE 节点列表</h3>
              {feNodes.length === 0
                ? <p className="mpp-empty">{statusLoading ? '加载中...' : '暂无 FE 节点数据（请确认 Doris 连接正常）'}</p>
                : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>主机</th>
                        <th>Query 端口</th>
                        <th>HTTP 端口</th>
                        <th>角色</th>
                        <th>是否 Master</th>
                        <th>存活状态</th>
                        <th>最后心跳</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feNodes.map((node, i) => (
                        <tr key={i}>
                          <td className="mono">{node.host || '—'}</td>
                          <td className="mono">{node.port || '—'}</td>
                          <td className="mono">{node.http_port || '—'}</td>
                          <td>{node.role || '—'}</td>
                          <td>{node.is_master ? '✅ 是' : '否'}</td>
                          <td><StatusBadge alive={node.alive} /></td>
                          <td>{node.last_heartbeat || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          )}

          {activeTab === 'be' && (
            <div className="mpp-tab-content glass-card">
              <h3 className="mpp-section-title">BE 节点列表</h3>
              {beNodes.length === 0
                ? <p className="mpp-empty">{statusLoading ? '加载中...' : '暂无 BE 节点数据（请确认 Doris 连接正常）'}</p>
                : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>主机</th>
                        <th>心跳端口</th>
                        <th>BE 端口</th>
                        <th>存活状态</th>
                        <th>总容量</th>
                        <th>已用容量</th>
                        <th>最后心跳</th>
                      </tr>
                    </thead>
                    <tbody>
                      {beNodes.map((node, i) => (
                        <tr key={i}>
                          <td className="mono">{node.host || '—'}</td>
                          <td className="mono">{node.port || '—'}</td>
                          <td className="mono">{node.be_port || '—'}</td>
                          <td><StatusBadge alive={node.alive} /></td>
                          <td>{node.total_capacity || '—'}</td>
                          <td>{node.used_capacity || '—'}</td>
                          <td>{node.last_heartbeat || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          )}
        </>
      )}
    </div>
  )
}
