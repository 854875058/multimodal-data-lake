import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Message, Progress, Space, Typography } from '@arco-design/web-react'
import {
  IconCheckCircle,
  IconCloseCircle,
  IconCommand,
  IconExclamationCircle,
  IconNotification,
  IconRefresh,
  IconRobot,
  IconSafe,
  IconSearch,
  IconStorage,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import ChartPanel from '@/components/ChartPanel.jsx'
import {
  AlertRow,
  ClusterTopology,
  HelloBar,
  PrdCard,
  PrdTag,
  Sparkline,
  StatCard,
} from '@/components/PrdWidgets.jsx'
import { formatNumber, formatPercent } from '@/utils/format'

const { Title, Text } = Typography

const emptyStats = {
  total_files: 0,
  today_files: 0,
  week_files: 0,
  week_tasks_total: 0,
  week_tasks_success: 0,
  week_success_rate: 0,
  text_rows: 0,
  image_rows: 0,
}

const emptyStatus = {
  resources: { cpu_percent: 0, memory_percent: 0, memory_used_gb: 0, memory_total_gb: 0 },
  models: { loaded: false, models: [] },
  lancedb: { connected: false, files_count: 0 },
}

const roleModes = [
  { key: 'ops', label: '运维视角' },
  { key: 'dba', label: 'DBA 视角' },
  { key: 'ai', label: 'AI 工程' },
  { key: 'biz', label: '业务分析' },
  { key: 'arch', label: '架构总览' },
]

function getDisplayName(user) {
  return user?.full_name || user?.username || '平台用户'
}

function getInitials(user) {
  const text = getDisplayName(user).replace(/\s+/g, '')
  return text ? text.slice(0, 2).toUpperCase() : 'U'
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 6) return '凌晨好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function nowText() {
  const d = new Date()
  const pad = (v) => String(v).padStart(2, '0')
  const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${weeks[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function mapModeFromUser(user) {
  if (user?.is_admin) return 'ops'
  return 'biz'
}

function buildBizQuickQuestions() {
  return [
    '上个月 Critical 告警最多的设备 Top 10',
    '近 7 天图片质量评分低于 0.5 的巡检设备分布',
    '找出告警等级为 Critical 且图片场景相似的历史记录',
  ]
}

function buildRecentActions(stats, componentSummary) {
  return [
    {
      title: '接入工作台批量入湖',
      meta: `近 7 天任务 ${formatNumber(stats.week_tasks_total)} 次，成功 ${formatPercent(stats.week_success_rate || 0)}`,
      tag: componentSummary.offline ? '需关注' : '稳定',
      kind: componentSummary.offline ? 'warn' : 'ok',
    },
    {
      title: '平台组件状态',
      meta: `${componentSummary.online}/${componentSummary.total} 在线，异常组件会在湖运维页显示`,
      tag: componentSummary.offline ? `${componentSummary.offline} 异常` : '正常',
      kind: componentSummary.offline ? 'bad' : 'ok',
    },
    {
      title: 'Lance / 向量资产',
      meta: `文本 ${formatNumber(stats.text_rows)} 行，图像 ${formatNumber(stats.image_rows)} 行`,
      tag: '可检索',
      kind: 'info',
    },
  ]
}

function deriveSlowQueries(history) {
  return (history || [])
    .filter((item) => Number(item.elapsed || 0) >= 1.5 || !item.success)
    .sort((a, b) => Number(b.elapsed || 0) - Number(a.elapsed || 0))
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
  const [sqlHistory, setSqlHistory] = useState([])
  const [inspectionHistory, setInspectionHistory] = useState([])
  const [feNodes, setFeNodes] = useState([])
  const [beNodes, setBeNodes] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [user, setUser] = useState(null)
  const [roleMode, setRoleMode] = useState('ops')

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
      setDorisStatus(items.find((item) => item.id === 'doris') || null)

      try {
        const clusters = await fetch('/api/doris/clusters', { credentials: 'include' }).then((r) => r.json())
        const clusterId = clusters?.clusters?.[0]?.id
        if (clusterId) {
          const [alerts, clusterStatus, history, inspections] = await Promise.all([
            fetch(`/api/doris/alerts/records?cluster_id=${clusterId}&limit=5`, { credentials: 'include' }).then((r) => r.json()),
            fetch(`/api/doris/clusters/${clusterId}/status`, { credentials: 'include' }).then((r) => r.json()),
            fetch(`/api/doris/sql/history?cluster_id=${clusterId}&limit=30`, { credentials: 'include' }).then((r) => r.json()),
            fetch(`/api/doris/inspection/history?cluster_id=${clusterId}&limit=12`, { credentials: 'include' }).then((r) => r.json()),
          ])

          setActiveAlerts(alerts?.records || [])
          setSqlHistory(history?.history || [])
          setInspectionHistory(inspections?.history || [])
          setFeNodes(
            (clusterStatus?.fe_nodes || []).map((node, index) => ({
              id: index,
              label: `FE-${index + 1}`,
              status: node.alive ? 'ok' : 'dead',
              master: Boolean(node.is_master),
            })),
          )
          setBeNodes(
            (clusterStatus?.be_nodes || []).map((node, index) => ({
              id: index,
              label: `BE-${index + 1}`,
              status: node.alive ? 'ok' : 'dead',
            })),
          )
        } else {
          setActiveAlerts([])
          setSqlHistory([])
          setInspectionHistory([])
          setFeNodes([])
          setBeNodes([])
        }
      } catch {
        setActiveAlerts([])
        setSqlHistory([])
        setInspectionHistory([])
        setFeNodes([])
        setBeNodes([])
      }
    } catch (error) {
      Message.error(getErrorMessage(error, '加载平台总览失败'))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
    try {
      const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session')
      if (raw) {
        const parsed = JSON.parse(raw)
        const nextUser = parsed?.user || null
        setUser(nextUser)
        setRoleMode(mapModeFromUser(nextUser))
      }
    } catch {
      setUser(null)
    }
  }, [])

  const fileSpark = useMemo(() => trend.map((item) => Number(item.file_count) || 0), [trend])
  const taskSpark = useMemo(() => trend.map((item) => Number(item.success_count) || 0), [trend])

  const healthScore = useMemo(() => {
    if (!componentSummary.total) return 0
    return Math.round((componentSummary.online / componentSummary.total) * 100)
  }, [componentSummary])

  const latestInspection = useMemo(() => inspectionHistory.find((item) => item.status === 'SUCCESS') || inspectionHistory[0] || null, [inspectionHistory])
  const slowQueries = useMemo(() => deriveSlowQueries(sqlHistory), [sqlHistory])

  const helloHeadline = useMemo(() => {
    if (roleMode === 'dba') return `${getGreeting()}，最近 7 天慢 SQL ${formatNumber(slowQueries.length)} 条`
    if (roleMode === 'ai') return `${getGreeting()}，当前向量资产 ${formatNumber(stats.text_rows + stats.image_rows)} 条`
    if (roleMode === 'biz') return `${getGreeting()}，AI 数据副驾驶已就绪`
    if (roleMode === 'arch') return `${getGreeting()}，平台综合健康分 ${healthScore}`
    return `${getGreeting()}，${componentSummary.online}/${componentSummary.total || 0} 个组件在线`
  }, [componentSummary, healthScore, roleMode, slowQueries.length, stats.image_rows, stats.text_rows])

  const helloTip = useMemo(() => {
    if (roleMode === 'dba') {
      if (slowQueries[0]) return `最慢查询耗时 ${slowQueries[0].elapsed}s，建议优先进入慢 SQL 分析查看执行计划与优化建议。`
      return '当前没有明显慢 SQL，适合继续查看最近的执行历史和数据分布。'
    }
    if (roleMode === 'ai') {
      return `本周新增入湖文件 ${formatNumber(stats.week_files)} 个，文本 ${formatNumber(stats.text_rows)} / 图像 ${formatNumber(stats.image_rows)} 向量资产可直接用于检索与训练。`
    }
    if (roleMode === 'biz') {
      return '用自然语言提问即可直接触达 SQL、向量检索和多模态结果，推理步骤会完整展示，适合汇报演示。'
    }
    if (roleMode === 'arch') {
      return `当前累计资产 ${formatNumber(stats.total_files)} 项，最近 7 天任务成功率 ${formatPercent(stats.week_success_rate || 0)}，可继续查看各模块容量与活跃度。`
    }
    if (componentSummary.offline > 0) {
      return `${componentSummary.offline} 个组件离线，建议先进入湖运维检查告警、集群状态和自动巡检结果。`
    }
    return `平台运行平稳，今日新增 ${formatNumber(stats.today_files)} 个资产，最近巡检评分 ${latestInspection?.score ?? '暂无'}。`
  }, [componentSummary.offline, latestInspection?.score, roleMode, slowQueries, stats.image_rows, stats.text_rows, stats.today_files, stats.total_files, stats.week_files, stats.week_success_rate])

  const recentActions = useMemo(() => buildRecentActions(stats, componentSummary), [componentSummary, stats])

  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['接入文件', '成功任务'] },
    grid: { left: 24, right: 18, top: 30, bottom: 18, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: trend.map((item) => item.date) },
    yAxis: { type: 'value' },
    series: [
      {
        name: '接入文件',
        type: 'line',
        smooth: true,
        data: trend.map((item) => Number(item.file_count) || 0),
        areaStyle: { color: 'rgba(31, 79, 224, 0.12)' },
        lineStyle: { color: '#1F4FE0', width: 2.4 },
        itemStyle: { color: '#1F4FE0' },
      },
      {
        name: '成功任务',
        type: 'line',
        smooth: true,
        data: trend.map((item) => Number(item.success_count) || 0),
        lineStyle: { color: '#1B9E5C', width: 2.4 },
        itemStyle: { color: '#1B9E5C' },
      },
    ],
  }), [trend])

  const fileTypeOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    color: ['#1F4FE0', '#1B9E5C', '#00B7C2', '#7B1FA2', '#E68B00', '#6A7A94'],
    series: [
      {
        type: 'pie',
        radius: ['44%', '70%'],
        label: { formatter: '{b}: {d}%' },
        data: fileTypes.map((item) => ({ name: item.doc_type || '未知', value: item.count })),
      },
    ],
  }), [fileTypes])

  const renderOps = () => (
    <>
      <div className="prd-kpi-grid">
        <StatCard
          label="集群健康评分"
          value={healthScore}
          valueSuffix="/100"
          delta={componentSummary.offline ? `${componentSummary.offline} 个离线组件` : '全部在线'}
          deltaDir={componentSummary.offline ? 'dn' : 'up'}
          icon={<IconSafe />}
          iconBg={healthScore >= 90 ? '#E5F6EC' : '#FBE7E7'}
          iconColor={healthScore >= 90 ? '#1B9E5C' : '#D63B3B'}
        />
        <StatCard
          label="平台服务在线"
          value={componentSummary.online}
          valueSuffix={`/ ${componentSummary.total || 0}`}
          sub={dorisStatus?.online ? `Doris ${dorisStatus.latency_ms || 0}ms` : 'Doris 未连接'}
          icon={<IconStorage />}
          iconBg="#EAF0FF"
          iconColor="#1F4FE0"
        />
        <StatCard
          label="当日活跃告警"
          value={formatNumber(activeAlerts.length)}
          sub={activeAlerts.length ? '按严重度排序展示最近 5 条' : '当前没有活跃告警'}
          icon={<IconNotification />}
          iconBg={activeAlerts.length ? '#FBE7E7' : '#E5F6EC'}
          iconColor={activeAlerts.length ? '#D63B3B' : '#1B9E5C'}
        />
        <StatCard
          label="接入增长趋势"
          value={formatNumber(stats.week_files)}
          sub={`今日新增 ${formatNumber(stats.today_files)}，累计 ${formatNumber(stats.total_files)}`}
          sparkPoints={fileSpark.length ? fileSpark : [12, 14, 13, 18, 22, 26, 24]}
          sparkColor="#1F4FE0"
        />
      </div>

      <div className="prd-row-2-1">
        <PrdCard
          title="Doris 集群拓扑"
          sub={feNodes.length || beNodes.length ? `FE ${feNodes.length} / BE ${beNodes.length}` : '尚未接入集群状态'}
          extra={dorisStatus?.online ? <PrdTag kind="ok" led>在线</PrdTag> : <PrdTag kind="bad" led>离线</PrdTag>}
        >
          {feNodes.length || beNodes.length ? (
            <ClusterTopology feNodes={feNodes} beNodes={beNodes} />
          ) : (
            <Empty description="请先到湖运维中完成 Doris 集群注册和状态拉取" />
          )}
        </PrdCard>
        <PrdCard
          title="未处理告警"
          sub="优先展示运维值班需要立即响应的问题"
          extra={activeAlerts.length ? <PrdTag kind="bad" led>{activeAlerts.length} 条</PrdTag> : <PrdTag kind="ok" led>无告警</PrdTag>}
        >
          {activeAlerts.length ? (
            activeAlerts.map((item) => (
              <AlertRow
                key={item.id}
                level={item.level === 'CRITICAL' ? 'crit' : item.level === 'WARNING' ? 'warn' : 'info'}
                title={item.name || '告警'}
                meta={`${item.metric || '指标'} · ${item.message || '待处理'}`}
                action="查看"
                onAction={() => navigate('/mpp/alert')}
              />
            ))
          ) : (
            <Empty description="当前没有待处理告警" />
          )}
        </PrdCard>
      </div>

      <div className="prd-row-2">
        <PrdCard title="主机资源使用" sub="CPU / 内存实时占用">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>CPU 使用率</Text>
              <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800 }}>{formatPercent((status.resources.cpu_percent || 0) / 100)}</div>
              <Progress percent={status.resources.cpu_percent || 0} showText={false} style={{ marginTop: 10 }} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>内存使用率</Text>
              <div style={{ marginTop: 6, fontSize: 26, fontWeight: 800 }}>{formatPercent((status.resources.memory_percent || 0) / 100)}</div>
              <Progress percent={status.resources.memory_percent || 0} showText={false} style={{ marginTop: 10 }} color="#1B9E5C" />
              <Text type="secondary" style={{ fontSize: 11, marginTop: 6, display: 'block' }}>
                {status.resources.memory_used_gb} / {status.resources.memory_total_gb} GB
              </Text>
            </div>
          </div>
        </PrdCard>
        <PrdCard title="运维动作摘要" sub="最近值得汇报和跟进的运维事项">
          {recentActions.map((item) => (
            <div key={item.title} className="prd-action-item">
              <div className="body">
                <div className="ttl">{item.title}</div>
                <div className="meta">{item.meta}</div>
              </div>
              <PrdTag kind={item.kind}>{item.tag}</PrdTag>
            </div>
          ))}
        </PrdCard>
      </div>
    </>
  )

  const renderDba = () => (
    <>
      <div className="prd-kpi-grid">
        <StatCard
          label="慢 SQL 数量"
          value={formatNumber(slowQueries.length)}
          sub="按执行历史中耗时 >= 1.5s 或失败查询统计"
          icon={<IconExclamationCircle />}
          iconBg="#FFF4E0"
          iconColor="#E68B00"
        />
        <StatCard
          label="最慢查询耗时"
          value={slowQueries[0] ? `${slowQueries[0].elapsed}s` : '0s'}
          sub={slowQueries[0]?.sql ? slowQueries[0].sql.slice(0, 36) : '暂无慢 SQL'}
          icon={<IconCommand />}
          iconBg="#FBE7E7"
          iconColor="#D63B3B"
        />
        <StatCard
          label="失败查询"
          value={formatNumber(sqlHistory.filter((item) => !item.success).length)}
          sub="适合优先排查权限、语法和资源问题"
          icon={<IconCloseCircle />}
          iconBg="#FBE7E7"
          iconColor="#D63B3B"
        />
        <StatCard
          label="本周任务成功率"
          value={formatPercent(stats.week_success_rate || 0)}
          sub={`${formatNumber(stats.week_tasks_success)} / ${formatNumber(stats.week_tasks_total)} 成功`}
          sparkPoints={taskSpark.length ? taskSpark : [2, 3, 4, 6, 5, 7, 6]}
          sparkColor="#1B9E5C"
        />
      </div>

      <div className="prd-row-2">
        <PrdCard title="慢 SQL 趋势" sub="当前页保留 DBA 的整体态势视角">
          <ChartPanel option={trendOption} height={280} empty={trend.length === 0} emptyText="暂无趋势数据" />
        </PrdCard>
        <PrdCard title="近期慢 SQL 关注列表" sub="继续钻取可进入慢 SQL 分析页">
          {slowQueries.length ? (
            slowQueries.slice(0, 5).map((item) => (
              <AlertRow
                key={item.id}
                level={!item.success ? 'crit' : Number(item.elapsed || 0) > 3 ? 'warn' : 'info'}
                title={item.sql || 'SQL 记录'}
                meta={`${item.created_at || '--'} · 耗时 ${item.elapsed || 0}s · ${item.success ? '执行成功' : item.error || '执行失败'}`}
                action="分析"
                onAction={() => navigate('/mpp/sql')}
              />
            ))
          ) : (
            <Empty description="暂无需要重点关注的慢 SQL" />
          )}
        </PrdCard>
      </div>
    </>
  )

  const renderAi = () => (
    <>
      <div className="prd-kpi-grid">
        <StatCard
          label="数据集原始资产"
          value={formatNumber(stats.total_files)}
          sub={`文本 ${formatNumber(stats.text_rows)} / 图像 ${formatNumber(stats.image_rows)}`}
          icon={<IconStorage />}
          iconBg="#FFF4E0"
          iconColor="#E68B00"
        />
        <StatCard
          label="向量资产"
          value={formatNumber(stats.text_rows + stats.image_rows)}
          sub="适用于语义检索、混合检索和副驾驶"
          icon={<IconSearch />}
          iconBg="#EAF0FF"
          iconColor="#1F4FE0"
        />
        <StatCard
          label="Ray 计算任务"
          value={formatNumber(stats.week_tasks_total)}
          sub={`近 7 天成功 ${formatNumber(stats.week_tasks_success)} 次`}
          icon={<IconRobot />}
          iconBg="#F5E8FA"
          iconColor="#7B1FA2"
        />
        <StatCard
          label="本周入湖增长"
          value={formatNumber(stats.week_files)}
          sub="适合作为训练和检索数据源增量"
          sparkPoints={fileSpark.length ? fileSpark : [20, 22, 28, 25, 32, 38, 41]}
          sparkColor="#00897B"
        />
      </div>

      <div className="prd-row-2-1">
        <PrdCard title="训练与检索生产线摘要" sub="围绕数据集、向量化和计算编排展示当前平台状态">
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">接入与批量入湖</div>
              <div className="meta">接入工作台、本地上传和任务治理已经打通基础链路，适合继续收口成统一数据集视角。</div>
            </div>
            <PrdTag kind="info">进行中</PrdTag>
          </div>
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">多模态检索</div>
              <div className="meta">LakeQuery 已具备向量、多模态、混合检索入口，下一步接入 Tower-Eye 的真实检索策略与结果解释。</div>
            </div>
            <PrdTag kind="warn">待增强</PrdTag>
          </div>
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">AI 数据副驾驶</div>
              <div className="meta">副驾驶将承接自然语言问数、多模态结果解释和任务建议，是后续 P0 差异化重点。</div>
            </div>
            <PrdTag kind="purple">P0</PrdTag>
          </div>
        </PrdCard>
        <PrdCard title="快速入口" sub="进入当前最关键的 AI 工程操作面">
          <AlertRow title="数据集与资产目录" meta="继续往数据集管理和版本管理演进" action="打开" onAction={() => navigate('/files')} />
          <AlertRow title="Lake Query 多模态入口" meta="承接文搜图、图搜图、混合检索和 NL2SQL" action="打开" onAction={() => navigate('/lake-query/vector')} />
          <AlertRow title="Ray Job 计算编排" meta="查看计算任务状态与运行摘要" action="打开" onAction={() => navigate('/ray/jobs')} />
        </PrdCard>
      </div>
    </>
  )

  const renderBiz = () => (
    <>
      <div className="prd-spotlight">
        <h3>AI 数据副驾驶</h3>
        <p>这里应该成为业务分析师的默认入口。用自然语言提问，系统自动完成意图理解、SQL 生成、检索调用、结果汇总和可视化展示。</p>
        <div className="prd-chip-list">
          {buildBizQuickQuestions().map((item) => (
            <span key={item} className="prd-chip">{item}</span>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="prd-btn-light primary" onClick={() => navigate('/lake-query/copilot')}>打开副驾驶</button>
        </div>
      </div>

      <div className="prd-row-2">
        <PrdCard title="最近的业务查询入口" sub="强调自然语言、结构化查询和多模态联动">
          <AlertRow title="AI 数据副驾驶" meta="多轮对话、透明推理步骤、结果自动可视化" action="进入" onAction={() => navigate('/lake-query/copilot')} />
          <AlertRow title="多模态检索工作台" meta="通过文字或图片找相关历史资产，并附带结构化过滤" action="进入" onAction={() => navigate('/lake-query/multimodal')} />
          <AlertRow title="SQL 查询与 NL2SQL" meta="适合需要验证 SQL 的分析师和数据人员" action="进入" onAction={() => navigate('/lake-query/sql')} />
        </PrdCard>
        <PrdCard title="业务可理解指标" sub="让汇报场景先讲价值，再讲技术">
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">累计可查询资产</div>
              <div className="meta">当前已纳管 {formatNumber(stats.total_files)} 个资产，可用于检索、问数和训练。</div>
            </div>
            <PrdTag kind="ok">可用</PrdTag>
          </div>
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">平台稳定性</div>
              <div className="meta">当前健康分 {healthScore}，可支撑业务演示和后续扩展接入。</div>
            </div>
            <PrdTag kind={healthScore >= 90 ? 'ok' : 'warn'}>{healthScore >= 90 ? '稳定' : '关注'}</PrdTag>
          </div>
        </PrdCard>
      </div>
    </>
  )

  const renderArch = () => (
    <>
      <div className="prd-kpi-grid">
        <StatCard label="数据资产总量" value={formatNumber(stats.total_files)} sub="跨文件、向量、任务和组件的统一视图" />
        <StatCard label="向量数据规模" value={formatNumber(stats.text_rows + stats.image_rows)} sub="支撑 AI 检索与副驾驶的底层索引资产" />
        <StatCard label="平台组件在线率" value={componentSummary.total ? `${healthScore}%` : '0%'} sub={`${componentSummary.online}/${componentSummary.total || 0} 在线`} />
        <StatCard label="本周任务成功率" value={formatPercent(stats.week_success_rate || 0)} sub="用于评估接入、编排、治理链路稳定性" />
      </div>

      <div className="prd-row-2">
        <PrdCard title="平台模块活跃度" sub="面向架构汇报的统一视图">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
            {[
              { title: '湖总览', value: healthScore, color: '#1F4FE0' },
              { title: '湖存储', value: Math.min(100, stats.total_files / 10), color: '#F57C00' },
              { title: '湖计算', value: Math.min(100, stats.week_tasks_total * 8), color: '#7B1FA2' },
              { title: '湖查询', value: Math.min(100, (stats.text_rows + stats.image_rows) / 20), color: '#00897B' },
              { title: '湖运维', value: componentSummary.online ? Math.round((componentSummary.online / Math.max(1, componentSummary.total)) * 100) : 0, color: '#00B7C2' },
            ].map((item) => (
              <div key={item.title} style={{ textAlign: 'center' }}>
                <div style={{ height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{ width: 42, height: `${Math.max(12, item.value)}%`, borderRadius: '10px 10px 0 0', background: item.color }} />
                </div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(item.value)}</div>
              </div>
            ))}
          </div>
        </PrdCard>
        <PrdCard title="下一步平台建设重点" sub="直接对应 backlog 的前三项和后续核心能力">
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">首页看板角色化</div>
              <div className="meta">已开始重做，目标是让不同角色在第一屏看到不同的核心价值。</div>
            </div>
            <PrdTag kind="purple">BL-001</PrdTag>
          </div>
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">慢 SQL 与巡检报告</div>
              <div className="meta">这两页将形成 DBA 和运维汇报的主战场，直接提升产品专业感。</div>
            </div>
            <PrdTag kind="warn">BL-002 / BL-003</PrdTag>
          </div>
          <div className="prd-action-item">
            <div className="body">
              <div className="ttl">数据集、版本与 AI 服务</div>
              <div className="meta">后续会接着补数据集管理、版本管理、副驾驶和多模态检索。</div>
            </div>
            <PrdTag kind="info">P0 队列</PrdTag>
          </div>
        </PrdCard>
      </div>
    </>
  )

  return (
    <div className="prd-page" style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>首页看板</Title>
          <Text type="secondary">按角色切换首页内容，优先展示适合汇报和决策的控制面信息，而不是统一的大杂烩。</Text>
        </div>
        <Space>
          <button className="prd-btn-light" onClick={loadData} disabled={refreshing}>
            <IconRefresh style={{ marginRight: 6 }} />
            {refreshing ? '刷新中...' : '刷新状态'}
          </button>
        </Space>
      </div>

      <div className="prd-role-switch">
        {roleModes.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`prd-role-chip ${roleMode === item.key ? 'is-active' : ''}`}
            onClick={() => setRoleMode(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <HelloBar
        avatar={getInitials(user)}
        name={getDisplayName(user)}
        role={roleMode === 'ops' ? '运维工程师' : roleMode === 'dba' ? 'DBA / 数据工程师' : roleMode === 'ai' ? 'AI 算法工程师' : roleMode === 'biz' ? '业务分析师' : '平台架构师'}
        greet={nowText()}
        headline={helloHeadline}
        tip={helloTip}
        ctaButtons={
          roleMode === 'biz'
            ? [{ label: '打开副驾驶', primary: true, onClick: () => navigate('/lake-query/copilot') }]
            : [
                { label: '查看湖运维', onClick: () => navigate('/mpp/cluster') },
                { label: roleMode === 'dba' ? '慢 SQL 分析' : '立即巡检', primary: true, onClick: () => navigate(roleMode === 'dba' ? '/mpp/sql' : '/mpp/inspection') },
              ]
        }
      />

      {roleMode === 'ops' && renderOps()}
      {roleMode === 'dba' && renderDba()}
      {roleMode === 'ai' && renderAi()}
      {roleMode === 'biz' && renderBiz()}
      {roleMode === 'arch' && renderArch()}

      <div className="prd-row-2">
        <PrdCard title="7 天接入与任务趋势" sub="适合作为首页底部公共趋势区">
          <ChartPanel option={trendOption} height={280} empty={trend.length === 0} emptyText="暂无趋势数据" />
        </PrdCard>
        <PrdCard title="文件类型分布" sub="用于辅助理解当前平台的资产结构">
          <ChartPanel option={fileTypeOption} height={280} empty={fileTypes.length === 0} emptyText="暂无文件类型统计" />
        </PrdCard>
      </div>
    </div>
  )
}
