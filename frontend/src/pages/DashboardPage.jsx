import { useEffect, useMemo, useState } from 'react'
import api, { getErrorMessage } from '@/api'
import ChartPanel from '@/components/ChartPanel.jsx'
import { formatList, formatNumber, formatPercent } from '@/utils/format'

const emptyStats = {
  total_files: 0,
  today_files: 0,
  week_files: 0,
  week_tasks_total: 0,
  week_tasks_success: 0,
  week_success_rate: 0,
  week_avg_time_sec: 0,
  text_rows: 0,
  image_rows: 0
}

const emptyStatus = {
  resources: {
    cpu_percent: 0,
    memory_percent: 0,
    memory_used_gb: 0,
    memory_total_gb: 0
  },
  models: {
    loaded: false,
    models: []
  },
  lancedb: {
    connected: false,
    text_rows: 0,
    image_rows: 0,
    files_count: 0
  }
}

const emptyGraph = {
  success: true,
  mode: 'empty',
  message: '',
  nodes: [],
  links: [],
  categories: []
}

const chartPalette = {
  accent: '#0066ff',
  accentSoft: 'rgba(0, 102, 255, 0.14)',
  cool: '#16a34a',
  ink: '#10233c',
  grid: 'rgba(95, 114, 136, 0.14)',
  axis: '#7c90a8',
  text: '#5f7288',
  edge: '#51606e'
}

const capabilityBlueprint = [
  {
    title: '资产目录治理',
    tag: 'Gravitino',
    copy: '围绕 Catalog / Schema / Table 组织多模态资产目录，承接元数据治理和资产浏览。'
  },
  {
    title: '存储与向量底座',
    tag: 'SeaweedFS + Lance',
    copy: '统一承接 SeaweedFS 对象存储、Lance 向量文件和零拷贝读取场景。'
  },
  {
    title: 'AI 编排与计算',
    tag: 'Ray + Daft',
    copy: '面向批量接入、ETL、向量化与训练数据准备，强调工作流编排和资源控制。'
  },
  {
    title: '联邦查询与智能问答',
    tag: 'Doris',
    copy: '通过 Doris 外表、SQL 和 NL2SQL 打通资产检索、联邦分析和语义查询。'
  }
]

const roadmapSnapshot = [
  {
    stage: 'Q1',
    title: '底座重构与存算验证',
    note: 'SeaweedFS 替换 MinIO，确立 Lance 作为 AI 原生格式。',
    status: '进行中'
  },
  {
    stage: 'Q2',
    title: '工作流与服务封装',
    note: '通过 MCP / NL2SQL / Ray Job 封装平台化计算能力。',
    status: '推进中'
  },
  {
    stage: '目标',
    title: '商业化控制台',
    note: '形成统一的目录、接入、计算、查询和监控界面。',
    status: '持续优化'
  }
]

function getGraphModeLabel(mode) {
  switch (mode) {
    case 'relation':
      return '实体关系图'
    case 'entity':
      return '实体图谱'
    case 'similarity':
      return '相似度图'
    case 'empty':
    default:
      return '暂无数据'
  }
}

function getGraphMessage(graph) {
  if (graph?.message) {
    return graph.message
  }
  switch (graph?.mode) {
    case 'relation':
      return '已展示文档、实体以及实体之间的关系。'
    case 'entity':
      return '当前只抽取到实体，尚未抽取到明确的实体关系。'
    case 'similarity':
      return '当前无实体数据，已回退为文件相似度图谱。'
    default:
      return '暂无可视化图谱数据。'
  }
}

function getServiceStatusClass(status) {
  return status === '在线' || status === '已连接' || status === '已加载' ? 'is-success' : 'is-warning'
}

export default function DashboardPage() {
  const [stats, setStats] = useState(emptyStats)
  const [trend, setTrend] = useState([])
  const [fileTypes, setFileTypes] = useState([])
  const [graph, setGraph] = useState(emptyGraph)
  const [status, setStatus] = useState(emptyStatus)
  const [platformSettings, setPlatformSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadData = async () => {
    setRefreshing(true)
    setError('')

    try {
      const [statsData, trendData, typeData, graphData, statusData, platformResponse] = await Promise.all([
        api.getDashboardStats(),
        api.getTrend(7),
        api.getFileTypes(),
        api.getKnowledgeGraph(),
        api.getSystemStatus(),
        api.getPlatformSettings()
      ])

      setStats(statsData || emptyStats)
      setTrend(Array.isArray(trendData) ? trendData : [])
      setFileTypes(Array.isArray(typeData) ? typeData : [])
      setGraph(graphData || emptyGraph)
      setStatus(statusData || emptyStatus)
      setPlatformSettings(platformResponse?.data || null)
    } catch (requestError) {
      setError(getErrorMessage(requestError, '加载平台总览失败。'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const executiveSummary = useMemo(() => {
    if (!stats.week_tasks_total) {
      return '当前还没有形成连续的任务基线。建议先通过 AI 工作台或数据接入页执行一轮标准流程，以建立平台运行画像。'
    }
    if (stats.week_success_rate >= 0.9) {
      return '当前平台处于稳定区间，适合继续扩大资产接入和索引覆盖，优先推进目录治理与 Doris 查询链路。'
    }
    if (stats.week_success_rate >= 0.75) {
      return '平台已具备连续运行能力，但任务波动仍然存在。建议关注失败任务和工作流资源配置，避免成为商业化演示短板。'
    }
    return '当前平台还不具备稳定商业演示状态。应优先处理工作台失败任务、资源瓶颈和接入链路不稳定问题。'
  }, [stats.week_success_rate, stats.week_tasks_total])

  const serviceCards = useMemo(() => [
    {
      title: 'Gravitino',
      status: platformSettings?.gravitino_url ? '在线' : '待配置',
      meta: platformSettings?.gravitino_url || '--',
      note: platformSettings?.metalake ? `Metalake: ${platformSettings.metalake}` : '目录治理入口'
    },
    {
      title: 'SeaweedFS',
      status: platformSettings?.seaweedfs_s3_url ? '在线' : '待配置',
      meta: platformSettings?.seaweedfs_s3_url || '--',
      note: '对象存储 / S3 Gateway'
    },
    {
      title: 'Ray 编排',
      status: platformSettings?.ray_dashboard_url ? '在线' : '待配置',
      meta: platformSettings?.ray_dashboard_url || '--',
      note: `${formatNumber(stats.week_tasks_total)} 个近 7 天任务`
    },
    {
      title: 'LanceDB',
      status: status.lancedb.connected ? '已连接' : '待检查',
      meta: `${formatNumber(status.lancedb.files_count)} assets`,
      note: `text=${formatNumber(status.lancedb.text_rows)} / image=${formatNumber(status.lancedb.image_rows)}`
    },
    {
      title: 'Doris',
      status: platformSettings?.doris_mysql_host ? '待验证' : '待配置',
      meta: platformSettings?.doris_mysql_host ? `${platformSettings.doris_mysql_host}:${platformSettings.doris_mysql_port}` : '--',
      note: '联邦查询与外表映射'
    }
  ], [platformSettings, stats.week_tasks_total, status.lancedb])

  const coreKpis = [
    { label: '资产总数', value: formatNumber(stats.total_files), sub: '当前已入湖文件与多模态资产数量' },
    { label: '今日新增', value: formatNumber(stats.today_files), sub: '当天新增资产' },
    { label: '近 7 天新增', value: formatNumber(stats.week_files), sub: '平台增量接入规模' },
    { label: '文本切片', value: formatNumber(stats.text_rows), sub: '检索与训练可用文本向量条目' },
    { label: '图像切片', value: formatNumber(stats.image_rows), sub: '图像向量条目' },
    {
      label: '近 7 天成功率',
      value: formatPercent(stats.week_success_rate),
      sub: `${formatNumber(stats.week_tasks_success)} / ${formatNumber(stats.week_tasks_total)} 任务成功`
    }
  ]

  const statusKpis = [
    { label: 'CPU 负载', value: formatPercent(status.resources.cpu_percent), sub: '实时系统资源' },
    {
      label: '内存负载',
      value: formatPercent(status.resources.memory_percent),
      sub: `${status.resources.memory_used_gb} / ${status.resources.memory_total_gb} GB`
    },
    {
      label: '平均耗时',
      value: `${Number(stats.week_avg_time_sec || 0).toFixed(2)} 秒`,
      sub: '近 7 天任务平均时长'
    },
    {
      label: '模型状态',
      value: status.models.loaded ? '已加载' : '未加载',
      sub: formatList(status.models.models)
    },
    {
      label: '图谱模式',
      value: getGraphModeLabel(graph.mode),
      sub: getGraphMessage(graph)
    },
    {
      label: 'Mock 策略',
      value: platformSettings?.use_mock ? '已启用' : '关闭',
      sub: '真实集群不可达时保留平台演示路径'
    }
  ]

  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['接入文件', '成功任务'],
      textStyle: { color: chartPalette.text }
    },
    grid: { left: 24, right: 18, top: 34, bottom: 18, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((item) => item.date),
      axisLine: { lineStyle: { color: chartPalette.axis } },
      axisLabel: { color: chartPalette.text }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: chartPalette.text },
      splitLine: { lineStyle: { color: chartPalette.grid } }
    },
    series: [
      {
        name: '接入文件',
        type: 'line',
        smooth: true,
        data: trend.map((item) => item.file_count),
        areaStyle: { color: chartPalette.accentSoft },
        lineStyle: { width: 2.5, color: chartPalette.accent },
        itemStyle: { color: chartPalette.accent }
      },
      {
        name: '成功任务',
        type: 'line',
        smooth: true,
        data: trend.map((item) => item.success_count),
        lineStyle: { width: 2.5, color: chartPalette.cool },
        itemStyle: { color: chartPalette.cool }
      }
    ]
  }), [trend])

  const fileTypeOption = useMemo(() => ({
    tooltip: { trigger: 'item' },
    color: ['#0066ff', '#16a34a', '#0ea5e9', '#4f46e5', '#f59e0b', '#64748b'],
    legend: {
      bottom: 0,
      textStyle: { color: chartPalette.text }
    },
    series: [
      {
        name: '文件类型',
        type: 'pie',
        radius: ['44%', '72%'],
        avoidLabelOverlap: true,
        label: { formatter: '{b}: {d}%', color: chartPalette.text },
        data: fileTypes.map((item) => ({
          name: item.doc_type || '未知',
          value: item.count
        }))
      }
    ]
  }), [fileTypes])

  const graphOption = useMemo(() => ({
    tooltip: {},
    legend: graph.categories?.length
      ? [{ data: graph.categories.map((item) => item.name), textStyle: { color: chartPalette.text } }]
      : [],
    series: [
      {
        type: 'graph',
        layout: 'force',
        data: graph.nodes || [],
        links: graph.links || [],
        categories: graph.categories || [],
        roam: true,
        draggable: true,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}',
          color: chartPalette.text
        },
        lineStyle: {
          color: 'source',
          opacity: 0.52,
          curveness: 0.1
        },
        edgeLabel: {
          show: true,
          color: chartPalette.edge,
          fontSize: 10,
          formatter: (params) => (params.data?.value && params.data.value !== '提及' ? params.data.value : '')
        },
        force: {
          repulsion: 300,
          edgeLength: [64, 126],
          gravity: 0.08
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: { width: 3 }
        }
      }
    ]
  }), [graph])

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">平台总览</h1>
          <p className="page-subtitle">从商业化平台视角查看目录、存储、编排、查询和智能能力的整体就绪度，而不是只看单页 demo 指标。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-primary" onClick={loadData} disabled={refreshing}>
            {refreshing ? '刷新中...' : '刷新数据'}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="platform-overview-grid">
        <section className="glass-card platform-overview-hero">
          <div className="dashboard-lead-meta">
            <span className="badge">Executive Summary</span>
            <span className="dashboard-lead-note">BONC / Gravitino / SeaweedFS / Lance / Ray / Doris</span>
          </div>
          <div className="platform-hero-title">当前平台资产总量 {formatNumber(stats.total_files)}，近 7 天接入成功率 {formatPercent(stats.week_success_rate)}。</div>
          <p className="platform-hero-copy">{executiveSummary}</p>

          <div className="platform-service-grid">
            {serviceCards.map((item) => (
              <div className="platform-service-card" key={item.title}>
                <div className="platform-service-head">
                  <div className="platform-service-title">{item.title}</div>
                  <span className={`badge ${getServiceStatusClass(item.status)}`}>{item.status}</span>
                </div>
                <div className="platform-service-meta mono">{item.meta}</div>
                <div className="platform-service-note">{item.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card platform-roadmap-card">
          <div className="card-header">
            <div>
              <h2>路线快照</h2>
              <p>依据参考文档梳理的平台阶段目标。</p>
            </div>
          </div>

          <div className="platform-roadmap-list">
            {roadmapSnapshot.map((item) => (
              <div className="platform-roadmap-item" key={item.stage}>
                <div className="platform-roadmap-stage">{item.stage}</div>
                <div className="platform-roadmap-title">{item.title}</div>
                <div className="platform-roadmap-copy">{item.note}</div>
                <span className="badge is-muted">{item.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>平台能力层</h2>
            <p>把当前应用从 POC 页面提升为平台控制台，核心在于能力分层和服务语义要完整。</p>
          </div>
        </div>

        <div className="platform-capability-grid">
          {capabilityBlueprint.map((item) => (
            <div className="platform-capability-card" key={item.title}>
              <span className="badge">{item.tag}</span>
              <div className="platform-capability-title">{item.title}</div>
              <div className="platform-capability-copy">{item.copy}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="section-title">核心指标</div>
      <div className="stats-grid">
        {coreKpis.map((item) => (
          <div className="kpi-card glass-card" key={item.label}>
            <div className="kpi-label">{item.label}</div>
            <div className="kpi-value">{item.value}</div>
            <div className="kpi-sub">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="section-title">系统状态</div>
      <div className="status-grid">
        {statusKpis.map((item) => (
          <div className="kpi-card glass-card" key={item.label}>
            <div className="kpi-label">{item.label}</div>
            <div className="kpi-value">{item.value}</div>
            <div className="kpi-sub">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="glass-card chart-card">
          <div className="card-header">
            <div>
              <h2>近 7 天接入趋势</h2>
              <p>同时看接入文件数和成功任务数，判断平台运行稳定性。</p>
            </div>
          </div>
          <ChartPanel
            option={trendOption}
            loading={loading && trend.length === 0}
            empty={!loading && trend.length === 0}
            emptyText="暂无趋势数据"
          />
        </div>

        <div className="glass-card chart-card">
          <div className="card-header">
            <div>
              <h2>文件类型分布</h2>
              <p>当前平台已接入资产的格式结构。</p>
            </div>
          </div>
          <ChartPanel
            option={fileTypeOption}
            loading={loading && fileTypes.length === 0}
            empty={!loading && fileTypes.length === 0}
            emptyText="暂无文件类型统计"
          />
        </div>
      </div>

      <div className="glass-card chart-card">
        <div className="card-header">
          <div>
            <h2>知识图谱</h2>
            <p>{getGraphMessage(graph)}</p>
          </div>
          <span className="badge">{getGraphModeLabel(graph.mode)}</span>
        </div>
        <ChartPanel
          option={graphOption}
          height={380}
          loading={loading && (!graph.nodes || graph.nodes.length === 0)}
          empty={!loading && (!graph.nodes || graph.nodes.length === 0)}
          emptyText={getGraphMessage(graph)}
        />
      </div>
    </div>
  )
}
