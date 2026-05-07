import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tabs, Empty, Card, Message, Progress, Space, Tag, Typography } from '@arco-design/web-react'
import { IconRefresh, IconStorage, IconRobot, IconCommand, IconSearch, IconSafe, IconCheckCircle, IconCloseCircle, IconExclamationCircle } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import ChartPanel from '@/components/ChartPanel.jsx'
import { formatNumber, formatPercent, formatDateTime } from '@/utils/format'
import {
  HelloBar, StatCard, Sparkline, ClusterTopology, PrdCard, AlertRow, PrdTag, HealthRing
} from '@/components/PrdWidgets.jsx'

const { Title: ATitle, Text } = Typography
const TabPane = Tabs.TabPane

const emptyStats = {
  total_files: 0, today_files: 0, week_files: 0,
  week_tasks_total: 0, week_tasks_success: 0, week_success_rate: 0,
  text_rows: 0, image_rows: 0,
}
const emptyStatus = {
  resources: { cpu_percent: 0, memory_percent: 0, memory_used_gb: 0, memory_total_gb: 0 },
  models: { loaded: false, models: [] },
  lancedb: { connected: false, files_count: 0 },
}

function greetByHour() {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function nowStr() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const week = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${week} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getInitials(user) {
  if (!user) return 'U'
  const s = (user.full_name || user.username || 'U').replace(/\s+/g, '')
  return s.slice(0, 2).toUpperCase()
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(emptyStats)
  const [trend, setTrend] = useState([])
  const [fileTypes, setFileTypes] = useState([])
  const [status, setStatus] = useState(emptyStatus)
  const [componentStatus, setComponentStatus] = useState([])
  const [componentSummary, setComponentSummary] = useState({ total: 0, online: 0, offline: 0 })
  const [dorisStatus, setDorisStatus] = useState(null)
  const [activeAlerts, setActiveAlerts] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [refreshing, setRefreshing] = useState(false)
  const [user, setUser] = useState(null)

  const loadData = async () => {
    setRefreshing(true)
    try {
      const [s, t, f, st, c] = await Promise.all([
        api.getDashboardStats(),
        api.getTrend(7),
        api.getFileTypes(),
        api.getSystemStatus(),
        api.getPlatformComponentStatus(),
      ])
      setStats(s || emptyStats)
      setTrend(Array.isArray(t) ? t : [])
      setFileTypes(Array.isArray(f) ? f : [])
      setStatus(st || emptyStatus)
      const items = Array.isArray(c?.items) ? c.items : []
      setComponentStatus(items)
      setComponentSummary({
        total: Number(c?.summary?.total || 0),
        online: Number(c?.summary?.online || 0),
        offline: Number(c?.summary?.offline || 0),
      })
      setDorisStatus(items.find(i => i.id === 'doris') || null)

      // 取 Doris 集群最近告警（只取前 5 条未处理）
      try {
        const cl = await fetch('/api/doris/clusters', { credentials: 'include' }).then(r => r.json())
        if (cl?.clusters?.[0]?.id) {
          const ar = await fetch(`/api/doris/alerts/records?cluster_id=${cl.clusters[0].id}&limit=5`, { credentials: 'include' }).then(r => r.json())
          setActiveAlerts(ar?.records || [])
        }
      } catch { /* */ }
    } catch (e) {
      Message.error(getErrorMessage(e, '加载平台总览失败'))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
    try {
      const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session')
      if (raw) {
        const j = JSON.parse(raw)
        setUser(j?.user || null)
      }
    } catch { /* */ }
  }, [])

  // ── 派生数据 ────────────────────────────────────────────────────
  const fileSpark = trend.map(t => Number(t.file_count) || 0)
  const taskSpark = trend.map(t => Number(t.success_count) || 0)

  // 健康评分：基于在线率 + Doris 状态
  const healthScore = useMemo(() => {
    if (componentSummary.total === 0) return 0
    const onlineRatio = componentSummary.online / componentSummary.total
    return Math.round(onlineRatio * 100)
  }, [componentSummary])

  const headline = useMemo(() => {
    if (healthScore >= 90) return `${componentSummary.online} 个组件全部正常运行`
    if (componentSummary.offline > 0) return `${componentSummary.offline} 个组件离线，需要关注`
    return '平台运行中'
  }, [healthScore, componentSummary])

  const tip = useMemo(() => {
    const parts = []
    if (componentSummary.offline > 0) {
      const offlineNames = componentStatus.filter(c => !c.online).map(c => c.title).join('、')
      parts.push(`${offlineNames} 离线，建议优先排查`)
    }
    if (stats.week_tasks_total > 0 && stats.week_success_rate < 0.9) {
      parts.push(`近 7 天任务成功率 ${formatPercent(stats.week_success_rate)}，存在波动`)
    }
    if (parts.length === 0) {
      parts.push(`资产总量 ${formatNumber(stats.total_files)}，今日新增 ${formatNumber(stats.today_files)}`)
    }
    return parts.join('；')
  }, [componentSummary, componentStatus, stats])

  // FE/BE 节点（取自 Doris 状态卡 + cluster status）
  const [feNodes, setFeNodes] = useState([])
  const [beNodes, setBeNodes] = useState([])
  useEffect(() => {
    fetch('/api/doris/clusters', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d?.clusters?.[0]?.id) {
          return fetch(`/api/doris/clusters/${d.clusters[0].id}/status`, { credentials: 'include' }).then(r => r.json())
        }
      })
      .then(s => {
        if (!s) return
        setFeNodes((s.fe_nodes || []).map((n, i) => ({
          id: i, label: `FE-${i+1}`, status: n.alive ? 'ok' : 'dead', master: n.is_master,
        })))
        setBeNodes((s.be_nodes || []).map((n, i) => ({
          id: i, label: `BE-${i+1}`, status: n.alive ? 'ok' : 'dead',
        })))
      })
      .catch(() => {})
  }, [])

  // ── 渲染 ───────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      <HelloBar
        avatar={getInitials(user)}
        name={user?.full_name || user?.username || '管理员'}
        role={user?.is_admin ? '系统管理员 · 数据湖平台' : '平台用户'}
        greet={`${nowStr()}`}
        headline={`${greetByHour()}，${headline}`}
        tip={tip}
        ctaButtons={[
          { label: '查看告警', onClick: () => navigate('/mpp/alert') },
          { label: '立即巡检', primary: true, onClick: () => navigate('/mpp/inspection') },
        ]}
      />

      {/* ── KPI 大卡 ──────────────────────────────────────────── */}
      <div className="prd-stat-grid">
        <StatCard
          label="集群健康评分"
          value={healthScore}
          valueSuffix="/100"
          delta={componentSummary.online === componentSummary.total ? '全部在线' : `${componentSummary.offline} 个离线`}
          deltaDir={componentSummary.offline === 0 ? 'up' : 'dn'}
          icon="●"
          iconBg={healthScore >= 90 ? '#E5F6EC' : '#FBE7E7'}
          iconColor={healthScore >= 90 ? '#1B9E5C' : '#D63B3B'}
        />
        <StatCard
          label="在线组件"
          value={componentSummary.online}
          valueSuffix={`/${componentSummary.total}`}
          sub={dorisStatus?.online ? `Doris ${dorisStatus.latency_ms || 0}ms` : 'Doris 离线'}
          icon={<IconStorage />}
          iconBg="#EAF0FF"
          iconColor="#1F4FE0"
        />
        <StatCard
          label="资产总数"
          value={formatNumber(stats.total_files)}
          sub={`今日新增 ${formatNumber(stats.today_files)} · 近 7 天 ${formatNumber(stats.week_files)}`}
          sparkPoints={fileSpark.length ? fileSpark : [10, 14, 12, 18, 22, 25, 28]}
          sparkColor="#1F4FE0"
        />
        <StatCard
          label="近 7 天任务成功率"
          value={formatPercent(stats.week_success_rate)}
          sub={`${formatNumber(stats.week_tasks_success)} / ${formatNumber(stats.week_tasks_total)} 成功`}
          sparkPoints={taskSpark.length ? taskSpark : [3, 5, 4, 6, 7, 8, 6]}
          sparkColor="#1B9E5C"
        />
      </div>

      {/* ── 第二行：Doris 拓扑 + 告警 list ─────────────────────────── */}
      <div className="prd-row-2-1 prd-mt-12">
        <PrdCard
          title="Doris 集群拓扑"
          sub={feNodes.length + beNodes.length > 0 ? `FE ${feNodes.length} · BE ${beNodes.length}` : '未连接 Doris 集群'}
          extra={dorisStatus?.online
            ? <PrdTag kind="ok" led>在线</PrdTag>
            : <PrdTag kind="bad" led>离线</PrdTag>}
        >
          {feNodes.length === 0 && beNodes.length === 0 ? (
            <Empty description="暂无 Doris 节点数据，请前往「湖运维 → 集群管理」注册" />
          ) : (
            <ClusterTopology feNodes={feNodes} beNodes={beNodes} />
          )}
        </PrdCard>

        <PrdCard
          title="未处理告警"
          extra={activeAlerts.length > 0
            ? <PrdTag kind="bad" led>{activeAlerts.length} 条</PrdTag>
            : <PrdTag kind="ok" led>无告警</PrdTag>}
        >
          {activeAlerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--prd-ink-3)', fontSize: 13 }}>
              当前无未处理告警
            </div>
          ) : (
            activeAlerts.map((a) => (
              <AlertRow
                key={a.id}
                level={a.level === 'CRITICAL' ? 'crit' : a.level === 'WARNING' ? 'warn' : 'info'}
                title={a.name || '告警'}
                meta={`${a.metric || ''} · ${a.message || ''}`}
                action="处理"
                onAction={() => navigate('/mpp/alert')}
              />
            ))
          )}
        </PrdCard>
      </div>

      {/* ── 第三行：资源使用 + 平台服务 ───────────────────────────── */}
      <div className="prd-row-2 prd-mt-12">
        <PrdCard title="主机资源使用" sub="CPU · 内存">
          <div style={{ display: 'flex', gap: 30, justifyContent: 'space-around', alignItems: 'center', padding: '8px 0' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>CPU 使用率</Text>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{formatPercent((status.resources.cpu_percent || 0) / 100)}</div>
              <Progress percent={status.resources.cpu_percent || 0} showText={false} style={{ marginTop: 8 }}
                color={status.resources.cpu_percent > 80 ? '#D63B3B' : '#1F4FE0'} />
            </div>
            <div style={{ width: 1, height: 60, background: 'var(--prd-line-2)' }} />
            <div style={{ textAlign: 'center', flex: 1 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>内存使用率</Text>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{formatPercent((status.resources.memory_percent || 0) / 100)}</div>
              <Progress percent={status.resources.memory_percent || 0} showText={false} style={{ marginTop: 8 }}
                color={status.resources.memory_percent > 80 ? '#D63B3B' : '#1B9E5C'} />
              <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                {status.resources.memory_used_gb} / {status.resources.memory_total_gb} GB
              </Text>
            </div>
          </div>
        </PrdCard>

        <PrdCard title="平台服务" sub={`${componentSummary.online}/${componentSummary.total} 在线`}>
          {componentStatus.length === 0 ? (
            <Empty description="暂无组件数据" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {componentStatus.map(c => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: c.online ? 'var(--prd-ok-soft)' : 'var(--prd-bad-soft)',
                  borderRadius: 8,
                }}>
                  {c.online ? <IconCheckCircle style={{ color: '#1B9E5C' }} /> : <IconCloseCircle style={{ color: '#D63B3B' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--prd-ink)' }}>{c.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--prd-ink-3)' }}>
                      {c.online ? `${c.latency_ms || 0}ms` : '离线'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PrdCard>
      </div>

      {/* ── 趋势图（折叠到 Tab，避免页面太长） ─────────────────────── */}
      <div className="prd-mt-12">
        <Card bodyStyle={{ padding: 0 }}>
          <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
            <TabPane key="overview" title="近 7 天接入趋势" />
            <TabPane key="types" title="文件类型分布" />
          </Tabs>
          <div style={{ padding: 16 }}>
            {activeTab === 'overview' && (
              <ChartPanel
                option={{
                  tooltip: { trigger: 'axis' },
                  legend: { data: ['接入文件', '成功任务'] },
                  grid: { left: 24, right: 18, top: 30, bottom: 16, containLabel: true },
                  xAxis: { type: 'category', boundaryGap: false, data: trend.map(i => i.date) },
                  yAxis: { type: 'value' },
                  series: [
                    { name: '接入文件', type: 'line', smooth: true, data: trend.map(i => i.file_count),
                      areaStyle: { color: 'rgba(31, 79, 224, 0.14)' },
                      lineStyle: { color: '#1F4FE0', width: 2.4 },
                      itemStyle: { color: '#1F4FE0' } },
                    { name: '成功任务', type: 'line', smooth: true, data: trend.map(i => i.success_count),
                      lineStyle: { color: '#1B9E5C', width: 2.4 },
                      itemStyle: { color: '#1B9E5C' } },
                  ],
                }}
                height={280}
                empty={trend.length === 0}
                emptyText="暂无趋势数据"
              />
            )}
            {activeTab === 'types' && (
              <ChartPanel
                option={{
                  tooltip: { trigger: 'item' },
                  color: ['#1F4FE0', '#1B9E5C', '#00B7C2', '#7B1FA2', '#E68B00', '#6A7A94'],
                  legend: { bottom: 0 },
                  series: [{
                    type: 'pie', radius: ['42%', '68%'],
                    label: { formatter: '{b}: {d}%' },
                    data: fileTypes.map(i => ({ name: i.doc_type || '未知', value: i.count })),
                  }],
                }}
                height={280}
                empty={fileTypes.length === 0}
                emptyText="暂无文件类型统计"
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
