import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  Grid,
  Message,
  Progress,
  Space,
  Tag,
  Typography,
} from '@arco-design/web-react'
import {
  IconApps,
  IconCommand,
  IconDashboard,
  IconFile,
  IconNotification,
  IconRefresh,
  IconRobot,
  IconSafe,
  IconSearch,
  IconStorage,
  IconUp,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { dorisGet } from '@/api/doris'
import ChartPanel from '@/components/ChartPanel.jsx'
import { formatNumber, formatPercent } from '@/utils/format'

const { Row, Col } = Grid
const { Title, Text } = Typography

const emptyStats = {
  total_files: 0, today_files: 0, week_files: 0,
  week_tasks_total: 0, week_tasks_success: 0, week_success_rate: 0,
  text_rows: 0, image_rows: 0,
}

const emptyStatus = {
  resources: { cpu_percent: 0, memory_percent: 0, memory_used_gb: 0, memory_total_gb: 0 },
}

/* ── 工具函数 ──────────────────────────────────────────────────────── */
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

/* ── 迷你折线图 ────────────────────────────────────────────────────── */
function MiniSparkline({ points, color = '#165DFF' }) {
  if (!points || points.length < 2) return null
  const w = 120, h = 28
  const max = Math.max(...points), min = Math.min(...points)
  const r = max - min || 1
  const step = w / (points.length - 1)
  const pts = points.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / r) * (h - 4) - 2).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 28 }}>
      <defs>
        <linearGradient id={`sp-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M ${pts} L ${w},${h} L 0,${h} Z`} fill={`url(#sp-${color.replace('#', '')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── KPI 卡片（带彩色左边框） ─────────────────────────────────────── */
function KpiCard({ accentColor, icon, iconBg, iconColor, label, value, suffix, sub, sparkPoints, sparkColor }) {
  return (
    <Card
      style={{ height: '100%', borderLeft: `3px solid ${accentColor || '#165DFF'}`, borderRadius: 8 }}
      bodyStyle={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>{label}</Text>
        {icon && (
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: iconBg || '#E8F3FF', color: iconColor || '#165DFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>{icon}</div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#1d2129', lineHeight: 1.2, fontFeatureSettings: '"tnum"' }}>
        {value}
        {suffix && <span style={{ fontSize: 13, color: '#86909c', fontWeight: 500, marginLeft: 4 }}>{suffix}</span>}
      </div>
      {sub && <Text type="secondary" style={{ fontSize: 12 }}>{sub}</Text>}
      {sparkPoints && sparkPoints.length > 1 && <MiniSparkline points={sparkPoints} color={sparkColor || accentColor || '#165DFF'} />}
    </Card>
  )
}

/* ── 快速入口卡片 ──────────────────────────────────────────────────── */
function QuickLinkCard({ icon, iconBg, iconColor, title, desc, onClick }) {
  return (
    <Card
      hoverable
      style={{ cursor: 'pointer', height: '100%' }}
      bodyStyle={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}
      onClick={onClick}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: iconBg || '#E8F3FF', color: iconColor || '#165DFF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>{icon}</div>
      <Text style={{ fontWeight: 600, fontSize: 14 }}>{title}</Text>
      <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>{desc}</Text>
    </Card>
  )
}

/* ── 链接行 ────────────────────────────────────────────────────────── */
function LinkItem({ title, meta, action, onClick }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border-1)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: 500 }}>{title}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>{meta}</Text>
      </div>
      <Button type="text" size="small" onClick={onClick}>{action} →</Button>
    </div>
  )
}

/* ── 状态行 ────────────────────────────────────────────────────────── */
function StatusItem({ title, meta, tag, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-border-1)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontWeight: 500 }}>{title}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>{meta}</Text>
      </div>
      <Tag color={color} size="small" style={{ marginLeft: 12, flexShrink: 0 }}>{tag}</Tag>
    </div>
  )
}

/* ── 资源进度条 ────────────────────────────────────────────────────── */
function ResourceBar({ label, percent, used, total, color }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>{label}</Text>
        <Text style={{ fontSize: 20, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{formatPercent(percent / 100)}</Text>
      </div>
      <Progress percent={percent} showText={false} color={color} />
      {used != null && total != null && (
        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>{used} / {total} GB</Text>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(emptyStats)
  const [trend, setTrend] = useState([])
  const [fileTypes, setFileTypes] = useState([])
  const [status, setStatus] = useState(emptyStatus)
  const [componentSummary, setComponentSummary] = useState({ total: 0, online: 0, offline: 0 })
  const [dorisStatus, setDorisStatus] = useState(null)
  const [activeAlerts, setActiveAlerts] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [user, setUser] = useState(null)
  const [knowledgeGraph, setKnowledgeGraph] = useState(null)

  const loadData = async () => {
    setRefreshing(true)
    try {
      const [s, t, f, st, c] = await Promise.all([
        api.getDashboardStats(), api.getTrend(7), api.getFileTypes(),
        api.getSystemStatus(), api.getPlatformComponentStatus(),
      ])
      setStats(s || emptyStats)
      setTrend(Array.isArray(t) ? t : [])
      setFileTypes(Array.isArray(f) ? f : [])
      setStatus(st || emptyStatus)
      const items = Array.isArray(c?.items) ? c.items : []
      setComponentSummary({
        total: Number(c?.summary?.total || 0),
        online: Number(c?.summary?.online || 0),
        offline: Number(c?.summary?.offline || 0),
      })
      setDorisStatus(items.find((item) => item.id === 'doris') || null)
      try {
        const clusters = await dorisGet('/clusters')
        const clusterId = clusters?.clusters?.[0]?.id
        if (clusterId) {
          const alerts = await dorisGet('/alerts/records', { cluster_id: clusterId, limit: 5 })
          setActiveAlerts(alerts?.records || [])
        } else { setActiveAlerts([]) }
      } catch { setActiveAlerts([]) }
      try {
        const kg = await api.getKnowledgeGraph()
        setKnowledgeGraph(kg || null)
      } catch { setKnowledgeGraph(null) }
    } catch (error) {
      Message.error(getErrorMessage(error, '加载平台总览失败'))
    } finally { setRefreshing(false); setLoaded(true) }
  }

  useEffect(() => {
    loadData()
    try {
      const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session')
      if (raw) { const parsed = JSON.parse(raw); setUser(parsed?.user || null) }
    } catch { setUser(null) }
  }, [])

  const fileSpark = useMemo(() => trend.map((item) => Number(item.file_count) || 0), [trend])
  const taskSpark = useMemo(() => trend.map((item) => Number(item.success_count) || 0), [trend])
  const healthScore = useMemo(() => {
    if (!componentSummary.total) return 0
    return Math.round((componentSummary.online / componentSummary.total) * 100)
  }, [componentSummary])

  const helloTip = useMemo(() => {
    if (componentSummary.offline > 0) return `${componentSummary.offline} 个组件离线，建议进入湖运维检查告警和集群状态。`
    return `平台运行平稳，今日新增 ${formatNumber(stats.today_files)} 个资产，本周任务成功率 ${formatPercent(stats.week_success_rate || 0)}。`
  }, [componentSummary.offline, stats.today_files, stats.week_success_rate])

  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['接入文件', '成功任务'], bottom: 0 },
    grid: { left: 24, right: 18, top: 30, bottom: 36, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: trend.map((item) => item.date) },
    yAxis: { type: 'value' },
    series: [
      { name: '接入文件', type: 'line', smooth: true, data: trend.map((item) => Number(item.file_count) || 0), areaStyle: { color: 'rgba(22,93,255,0.08)' }, lineStyle: { color: '#165DFF', width: 2 }, itemStyle: { color: '#165DFF' } },
      { name: '成功任务', type: 'line', smooth: true, data: trend.map((item) => Number(item.success_count) || 0), lineStyle: { color: '#00B42A', width: 2 }, itemStyle: { color: '#00B42A' } },
    ],
  }), [trend])

  const fileTypeOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    color: ['#165DFF', '#00B42A', '#0FC6C2', '#722ED1', '#FF7D00', '#86909C'],
    series: [{ type: 'pie', radius: ['44%', '70%'], label: { formatter: '{b}: {d}%' }, data: fileTypes.map((item) => ({ name: item.doc_type || '未知', value: item.count })) }],
  }), [fileTypes])

  return (
    <div style={{ padding: 20, background: 'var(--color-fill-1)', minHeight: '100%' }}>

      {/* ── 欢迎栏 ─────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }} bodyStyle={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: '#E8F3FF', color: '#165DFF',
            display: 'grid', placeItems: 'center',
            fontSize: 20, fontWeight: 700, flexShrink: 0,
          }}>
            {getInitials(user)}
          </div>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{nowText()}</Text>
            <Title heading={5} style={{ margin: '4px 0 0' }}>
              {getGreeting()}，{getDisplayName(user)}
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>{helloTip}</Text>
          </div>
          <Space>
            <Button icon={<IconRefresh />} loading={refreshing} onClick={loadData}>刷新</Button>
            <Button type="primary" onClick={() => navigate('/mpp/cluster')}>查看湖运维</Button>
          </Space>
        </div>
      </Card>

      {/* ── 新手引导 ──────────────────────────────────────────────────── */}
      {loaded && stats.total_files === 0 && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '20px 24px' }}>
          <Title heading={6} style={{ margin: '0 0 4px' }}>欢迎使用多模态数据湖仓</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>平台尚未接入任何数据，按以下步骤快速开始：</Text>
          <Row gutter={24}>
            <Col span={8}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E8F3FF', color: '#165DFF', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700 }}>1</div>
                <Text style={{ fontWeight: 600 }}>上传第一个文件</Text>
                <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>支持文档、图片、音视频等多种格式</Text>
                <Button type="primary" size="small" onClick={() => navigate('/ingestion/upload')}>去上传</Button>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F5E8FF', color: '#722ED1', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700 }}>2</div>
                <Text style={{ fontWeight: 600 }}>配置数据来源</Text>
                <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>接入数据库、API 或文件系统等数据源</Text>
                <Button type="outline" size="small" onClick={() => navigate('/settings/access')}>去配置</Button>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#E8F8EA', color: '#00B42A', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700 }}>3</div>
                <Text style={{ fontWeight: 600 }}>开始查询分析</Text>
                <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>使用 SQL 或自然语言探索您的数据</Text>
                <Button type="outline" size="small" onClick={() => navigate('/lake-query/sql')}>去查询</Button>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* ── KPI 卡片 ────────────────────────────────────────────────── */}
      <Row gutter={16}>
        <Col span={6}>
          <KpiCard
            accentColor={healthScore >= 90 ? '#00B42A' : '#F53F3F'}
            icon={<IconSafe />}
            iconBg={healthScore >= 90 ? '#E8F8EA' : '#FFECE8'}
            iconColor={healthScore >= 90 ? '#00B42A' : '#F53F3F'}
            label="集群健康评分"
            value={healthScore}
            suffix="/100"
            sub={componentSummary.offline ? `${componentSummary.offline} 个离线组件` : '全部在线'}
          />
        </Col>
        <Col span={6}>
          <KpiCard
            accentColor="#165DFF"
            icon={<IconStorage />}
            iconBg="#E8F3FF"
            iconColor="#165DFF"
            label="平台服务在线"
            value={componentSummary.online}
            suffix={`/ ${componentSummary.total || 0}`}
            sub={dorisStatus?.online ? `Doris ${dorisStatus.latency_ms || 0}ms` : 'Doris 未连接'}
          />
        </Col>
        <Col span={6}>
          <KpiCard
            accentColor="#722ED1"
            icon={<IconUp />}
            iconBg="#F5E8FF"
            iconColor="#722ED1"
            label="数据资产总量"
            value={formatNumber(stats.total_files)}
            sub={`今日新增 ${formatNumber(stats.today_files)}`}
            sparkPoints={fileSpark.length > 1 ? fileSpark : []}
            sparkColor="#722ED1"
          />
        </Col>
        <Col span={6}>
          <KpiCard
            accentColor="#00B42A"
            icon={<IconCommand />}
            iconBg="#E8F8EA"
            iconColor="#00B42A"
            label="本周任务成功率"
            value={formatPercent(stats.week_success_rate || 0)}
            sub={`${formatNumber(stats.week_tasks_success)} / ${formatNumber(stats.week_tasks_total)} 成功`}
            sparkPoints={taskSpark.length > 1 ? taskSpark : []}
            sparkColor="#00B42A"
          />
        </Col>
      </Row>

      {/* ── 趋势 + 告警 ────────────────────────────────────────────── */}
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={16}>
          <Card title="7 天接入与任务趋势">
            <ChartPanel option={trendOption} height={280} empty={trend.length === 0} emptyText="暂无趋势数据" />
          </Card>
        </Col>
        <Col span={8}>
          <Card
            title="未处理告警"
            extra={activeAlerts.length ? <Tag color="red" size="small">{activeAlerts.length} 条</Tag> : <Tag color="green" size="small">无告警</Tag>}
          >
            {activeAlerts.length ? (
              activeAlerts.map((item) => (
                <LinkItem key={item.id} title={item.name || '告警'} meta={`${item.metric || '指标'} · ${item.message || '待处理'}`} action="查看" onClick={() => navigate('/mpp/alert')} />
              ))
            ) : (
              <div style={{
                padding: '28px 0', textAlign: 'center',
                background: '#f7f8fa', borderRadius: 8, marginTop: 8,
              }}>
                <IconSafe style={{ fontSize: 28, color: '#00B42A' }} />
                <div style={{ marginTop: 8, color: '#86909c', fontSize: 13 }}>当前没有待处理告警</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 资源监控 + 文件分布 ─────────────────────────────────────── */}
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={8}>
          <Card title="主机资源使用">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <ResourceBar label="CPU 使用率" percent={status.resources.cpu_percent || 0} />
              <ResourceBar label="内存使用率" percent={status.resources.memory_percent || 0} used={status.resources.memory_used_gb} total={status.resources.memory_total_gb} color="#00B42A" />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="文件类型分布">
            <ChartPanel option={fileTypeOption} height={220} empty={fileTypes.length === 0} emptyText="暂无文件类型统计" />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="平台状态摘要">
            <StatusItem title="入湖任务" meta={`近 7 天 ${formatNumber(stats.week_tasks_total)} 次，成功率 ${formatPercent(stats.week_success_rate || 0)}`} tag={componentSummary.offline ? '需关注' : '稳定'} color={componentSummary.offline ? 'orange' : 'green'} />
            <StatusItem title="组件状态" meta={`${componentSummary.online}/${componentSummary.total} 在线`} tag={componentSummary.offline ? `${componentSummary.offline} 异常` : '正常'} color={componentSummary.offline ? 'red' : 'green'} />
            <StatusItem title="向量资产" meta={`文本 ${formatNumber(stats.text_rows)} / 图像 ${formatNumber(stats.image_rows)}`} tag="可检索" color="blue" />
            {knowledgeGraph && (
              <StatusItem
                title="知识图谱"
                meta={`${Array.isArray(knowledgeGraph.entities) ? knowledgeGraph.entities.length : (knowledgeGraph.entity_count ?? 0)} 个实体 / ${Array.isArray(knowledgeGraph.relationships) ? knowledgeGraph.relationships.length : (knowledgeGraph.relationship_count ?? 0)} 个关系`}
                tag="已构建"
                color="purple"
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 快速入口 ────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: '#1d2129' }}>快速入口</div>
        <Row gutter={16}>
          <Col span={6}>
            <QuickLinkCard
              icon={<IconFile />}
              iconBg="#E8F3FF"
              iconColor="#165DFF"
              title="资产目录"
              desc="查看和管理已入湖的数据资产"
              onClick={() => navigate('/files')}
            />
          </Col>
          <Col span={6}>
            <QuickLinkCard
              icon={<IconSearch />}
              iconBg="#E8FFFB"
              iconColor="#0FC6C2"
              title="统一检索"
              desc="SQL、向量、多模态混合检索"
              onClick={() => navigate('/lake-query/retrieval')}
            />
          </Col>
          <Col span={6}>
            <QuickLinkCard
              icon={<IconApps />}
              iconBg="#F5E8FF"
              iconColor="#722ED1"
              title="工作流编排"
              desc="创建和管理数据处理工作流"
              onClick={() => navigate('/workflow')}
            />
          </Col>
          <Col span={6}>
            <QuickLinkCard
              icon={<IconRobot />}
              iconBg="#FFF7E8"
              iconColor="#FF7D00"
              title="AI 数据副驾驶"
              desc="用自然语言提问，自动完成查询"
              onClick={() => navigate('/lake-query/copilot')}
            />
          </Col>
        </Row>
      </div>
    </div>
  )
}
