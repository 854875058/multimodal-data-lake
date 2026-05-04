import { useEffect, useState } from 'react'
import api from '@/api'

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
    RUNNING: { label: '运行中', cls: 'badge-success' },
    STOPPED: { label: '已停止', cls: 'badge-error' },
    UNKNOWN: { label: '未知', cls: 'badge-warn' },
    STARTING: { label: '启动中', cls: 'badge-warn' },
  }
  const { label, cls } = map[status] || { label: status || '—', cls: 'badge-neutral' }
  return <span className={`status-badge ${cls}`}>{label}</span>
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

function NodeTable({ nodes, type, onAction }) {
  if (!nodes || nodes.length === 0) return <p className="mpp-empty">暂无 {type} 节点数据</p>
  return (
    <table className="data-table mpp-node-table">
      <thead>
        <tr>
          <th>节点 IP</th>
          <th>端口</th>
          <th>状态</th>
          <th>心跳时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node, i) => (
          <tr key={i}>
            <td className="mono">{node.ip || node.host || '—'}</td>
            <td className="mono">{node.port || '—'}</td>
            <td><StatusBadge status={node.alive === false ? 'STOPPED' : (node.status || 'RUNNING')} /></td>
            <td>{node.lastHeartbeat || node.lastStartupTime || '—'}</td>
            <td>
              <div className="mpp-action-row">
                <button className="button button-small" onClick={() => onAction(node, 'open')}>启动</button>
                <button className="button button-small button-danger" onClick={() => onAction(node, 'close')}>停止</button>
                <button className="button button-small" onClick={() => onAction(node, 'restart')}>重启</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ClusterPage() {
  const [clusters, setClusters] = useState([])
  const [currentCluster, setCurrentCluster] = useState(null)
  const [clusterDetail, setClusterDetail] = useState(null)
  const [feNodes, setFeNodes] = useState([])
  const [beNodes, setBeNodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [actionMsg, setActionMsg] = useState('')

  const loadClusters = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await mppGet('/new/cluster/list')
      const list = data.data || data || []
      setClusters(list)
      if (list.length > 0 && !currentCluster) {
        setCurrentCluster(list[0])
      }
    } catch (e) {
      setError('获取集群列表失败：' + e.message + '（请确认 MPP 后端服务已启动）')
    } finally {
      setLoading(false)
    }
  }

  const loadClusterDetail = async (clusterId) => {
    if (!clusterId) return
    try {
      const data = await mppGet(`/new/cluster/detail`, { clusterId })
      setClusterDetail(data.data || data)
      const nodes = await mppGet(`/new/cluster/nodes`, { clusterId })
      const nodeList = nodes.data || nodes || []
      setFeNodes(nodeList.filter(n => n.type === 'FE' || n.nodeType === 'FE'))
      setBeNodes(nodeList.filter(n => n.type === 'BE' || n.nodeType === 'BE'))
    } catch (e) {
      console.warn('集群详情加载失败:', e.message)
    }
  }

  useEffect(() => {
    loadClusters()
  }, [])

  useEffect(() => {
    if (currentCluster?.clusterId || currentCluster?.id) {
      loadClusterDetail(currentCluster.clusterId || currentCluster.id)
    }
  }, [currentCluster])

  const handleNodeAction = async (node, action) => {
    setActionMsg('')
    try {
      await mppPost(`/node/${action}`, { url: node.ip || node.host, type: node.type || 'BE' })
      setActionMsg(`节点 ${action} 操作已提交`)
      setTimeout(() => loadClusterDetail(currentCluster?.clusterId || currentCluster?.id), 2000)
    } catch (e) {
      setActionMsg('操作失败：' + e.message)
    }
  }

  const detail = clusterDetail || currentCluster

  return (
    <div className="content-wrap mpp-cluster-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Doris 集群管理</h1>
          <p className="page-sub">MPP 数据库集群运维与监控</p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" onClick={loadClusters} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {actionMsg && <div className="info-banner">{actionMsg}</div>}

      {/* 集群选择器 */}
      {clusters.length > 1 && (
        <div className="mpp-cluster-selector">
          <span className="mpp-selector-label">切换集群：</span>
          <div className="mpp-cluster-tabs">
            {clusters.map((c, i) => (
              <button
                key={i}
                className={`mpp-cluster-tab${(currentCluster?.clusterId || currentCluster?.id) === (c.clusterId || c.id) ? ' is-active' : ''}`}
                onClick={() => setCurrentCluster(c)}
              >
                {c.clusterName || c.name || `集群 ${i + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {clusters.length === 0 && !loading && !error && (
        <div className="mpp-empty-state">
          <div className="mpp-empty-icon">🗄️</div>
          <div className="mpp-empty-title">暂无集群</div>
          <p className="mpp-empty-desc">MPP 后端服务未返回集群数据，请先在 MPP 后端接管或新建集群</p>
        </div>
      )}

      {detail && (
        <>
          {/* 统计卡片 */}
          <div className="mpp-stats-row">
            <StatCard label="集群名称" value={detail.clusterName || detail.name} />
            <StatCard label="集群状态" value={<StatusBadge status={detail.status || 'RUNNING'} />} />
            <StatCard label="FE 节点数" value={feNodes.length || detail.feNodeCount || '—'} />
            <StatCard label="BE 节点数" value={beNodes.length || detail.beNodeCount || '—'} />
            <StatCard label="Doris 版本" value={detail.version || detail.dorisVersion || '—'} />
          </div>

          {/* Tab 切换 */}
          <div className="mpp-tabs">
            {[
              { key: 'overview', label: '集群概览' },
              { key: 'fe', label: 'FE 节点' },
              { key: 'be', label: 'BE 节点' },
              { key: 'scaling', label: '扩缩容' },
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
            <div className="mpp-tab-content">
              <div className="glass-card mpp-info-card">
                <h3 className="mpp-section-title">集群基本信息</h3>
                <div className="mpp-info-grid">
                  {[
                    ['集群 ID', detail.clusterId || detail.id],
                    ['集群名称', detail.clusterName || detail.name],
                    ['状态', detail.status || '运行中'],
                    ['FE Master', detail.feLeader || detail.masterHost || '—'],
                    ['创建时间', detail.createTime || detail.gmtCreate || '—'],
                    ['版本', detail.version || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="mpp-info-item">
                      <span className="mpp-info-key">{k}</span>
                      <span className="mpp-info-val mono">{v || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fe' && (
            <div className="mpp-tab-content glass-card">
              <h3 className="mpp-section-title">FE 节点列表</h3>
              <NodeTable nodes={feNodes} type="FE" onAction={handleNodeAction} />
            </div>
          )}

          {activeTab === 'be' && (
            <div className="mpp-tab-content glass-card">
              <h3 className="mpp-section-title">BE 节点列表</h3>
              <NodeTable nodes={beNodes} type="BE" onAction={handleNodeAction} />
            </div>
          )}

          {activeTab === 'scaling' && (
            <div className="mpp-tab-content glass-card">
              <h3 className="mpp-section-title">集群扩缩容</h3>
              <p className="mpp-desc">通过以下操作对集群进行在线扩容或缩容，扩容完成后数据自动均衡迁移。</p>
              <div className="mpp-scaling-actions">
                <div className="mpp-scaling-card">
                  <div className="mpp-scaling-icon">➕</div>
                  <div className="mpp-scaling-title">FE 扩容</div>
                  <p className="mpp-scaling-desc">向集群添加新的 FE 节点，提升元数据处理能力</p>
                  <button className="button button-primary">扩容 FE 节点</button>
                </div>
                <div className="mpp-scaling-card">
                  <div className="mpp-scaling-icon">➕</div>
                  <div className="mpp-scaling-title">BE 扩容</div>
                  <p className="mpp-scaling-desc">向集群添加新的 BE 节点，提升存储与计算能力</p>
                  <button className="button button-primary">扩容 BE 节点</button>
                </div>
                <div className="mpp-scaling-card">
                  <div className="mpp-scaling-icon">➖</div>
                  <div className="mpp-scaling-title">FE 缩容</div>
                  <p className="mpp-scaling-desc">下线指定 FE 节点，数据自动迁移后安全退出</p>
                  <button className="button button-danger">缩容 FE 节点</button>
                </div>
                <div className="mpp-scaling-card">
                  <div className="mpp-scaling-icon">➖</div>
                  <div className="mpp-scaling-title">BE 缩容</div>
                  <p className="mpp-scaling-desc">下线指定 BE 节点，Tablet 自动迁移后安全退出</p>
                  <button className="button button-danger">缩容 BE 节点</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
