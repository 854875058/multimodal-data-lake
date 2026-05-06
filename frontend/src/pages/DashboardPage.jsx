import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Button, Space, Typography, Grid, Statistic, Tabs, Tag, Empty, Message,
  Alert, Progress, Avatar, Descriptions
} from '@arco-design/web-react'
import {
  IconRefresh, IconCheckCircle, IconCloseCircle, IconExclamationCircle,
  IconStorage, IconRobot, IconCommand, IconSearch
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import ChartPanel from '@/components/ChartPanel.jsx'
import { formatDateTime, formatList, formatNumber, formatPercent } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { Row, Col } = Grid
const TabPane = Tabs.TabPane

const emptyStats = {
  total_files: 0, today_files: 0, week_files: 0,
  week_tasks_total: 0, week_tasks_success: 0, week_success_rate: 0,
  week_avg_time_sec: 0, text_rows: 0, image_rows: 0,
}

const emptyStatus = {
  resources: { cpu_percent: 0, memory_percent: 0, memory_used_gb: 0, memory_total_gb: 0 },
  models: { loaded: false, models: [] },
  lancedb: { connected: false, text_rows: 0, image_rows: 0, files_count: 0 },
}

const emptyGraph = { success: true, mode: 'empty', message: '', nodes: [], links: [], categories: [] }

const chartPalette = {
  accent: '#165dff', accentSoft: 'rgba(22, 93, 255, 0.14)',
  cool: '#00b42a', text: '#86909c', grid: 'rgba(229, 230, 235, 0.6)',
}

const capabilityBlueprint = [
  { title: '资产目录治理', tag: 'Gravitino', icon: <IconStorage />, copy: '围绕 Catalog / Schema / Table 组织多模态资产目录' },
  { title: '存储与向量底座', tag: 'SeaweedFS + Lance', icon: <IconCommand />, copy: 'SeaweedFS 对象存储 + Lance 向量文件零拷贝读取' },
  { title: 'AI 编排与计算', tag: 'Ray + Daft', icon: <IconRobot />, copy: '批量接入、ETL、向量化与训练数据准备的工作流编排' },
  { title: '联邦查询与智能问答', tag: 'Doris', icon: <IconSearch />, copy: '通过 Doris 外表、SQL 和 NL2SQL 打通资产检索' },
]

function getGraphModeLabel(mode) {
  return { relation: '实体关系图', entity: '实体图谱', similarity: '相似度图' }[mode] || '暂无数据'
}

function getGraphMessage(graph) {
  if (graph?.message) return graph.message
  return { relation: '已展示文档、实体以及实体之间的关系', entity: '当前只抽取到实体', similarity: '已回退为文件相似度图谱' }[graph?.mode] || '暂无可视化图谱数据'
}

function StatusTag({ online, status }) {
  if (online === true || status === '在线' || status === '已连接' || status === '已加载') {
    return <Tag color="green" icon={<IconCheckCircle />}>{status || '在线'}</Tag>
  }
  if (online === false) {
    return <Tag color="red" icon={<IconCloseCircle />}>{status || '离线'}</Tag>
  }
  return <Tag color="orange" icon={<IconExclamationCircle />}>{status || '待检查'}</Tag>
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(emptyStats)
  const [trend, setTrend] = useState([])
  const [fileTypes, setFileTypes] = useState([])
  const [graph, setGraph] = useState(emptyGraph)
  const [status, setStatus] = useState(emptyStatus)
  const [platformSettings, setPlatformSettings] = useState(null)
  const [componentStatus, setComponentStatus] = useState([])
  const [componentSummary, setComponentSummary] = useState({ total: 0, online: 0, offline: 0 })
  const [activeTab, setActiveTab] = useState('kpi')
  const [refreshingId, setRefreshingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async () => {
    setRefreshing(true)
    try {
      const [s, t, f, g, st, p, c] = await Promise.all([
        api.getDashboardStats(), api.getTrend(7), api.getFileTypes(),
        api.getKnowledgeGraph(), api.getSystemStatus(),
        api.getPlatformSettings(), api.getPlatformComponentStatus(),
      ])
      setStats(s || emptyStats)
      setTrend(Array.isArray(t) ? t : [])
      setFileTypes(Array.isArray(f) ? f : [])
      setGraph(g || emptyGraph)
      setStatus(st || emptyStatus)
      setPlatformSettings(p?.data || null)
      setComponentSummary({
        total: Number(c?.summary?.total || 0),
        online: Number(c?.summary?.online || 0),
        offline: Number(c?.summary?.offline || 0),
      })
      setComponentStatus(Array.isArray(c?.items) ? c.items : [])
    } catch (e) {
      Message.error(getErrorMessage(e, '加载平台总览失败'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleRefreshComponent = async (id) => {
    setRefreshingId(id)
    try {
      const r = await api.getPlatformComponentStatus(id)
      const next = Array.isArray(r?.items) ? r.items[0] : null
      if (next) {
        setComponentStatus(curr => {
          const has = curr.some(i => i.id === id)
          return has ? curr.map(i => i.id === id ? next : i) : [...curr, next]
        })
      }
    } catch (e) {
      Message.error('刷新失败：' + e.message)
    } finally {
      setRefreshingId('')
    }
  }

  const summaryAlert = useMemo(() => {
    if (!stats.week_tasks_total) return { type: 'info', content: '当前还没有形成连续的任务基线，建议先执行一轮标准流程建立平台运行画像。' }
    if (stats.week_success_rate >= 0.9) return { type: 'success', content: '平台处于稳定区间，可继续扩大资产接入与索引覆盖。' }
    if (stats.week_success_rate >= 0.75) return { type: 'warning', content: '平台具备连续运行能力，但存在任务波动，需关注失败任务和资源配置。' }
    return { type: 'error', content: '平台还不具备稳定生产运行状态，请优先处理失败任务和资源瓶颈。' }
  }, [stats])

  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['接入文件', '成功任务'], textStyle: { color: chartPalette.text } },
    grid: { left: 24, right: 18, top: 30, bottom: 16, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: trend.map(i => i.date), axisLabel: { color: chartPalette.text } },
    yAxis: { type: 'value', axisLine: { show: false }, axisLabel: { color: chartPalette.text }, splitLine: { lineStyle: { color: chartPalette.grid } } },
    series: [
      { name: '接入文件', type: 'line', smooth: true, data: trend.map(i => i.file_count),
        areaStyle: { color: chartPalette.accentSoft }, lineStyle: { width: 2.4, color: chartPalette.accent }, itemStyle: { color: chartPalette.accent } },
      { name: '成功任务', type: 'line', smooth: true, data: trend.map(i => i.success_count),
        lineStyle: { width: 2.4, color: chartPalette.cool }, itemStyle: { color: chartPalette.cool } },
    ],
  }), [trend])

  const fileTypeOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    color: ['#165dff', '#00b42a', '#14c9c9', '#722ed1', '#ff7d00', '#86909c'],
    legend: { bottom: 0, textStyle: { color: chartPalette.text } },
    series: [{
      type: 'pie', radius: ['42%', '68%'], avoidLabelOverlap: true,
      label: { formatter: '{b}: {d}%', color: chartPalette.text },
      data: fileTypes.map(i => ({ name: i.doc_type || '未知', value: i.count })),
    }],
  }), [fileTypes])

  const graphOption = useMemo(() => ({
    tooltip: {},
    legend: graph.categories?.length ? [{ data: graph.categories.map(i => i.name), textStyle: { color: chartPalette.text } }] : [],
    series: [{
      type: 'graph', layout: 'force',
      data: graph.nodes || [], links: graph.links || [], categories: graph.categories || [],
      roam: true, draggable: true,
      label: { show: true, position: 'right', formatter: '{b}', color: chartPalette.text },
      lineStyle: { color: 'source', opacity: 0.5, curveness: 0.1 },
      force: { repulsion: 300, edgeLength: [60, 120], gravity: 0.08 },
      emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
    }],
  }), [graph])

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>平台总览</Title>
          <Text type="secondary">多模态数据湖运行态势与组件状态</Text>
        </div>
        <Button type="primary" icon={<IconRefresh />} onClick={loadData} loading={refreshing}>刷新数据</Button>
      </div>

      <Alert
        type={summaryAlert.type}
        content={
          <span>
            <Text bold>资产总量 {formatNumber(stats.total_files)}</Text>
            <Text type="secondary" style={{ margin: '0 8px' }}>·</Text>
            <Text>近 7 天成功率 <Text bold>{formatPercent(stats.week_success_rate)}</Text></Text>
            <Text type="secondary" style={{ margin: '0 8px' }}>·</Text>
            <Text>{summaryAlert.content}</Text>
          </span>
        }
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 0 }}>
        <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
          <TabPane key="kpi" title="指标总览" />
          <TabPane key="services" title={`平台服务 (${componentSummary.total})`} />
          <TabPane key="trend" title="趋势分析" />
          <TabPane key="graph" title="知识图谱" />
        </Tabs>

        <div style={{ padding: 16 }}>
          {activeTab === 'kpi' && (
            <>
              <Title heading={6} style={{ marginBottom: 12 }}>核心指标</Title>
              <Row gutter={16} style={{ marginBottom: 24 }}>
                {[
                  { label: '资产总数', value: stats.total_files, color: '#165dff' },
                  { label: '今日新增', value: stats.today_files, color: '#00b42a' },
                  { label: '近 7 天新增', value: stats.week_files, color: '#14c9c9' },
                  { label: '文本切片', value: stats.text_rows, color: '#722ed1' },
                  { label: '图像切片', value: stats.image_rows, color: '#ff7d00' },
                  { label: '近 7 天成功率', value: formatPercent(stats.week_success_rate), color: '#165dff', sub: `${formatNumber(stats.week_tasks_success)} / ${formatNumber(stats.week_tasks_total)}` },
                ].map((kpi) => (
                  <Col span={4} key={kpi.label}>
                    <Card bodyStyle={{ padding: 18 }}>
                      <Statistic
                        title={kpi.label}
                        value={typeof kpi.value === 'number' ? formatNumber(kpi.value) : kpi.value}
                        valueStyle={{ color: kpi.color, fontSize: 22 }}
                      />
                      {kpi.sub && <Text type="secondary" style={{ fontSize: 12 }}>{kpi.sub}</Text>}
                    </Card>
                  </Col>
                ))}
              </Row>

              <Title heading={6} style={{ marginBottom: 12 }}>系统状态</Title>
              <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={12}>
                  <Card title="主机资源" bodyStyle={{ padding: 20 }}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text type="secondary">CPU 使用率</Text>
                        <Text bold>{formatPercent(status.resources.cpu_percent / 100)}</Text>
                      </div>
                      <Progress percent={status.resources.cpu_percent} showText={false} color={status.resources.cpu_percent > 80 ? '#f53f3f' : '#165dff'} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text type="secondary">内存使用率</Text>
                        <Text bold>{status.resources.memory_used_gb} / {status.resources.memory_total_gb} GB</Text>
                      </div>
                      <Progress percent={status.resources.memory_percent} showText={false} color={status.resources.memory_percent > 80 ? '#f53f3f' : '#00b42a'} />
                    </div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title="模型与存储" bodyStyle={{ padding: 20 }}>
                    <Descriptions
                      column={1} size="small"
                      data={[
                        { label: '模型加载', value: status.models.loaded ? <Tag color="green">已加载</Tag> : <Tag color="orange">未加载</Tag> },
                        { label: '可用模型', value: <Text code style={{ fontSize: 12 }}>{formatList(status.models.models) || '—'}</Text> },
                        { label: 'LanceDB 连接', value: status.lancedb.connected ? <Tag color="green">已连接</Tag> : <Tag color="red">未连接</Tag> },
                        { label: '索引文件数', value: <Text code>{formatNumber(status.lancedb.files_count)}</Text> },
                      ]}
                      labelStyle={{ width: 100 }}
                    />
                  </Card>
                </Col>
              </Row>

              <Title heading={6} style={{ marginBottom: 12 }}>平台能力层</Title>
              <Row gutter={16}>
                {capabilityBlueprint.map((c) => (
                  <Col span={6} key={c.title}>
                    <Card bodyStyle={{ padding: 20 }}>
                      <Space style={{ marginBottom: 8 }}>
                        <Avatar size={32} style={{ backgroundColor: '#165dff' }}>{c.icon}</Avatar>
                        <Tag color="arcoblue">{c.tag}</Tag>
                      </Space>
                      <Title heading={6} style={{ margin: '8px 0 4px' }}>{c.title}</Title>
                      <Text type="secondary" style={{ fontSize: 12 }}>{c.copy}</Text>
                    </Card>
                  </Col>
                ))}
              </Row>
            </>
          )}

          {activeTab === 'services' && (
            <>
              <Space style={{ marginBottom: 16 }} size="large">
                <Tag color="green">在线 {componentSummary.online}</Tag>
                <Tag color="red">离线 {componentSummary.offline}</Tag>
                <Tag>共 {componentSummary.total}</Tag>
              </Space>
              {componentStatus.length === 0 ? (
                <Empty description="暂无组件状态数据" />
              ) : (
                <Row gutter={[16, 16]}>
                  {componentStatus.map(item => (
                    <Col span={8} key={item.id}>
                      <Card bodyStyle={{ padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <Title heading={6} style={{ margin: 0 }}>{item.title}</Title>
                            <Text code style={{ fontSize: 11 }}>{item.endpoint || '—'}</Text>
                          </div>
                          <StatusTag online={item.online} status={item.status} />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                          {item.note || '—'}
                          {item.latency_ms ? ` · ${item.latency_ms} ms` : ''}
                        </Text>
                        {item.last_success_at && (
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                            最近成功：{formatDateTime(item.last_success_at)}
                          </Text>
                        )}
                        {!item.online && item.failure_reason && (
                          <Text type="error" style={{ fontSize: 11, display: 'block' }}>
                            失败：{item.failure_reason}
                          </Text>
                        )}
                        <Space style={{ marginTop: 12 }} size="small">
                          <Button size="mini" loading={refreshingId === item.id} onClick={() => handleRefreshComponent(item.id)}>刷新</Button>
                          {item.action_route && (
                            <Button size="mini" type="text" onClick={() => navigate(item.action_route)}>去处理</Button>
                          )}
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </>
          )}

          {activeTab === 'trend' && (
            <Row gutter={16}>
              <Col span={14}>
                <Card title="近 7 天接入趋势" bodyStyle={{ padding: 8 }}>
                  <ChartPanel option={trendOption} height={320} loading={loading && !trend.length} empty={!loading && !trend.length} emptyText="暂无趋势数据" />
                </Card>
              </Col>
              <Col span={10}>
                <Card title="文件类型分布" bodyStyle={{ padding: 8 }}>
                  <ChartPanel option={fileTypeOption} height={320} loading={loading && !fileTypes.length} empty={!loading && !fileTypes.length} emptyText="暂无文件类型统计" />
                </Card>
              </Col>
            </Row>
          )}

          {activeTab === 'graph' && (
            <Card
              title={
                <Space>
                  知识图谱
                  <Tag color="arcoblue">{getGraphModeLabel(graph.mode)}</Tag>
                </Space>
              }
              extra={<Text type="secondary" style={{ fontSize: 12 }}>{getGraphMessage(graph)}</Text>}
              bodyStyle={{ padding: 8 }}
            >
              <ChartPanel option={graphOption} height={420} loading={loading && !graph.nodes?.length} empty={!loading && !graph.nodes?.length} emptyText={getGraphMessage(graph)} />
            </Card>
          )}
        </div>
      </Card>
    </div>
  )
}
