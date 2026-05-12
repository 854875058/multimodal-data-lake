import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  Grid,
  Input,
  InputNumber,
  Message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
} from '@arco-design/web-react'
import {
  IconCommand,
  IconCopy,
  IconDelete,
  IconHistory,
  IconImage,
  IconPlayArrow,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconStorage,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { truncateText } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Row, Col } = Grid
const TabPane = Tabs.TabPane
const Option = Select.Option

const DORIS_BASE = '/api/doris'

const PAGE_MAP = {
  sql: 'SQL 查询工作台',
  retrieval: '统一检索工作台',
  copilot: 'AI 数据副驾驶',
  annotation: '自动化标注工作台',
  vector: '统一检索工作台',
  multimodal: '统一检索工作台',
  hybrid: '统一检索工作台',
  nl2sql: 'SQL 查询工作台',
}

const RETRIEVAL_PRESET_MAP = {
  retrieval: 'semantic',
  vector: 'semantic',
  multimodal: 'visual',
  hybrid: 'hybrid',
}

const COPILOT_EXAMPLES = [
  '最近 7 天有哪些车辆闯入监控告警，给我相关样本',
  '上个月导入最多的图片资产类型是什么，顺便给我相关样本',
  '找出与设备异常外观相关的样本，并按告警等级汇总',
]

const COPILOT_FILTER_DEFAULTS = {
  event_type: '',
  alarm_level: '',
  order_status: '',
  city_name: '',
  county_name: '',
  town_name: '',
  device_name: '',
  algorithm_name: '',
  confidence_min: undefined,
  confidence_max: undefined,
  lat: undefined,
  lon: undefined,
  radius_km: 5,
}

const FILTER_LABELS = {
  event_type: '事件类型',
  alarm_level: '告警等级',
  order_status: '工单状态',
  city_name: '城市',
  county_name: '区县',
  town_name: '街道',
  device_name: '设备名称',
  algorithm_name: '算法名称',
  confidence_min: '置信度下限',
  confidence_max: '置信度上限',
  lat: '纬度',
  lon: '经度',
  radius_km: '半径(km)',
}

async function dorisGet(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  const response = await fetch(url.toString(), { credentials: 'include' })
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  return response.json()
}

async function dorisPost(path, body = {}) {
  const response = await fetch(DORIS_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  return response.json()
}

async function dorisDelete(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  const response = await fetch(url.toString(), { method: 'DELETE', credentials: 'include' })
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  return response.json()
}

function buildTableColumns(columns = []) {
  return columns.map((column) => ({
    title: column,
    dataIndex: column,
    ellipsis: true,
    render: (value) => (value == null ? <Text type="secondary">NULL</Text> : <Text code>{String(value)}</Text>),
  }))
}

function ResultSummary({ result }) {
  if (!result) return null
  return (
    <Space style={{ marginBottom: 10 }} size="large" wrap>
      {result.elapsed != null ? <Text type="secondary">耗时 <Text code>{result.elapsed}s</Text></Text> : null}
      {result.affectedRows != null ? <Text type="secondary">影响 <Text code>{result.affectedRows}</Text> 行</Text> : null}
      {Array.isArray(result.rows) ? <Text type="secondary">返回 <Text code>{result.rows.length}</Text> 行</Text> : null}
      {result.hasMore ? <Tag color="orange">结果已截断</Tag> : null}
      {result.message ? <Text type="secondary">{result.message}</Text> : null}
    </Space>
  )
}

function QueryPageFrame({ title, subtitle, summaryItems, children, actions = null }) {
  return (
    <div className="prd-page">
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>{title}</Title>
          <Text type="secondary">{subtitle}</Text>
        </div>
        {actions ? <div className="prd-page-actions">{actions}</div> : null}
      </div>

      {summaryItems?.length ? (
        <div className="prd-summary-band">
          {summaryItems.map((item) => (
            <div key={item.key} className="prd-summary-item">
              <div className="k">{item.label}</div>
              <div className="v">{item.value}</div>
              <div className="m">{item.meta}</div>
            </div>
          ))}
        </div>
      ) : null}

      {children}
    </div>
  )
}

function DetailField({ label, value, copyable = false }) {
  if (!value) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', gap: 8 }}>
      <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
      <Text style={{ fontSize: 12, lineHeight: 1.6, wordBreak: 'break-all' }} copyable={copyable ? { text: String(value) } : false}>
        {String(value)}
      </Text>
    </div>
  )
}

function JourneyStep({ title, status, detail, time }) {
  const colorMap = { done: '#1B9E5C', running: '#165dff', error: '#D63B3B', pending: '#86909c' }
  const bgMap = { done: 'rgba(27, 158, 92, 0.08)', running: 'rgba(22, 93, 255, 0.08)', error: 'rgba(214, 59, 59, 0.08)', pending: 'rgba(134, 144, 156, 0.08)' }
  const textMap = { done: '完成', running: '执行中', error: '失败', pending: '待执行' }
  return (
    <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${bgMap[status] || bgMap.pending}`, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {time ? <Text type="secondary" style={{ fontSize: 11 }}>{time}</Text> : null}
          <Tag color={colorMap[status] || colorMap.pending} style={{ background: bgMap[status] || bgMap.pending, border: 'none' }}>
            {textMap[status] || textMap.pending}
          </Tag>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{detail}</div>
    </div>
  )
}

function compactFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  )
}

function formatFilters(filters = {}) {
  const entries = Object.entries(compactFilters(filters))
  if (!entries.length) return '未启用高级筛选'
  return entries.map(([key, value]) => `${FILTER_LABELS[key] || key}: ${value}`).join(' / ')
}

function getFirstMediaPath(value) {
  return String(value || '').split(',').map((item) => item.trim()).find(Boolean) || ''
}

function openMultimodalMedia(path, kind = 'image') {
  const mediaPath = getFirstMediaPath(path)
  if (!mediaPath) return
  window.open(api.getMultimodalMediaUrl(mediaPath, kind), '_blank', 'noopener,noreferrer')
}

function MediaThumb({ path, alt = 'preview', kind = 'image', width = 84, height = 64 }) {
  const mediaPath = getFirstMediaPath(path)
  if (!mediaPath) return null
  return (
    <img
      src={api.getMultimodalMediaUrl(mediaPath, kind)}
      alt={alt}
      onClick={() => openMultimodalMedia(mediaPath, kind)}
      style={{ width, height, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border-2)', cursor: 'pointer' }}
    />
  )
}

function SearchResultCard({ item, index }) {
  const isMultimodalCard = Boolean(item.event_type || item.alarm_time || item.address || item.device_name || item.img_src_path || item.video_path)
  const previewText = item.summary || item.description || item.text || '当前结果暂无文本摘要。'
  const imagePath = getFirstMediaPath(item.img_src_path || item.source_uri)
  const iconPath = getFirstMediaPath(item.img_icon_path)
  const videoPath = getFirstMediaPath(item.video_path)
  const relatedImages = Array.isArray(item.related_image_paths) ? item.related_image_paths.filter(Boolean) : []

  return (
    <Card bodyStyle={{ padding: 14 }} hoverable>
      <div style={{ display: 'grid', gridTemplateColumns: imagePath ? '104px minmax(0, 1fr)' : '1fr', gap: 14 }}>
        {imagePath ? <MediaThumb path={imagePath} width={104} height={84} /> : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <Title heading={6} style={{ margin: 0 }}>{item.doc_name || '未命名资产'}</Title>
              <Space size="small" style={{ marginTop: 6 }} wrap>
                <Tag color="arcoblue">{item.doc_type || 'unknown'}</Tag>
                {item.event_type ? <Tag color="orangered">{item.event_type}</Tag> : null}
                {item.alarm_level ? <Tag color="gold">等级 {item.alarm_level}</Tag> : null}
                {item.order_status ? <Tag color="purple">工单 {item.order_status}</Tag> : null}
              </Space>
            </div>
            <Tag>#{index + 1}</Tag>
          </div>

          <Paragraph type="secondary" style={{ margin: '10px 0 8px' }}>
            {truncateText(previewText, 180)}
          </Paragraph>

          {isMultimodalCard ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--color-fill-1)', border: '1px solid var(--color-border-2)' }}>
              <DetailField label="告警时间" value={item.alarm_time} />
              <DetailField label="采集时间" value={item.captured_at} />
              <DetailField label="设备点位" value={item.device_name} />
              <DetailField label="告警地址" value={item.address} />
              <DetailField label="算法" value={item.algorithm_name} />
              <DetailField label="原图路径" value={item.img_src_path || item.source_uri} copyable />
              <DetailField label="标注路径" value={item.img_icon_path} copyable />
              <DetailField label="视频路径" value={item.video_path} copyable />
              <Space size="small" wrap>
                {imagePath ? <Button size="small" icon={<IconImage />} onClick={() => openMultimodalMedia(imagePath, 'image')}>查看图片</Button> : null}
                {iconPath ? <Button size="small" onClick={() => openMultimodalMedia(iconPath, 'image')}>查看标注图</Button> : null}
                {videoPath ? <Button size="small" icon={<IconPlayArrow />} onClick={() => openMultimodalMedia(videoPath, 'video')}>播放视频</Button> : null}
              </Space>
              {relatedImages.length ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {relatedImages.slice(0, 6).map((path) => <MediaThumb key={path} path={path} alt="related" width={56} height={42} />)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function SearchResultList({ results, searched, emptyText = '没有匹配结果' }) {
  if (!searched) return <Empty description="输入检索内容后开始查询" />
  if (!results.length) return <Empty description={emptyText} />
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {results.map((item, index) => <SearchResultCard key={`${item.file_hash || item.id || index}-${index}`} item={item} index={index} />)}
    </div>
  )
}

function SqlWorkspaceTab() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [databases, setDatabases] = useState([])
  const [tablesByDb, setTablesByDb] = useState({})
  const [expandedKeys, setExpandedKeys] = useState([])
  const [subTab, setSubTab] = useState('editor')
  const [sql, setSql] = useState('SELECT file_hash, doc_name, doc_type, source_uri FROM files LIMIT 20;')
  const [result, setResult] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产，并按 doc_type 分组统计')
  const [generatedSql, setGeneratedSql] = useState('')
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    dorisGet('/clusters')
      .then((data) => {
        const list = data.clusters || []
        setClusters(list)
        if (list.length > 0) setClusterId(list[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!clusterId) return
    setDatabases([])
    setTablesByDb({})
    setExpandedKeys([])
    dorisGet('/sql/databases', { cluster_id: clusterId }).then((data) => setDatabases(data.databases || [])).catch(() => {})
  }, [clusterId])

  useEffect(() => {
    if (subTab === 'history' && clusterId) {
      loadHistory()
    }
  }, [clusterId, subTab])

  const loadTables = async (db) => {
    if (tablesByDb[db]) return
    try {
      const data = await dorisGet('/sql/tables', { cluster_id: clusterId, database: db })
      setTablesByDb((current) => ({ ...current, [db]: data.tables || [] }))
    } catch {
      // ignore
    }
  }

  const loadHistory = async () => {
    if (!clusterId) return
    setHistoryLoading(true)
    try {
      const data = await dorisGet('/sql/history', { cluster_id: clusterId, limit: 50 })
      setHistory(data.history || [])
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!sql.trim()) {
      Message.warning('请输入 SQL')
      return
    }
    if (!clusterId) {
      Message.warning('请先选择集群')
      return
    }
    setExecuting(true)
    setResult(null)
    try {
      const data = await dorisPost('/sql/execute', { cluster_id: clusterId, sql: sql.trim(), limit: 500 })
      if (!data.success) {
        Message.error(data.detail || '执行失败')
        return
      }
      setResult({
        columns: data.columns || [],
        rows: data.rows || [],
        affectedRows: data.affected_rows,
        elapsed: data.elapsed,
        hasMore: data.has_more,
        message: data.message,
      })
    } catch (error) {
      Message.error(`执行失败: ${error.message}`)
    } finally {
      setExecuting(false)
    }
  }

  const handleGenerateSql = async () => {
    if (!nlPrompt.trim()) {
      Message.warning('请输入自然语言问题')
      return
    }
    setConverting(true)
    try {
      const data = await api.convertNlToSql({ prompt: nlPrompt.trim(), top_k: 10 })
      setGeneratedSql(data?.sql || '')
      if (data?.sql) setSql(data.sql)
      Message.success(data?.reasoning || '已生成 SQL 草案')
    } catch (error) {
      Message.error(getErrorMessage(error, 'SQL 生成失败'))
    } finally {
      setConverting(false)
    }
  }

  const treeData = databases.map((db) => ({
    key: `db:${db}`,
    title: <span><IconStorage style={{ marginRight: 6 }} />{db}</span>,
    children: (tablesByDb[db] || []).map((tableName) => ({
      key: `tbl:${db}:${tableName}`,
      title: <span style={{ cursor: 'pointer' }} onClick={() => setSql(`SELECT * FROM \`${db}\`.\`${tableName}\` LIMIT 100;`)}><IconCommand style={{ marginRight: 6 }} />{tableName}</span>,
      isLeaf: true,
    })),
  }))

  const historyColumns = [
    { title: '时间', dataIndex: 'created_at', width: 170 },
    { title: '状态', dataIndex: 'success', width: 90, render: (value) => (value ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>) },
    { title: '耗时(s)', dataIndex: 'elapsed', width: 90, render: (value) => <Text code>{value ?? '--'}</Text> },
    { title: 'SQL', dataIndex: 'sql', ellipsis: true, render: (value) => <Text code style={{ fontSize: 12 }}>{value}</Text> },
    { title: '操作', width: 90, render: (_, row) => <Button type="text" size="small" onClick={() => { setSql(row.sql || ''); setSubTab('editor') }}>回填</Button> },
  ]

  const summaryItems = [
    { key: 'cluster', label: '当前集群', value: clusters.find((item) => item.id === clusterId)?.name || '未选择集群', meta: '编辑器、对象树和 SQL 历史都绑定在当前集群下。' },
    { key: 'mode', label: '查询方式', value: '自然语言 + SQL', meta: '先生成草案，再继续编辑执行。' },
    { key: 'editor', label: '快捷执行', value: 'Ctrl + Enter', meta: '支持从历史记录和对象树快速回填 SQL。' },
    { key: 'history', label: '执行历史', value: `${history.length} 条`, meta: '保留执行轨迹，方便复用和回看。' },
  ]

  return (
    <QueryPageFrame
      title="SQL 查询工作台"
      subtitle="统一承接 NL2SQL、编辑执行与历史回放，用来做结构化分析和结果校验。"
      summaryItems={summaryItems}
      actions={(
        <>
          <Text type="secondary">集群</Text>
          <Select placeholder="选择集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 220 }}>
            {clusters.map((cluster) => <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>)}
          </Select>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={<Space><IconCommand />自然语言转 SQL</Space>} bodyStyle={{ padding: 16 }}>
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0 }}>输入业务问题，系统先给出 SQL 草案，再写入右侧编辑器。</Paragraph>
            <TextArea value={nlPrompt} onChange={setNlPrompt} autoSize={{ minRows: 5, maxRows: 8 }} />
            <Space style={{ marginTop: 12 }} wrap>
              <Button type="primary" icon={<IconCommand />} onClick={handleGenerateSql} loading={converting}>生成 SQL</Button>
              <Button icon={<IconCopy />} onClick={() => navigator.clipboard?.writeText(generatedSql)} disabled={!generatedSql}>复制草案</Button>
            </Space>
            {generatedSql ? <Card size="small" style={{ marginTop: 12, background: 'var(--color-fill-1)' }}><Text code copyable style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{generatedSql}</Text></Card> : null}
          </Card>

          <Card title={<Space><IconStorage />数据库对象</Space>} bodyStyle={{ padding: 8, maxHeight: 560, overflow: 'auto' }}>
            {databases.length === 0 ? (
              <Empty description="暂无数据库对象" />
            ) : (
              <Tree
                treeData={treeData}
                expandedKeys={expandedKeys}
                blockNode
                onExpand={(keys, { node }) => {
                  setExpandedKeys(keys)
                  if (String(node._key || '').startsWith('db:')) loadTables(String(node._key).slice(3))
                }}
              />
            )}
          </Card>
        </div>

        <Card bodyStyle={{ padding: 0 }}>
          <Tabs activeTab={subTab} onChange={setSubTab} style={{ padding: '0 16px' }}>
            <TabPane key="editor" title={<span><IconCommand /> SQL 编辑器</span>} />
            <TabPane key="history" title={<span><IconHistory /> 执行历史</span>} />
          </Tabs>

          {subTab === 'editor' ? (
            <div style={{ padding: 16 }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button type="primary" icon={<IconPlayArrow />} onClick={handleExecute} loading={executing} disabled={!clusterId}>执行 SQL</Button>
                <Text type="secondary">支持 Ctrl + Enter</Text>
              </Space>
              <TextArea value={sql} onChange={setSql} autoSize={{ minRows: 10, maxRows: 18 }} style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }} />
              {result ? (
                <div style={{ marginTop: 16 }}>
                  <ResultSummary result={result} />
                  {result.columns.length > 0 ? <Table columns={buildTableColumns(result.columns)} data={result.rows} rowKey={(_, index) => index} pagination={{ pageSize: 20 }} scroll={{ x: 'max-content' }} size="small" border /> : <Empty description="无结果集" />}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>刷新</Button>
                <Popconfirm title="确认清空当前集群的 SQL 执行历史？" onOk={async () => { await dorisDelete('/sql/history', { cluster_id: clusterId }); Message.success('历史已清空'); loadHistory() }}>
                  <Button status="danger" icon={<IconDelete />} disabled={!clusterId}>清空历史</Button>
                </Popconfirm>
              </Space>
              <Table columns={historyColumns} data={history} loading={historyLoading} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 900 }} border />
            </div>
          )}
        </Card>
      </div>
    </QueryPageFrame>
  )
}

function RetrievalWorkspaceTab({ initialStrategy = 'semantic' }) {
  const [strategy, setStrategy] = useState(initialStrategy)
  const [query, setQuery] = useState(initialStrategy === 'visual' ? '查找设备异常外观相关的图片样本' : '夜间巡检异常样本')
  const [limit, setLimit] = useState(12)
  const [rrfK, setRrfK] = useState(60)
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [routeText, setRouteText] = useState('等待执行')
  const [routeMeta, setRouteMeta] = useState('系统会根据当前策略生成检索路径。')
  const [messageText, setMessageText] = useState('')

  useEffect(() => {
    setStrategy(initialStrategy)
  }, [initialStrategy])

  const run = async () => {
    if (!query.trim()) {
      Message.warning('请输入检索内容')
      return
    }
    setSearching(true)
    setResults([])
    setMessageText('')
    try {
      if (strategy === 'hybrid') {
        const response = await api.search(query.trim(), 'hybrid', { limit, rrf_k: rrfK })
        if (!response.success) throw new Error(response.message || '检索失败')
        setResults(Array.isArray(response.results) ? response.results : [])
        setMessageText(response.message || '')
        setRouteText('关键词检索 + 向量召回 + RRF 融合')
        setRouteMeta(`RRF k=${rrfK}，适合复杂组合查询。`)
      } else {
        const guideResponse = await api.convertNlToVector({ prompt: query.trim(), top_k: limit })
        const guide = guideResponse?.data || {}
        const mode = strategy === 'visual' ? 'image' : (guide.mode || 'text')
        const response = await api.search(query.trim(), mode, limit)
        if (!response.success) throw new Error(response.message || '检索失败')
        setResults(Array.isArray(response.results) ? response.results : [])
        setMessageText(guide.command_text || '')
        setRouteText(mode === 'image' ? '文搜图向量检索' : '文本语义检索')
        setRouteMeta(guide.command_text || '已根据当前问题生成检索指令。')
      }
      setSearched(true)
    } catch (error) {
      setResults([])
      setSearched(true)
      Message.error(getErrorMessage(error, '检索失败'))
    } finally {
      setSearching(false)
    }
  }

  const summaryItems = [
    { key: 'strategy', label: '当前策略', value: strategy === 'semantic' ? '语义检索' : strategy === 'visual' ? '文搜图' : '混合检索', meta: '统一在一个工作台内切换，不再拆成多个页面。' },
    { key: 'limit', label: '结果规模', value: `${limit} 条`, meta: '适合演示召回效果和快速抽样。' },
    { key: 'route', label: '检索路径', value: routeText, meta: routeMeta },
    { key: 'count', label: '当前命中', value: searched ? `${results.length} 条` : '--', meta: messageText || '执行后会展示召回资产与检索说明。' },
  ]

  return (
    <QueryPageFrame
      title="统一检索工作台"
      subtitle="把语义检索、文搜图和混合检索合并到同一入口，按任务切换策略。"
      summaryItems={summaryItems}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={<Space><IconSearch />检索输入</Space>} bodyStyle={{ padding: 16 }}>
            <Text type="secondary">检索策略</Text>
            <Select value={strategy} onChange={setStrategy} style={{ width: '100%', marginTop: 6 }}>
              <Option value="semantic">语义检索</Option>
              <Option value="visual">文搜图</Option>
              <Option value="hybrid">混合检索</Option>
            </Select>
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>检索内容</Text>
            <TextArea value={query} onChange={setQuery} autoSize={{ minRows: 5, maxRows: 9 }} style={{ marginTop: 6 }} />
            <Row gutter={12} style={{ marginTop: 4 }}>
              <Col span={12}>
                <Text type="secondary">Top K</Text>
                <InputNumber value={limit} onChange={setLimit} min={1} max={100} style={{ width: '100%', marginTop: 6 }} />
              </Col>
              <Col span={12}>
                <Text type="secondary">RRF K</Text>
                <InputNumber value={rrfK} onChange={setRrfK} min={10} max={200} disabled={strategy !== 'hybrid'} style={{ width: '100%', marginTop: 6 }} />
              </Col>
            </Row>
            <Button type="primary" icon={strategy === 'visual' ? <IconImage /> : <IconSearch />} onClick={run} loading={searching} style={{ marginTop: 16, width: '100%' }}>
              开始检索
            </Button>
          </Card>

          <Card title="策略说明" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <JourneyStep title="语义检索" status={strategy === 'semantic' ? 'running' : 'pending'} detail="适合文本语义、摘要内容和相似描述。" />
              <JourneyStep title="文搜图" status={strategy === 'visual' ? 'running' : 'pending'} detail="适合查相似图片、异常外观和跨模态样本。" />
              <JourneyStep title="混合检索" status={strategy === 'hybrid' ? 'running' : 'pending'} detail="适合同时需要关键词过滤和语义理解的复杂问题。" />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messageText ? <div className="prd-code-block">{messageText}</div> : null}
          <Card title="检索结果" bodyStyle={{ padding: 16 }}>
            <SearchResultList results={results} searched={searched} emptyText={strategy === 'hybrid' ? '当前问题下没有可融合结果' : '当前描述下没有找到相关资产'} />
          </Card>
        </div>
      </div>
    </QueryPageFrame>
  )
}

function AnnotationWorkbenchTab() {
  const [datasetName, setDatasetName] = useState('tower_eye')
  const [scopeType, setScopeType] = useState('dataset')
  const [sampleLimit, setSampleLimit] = useState(50)
  const [strategy, setStrategy] = useState('high_confidence')
  const [minConfidence, setMinConfidence] = useState(0.6)
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(true)
  const [assetIdsText, setAssetIdsText] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [manifestBusy, setManifestBusy] = useState(false)
  const [reviewManifest, setReviewManifest] = useState('')
  const [reviewStats, setReviewStats] = useState(null)
  const [reviewer, setReviewer] = useState('reviewer')
  const [reviewOrigin, setReviewOrigin] = useState('review')
  const [summary, setSummary] = useState(null)
  const [overview, setOverview] = useState(null)
  const [jobItems, setJobItems] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedJob, setSelectedJob] = useState(null)

  const assetIds = useMemo(() => assetIdsText.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean), [assetIdsText])

  const loadOverview = async () => {
    try {
      const [summaryResponse, overviewResponse, jobsResponse] = await Promise.all([
        api.getMultimodalSummary(datasetName),
        api.getAnnotationOverview(datasetName),
        api.listAnnotationJobs(datasetName, 12),
      ])
      setSummary(summaryResponse?.data || null)
      setOverview(overviewResponse?.data || null)
      const items = Array.isArray(jobsResponse?.data?.items) ? jobsResponse.data.items : []
      setJobItems(items)
      if (!selectedJobId && items.length) {
        setSelectedJobId(items[0].job_id)
      }
    } catch {
      setSummary(null)
      setOverview(null)
      setJobItems([])
    }
  }

  const loadJobDetail = async (jobId) => {
    if (!jobId) {
      setSelectedJob(null)
      return
    }
    try {
      const response = await api.getAnnotationJob(jobId)
      setSelectedJob(response?.data || null)
      setSelectedJobId(jobId)
    } catch (error) {
      Message.error(getErrorMessage(error, '加载标注任务详情失败'))
    }
  }

  useEffect(() => {
    loadOverview()
  }, [datasetName])

  useEffect(() => {
    if (selectedJobId) loadJobDetail(selectedJobId)
  }, [selectedJobId])

  const createAnnotationJob = async () => {
    if (scopeType === 'asset' && assetIds.length === 0) {
      Message.warning('资产级预标请至少输入一个 asset_id')
      return
    }
    setManifestBusy(true)
    try {
      const response = await api.createAnnotationJob({
        dataset_name: datasetName,
        scope_type: scopeType,
        strategy,
        limit: sampleLimit,
        min_confidence: minConfidence,
        only_unreviewed: onlyUnreviewed,
        asset_ids: assetIds,
      })
      const payload = response?.data || {}
      const records = Array.isArray(payload.records) ? payload.records : []
      setReviewManifest(JSON.stringify(records, null, 2))
      setReviewStats({ count: payload?.stats?.record_count || records.length, mode: 'generate' })
      if (payload.job_id) setSelectedJobId(payload.job_id)
      await loadOverview()
      Message.success(`已生成 ${payload?.stats?.record_count || records.length} 条预标样本`)
    } catch (error) {
      Message.error(getErrorMessage(error, '生成自动化标注任务失败'))
    } finally {
      setManifestBusy(false)
    }
  }

  const exportReviewManifest = async () => {
    setReviewBusy(true)
    try {
      const response = await api.exportMultimodalReview({ dataset_name: datasetName, limit: sampleLimit })
      const payload = response?.data || {}
      const records = Array.isArray(payload.records) ? payload.records : []
      setReviewManifest(JSON.stringify(records, null, 2))
      setReviewStats({ count: payload.count || records.length, mode: 'export' })
      Message.success(`已导出 ${payload.count || records.length} 条评审样本`)
    } catch (error) {
      Message.error(getErrorMessage(error, '导出标注样本失败'))
    } finally {
      setReviewBusy(false)
    }
  }

  const importReviewManifest = async () => {
    let records = []
    try {
      records = JSON.parse(reviewManifest || '[]')
    } catch {
      Message.error('标注清单 JSON 格式不正确')
      return
    }
    setReviewBusy(true)
    try {
      const response = await api.importMultimodalReview({
        dataset_name: datasetName,
        reviewer,
        origin: reviewOrigin,
        records,
      })
      const payload = response?.data || {}
      setReviewStats({ count: payload.annotations || 0, mode: 'import' })
      await loadOverview()
      Message.success(`已导入 ${payload.annotations || 0} 条人工标注`)
    } catch (error) {
      Message.error(getErrorMessage(error, '导入标注清单失败'))
    } finally {
      setReviewBusy(false)
    }
  }

  const selectedJobRecords = Array.isArray(selectedJob?.result?.records) ? selectedJob.result.records : []
  const selectedJobStats = selectedJob?.stats || null

  const summaryItems = [
    { key: 'target', label: '当前对象', value: scopeType === 'dataset' ? '数据集级' : '资产级', meta: '自动化标注独立成章，围绕预标、复核和回流展开。' },
    { key: 'dataset', label: '数据集', value: datasetName, meta: summary?.overview_text || '当前使用 Tower-Eye 多模态检测数据集。' },
    { key: 'pending', label: '待复核资产', value: overview?.pending_asset_count ?? '--', meta: '优先挑选有检测结果、但还没有人工标注的资产进入预标队列。' },
    { key: 'coverage', label: '标注覆盖率', value: overview ? `${Math.round((overview.coverage_rate || 0) * 100)}%` : '--', meta: '用于衡量当前人工标注回流覆盖情况。' },
  ]

  return (
    <QueryPageFrame
      title="自动化标注工作台"
      subtitle="面向数据集和资产做预标批处理、人工复核回流和质量监控，不再和副驾驶混在一个页面。"
      summaryItems={summaryItems}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr) 340px', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="任务配置" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <Text type="secondary">对象范围</Text>
                <Select value={scopeType} onChange={setScopeType} style={{ width: '100%', marginTop: 6 }}>
                  <Option value="dataset">数据集级预标</Option>
                  <Option value="asset">资产级预标</Option>
                </Select>
              </div>
              <div>
                <Text type="secondary">数据集名称</Text>
                <Input value={datasetName} onChange={setDatasetName} style={{ marginTop: 6 }} placeholder="tower_eye" />
              </div>
              <div>
                <Text type="secondary">预标策略</Text>
                <Select value={strategy} onChange={setStrategy} style={{ width: '100%', marginTop: 6 }}>
                  <Option value="high_confidence">高置信度检测框</Option>
                  <Option value="detections">全部检测框</Option>
                </Select>
              </div>
              <div>
                <Text type="secondary">批次规模</Text>
                <InputNumber value={sampleLimit} onChange={setSampleLimit} min={1} max={500} style={{ width: '100%', marginTop: 6 }} />
              </div>
              <div>
                <Text type="secondary">置信度下限</Text>
                <InputNumber value={minConfidence} onChange={setMinConfidence} min={0} max={1} step={0.05} style={{ width: '100%', marginTop: 6 }} />
              </div>
              <div>
                <Text type="secondary">资产范围</Text>
                <TextArea value={assetIdsText} onChange={setAssetIdsText} autoSize={{ minRows: 3, maxRows: 5 }} style={{ marginTop: 6 }} placeholder="资产级预标时输入 asset_id，支持逗号或换行分隔" />
              </div>
              <div>
                <Text type="secondary">标注人</Text>
                <Input value={reviewer} onChange={setReviewer} style={{ marginTop: 6 }} placeholder="reviewer" />
              </div>
              <div>
                <Text type="secondary">回流来源</Text>
                <Input value={reviewOrigin} onChange={setReviewOrigin} style={{ marginTop: 6 }} placeholder="review" />
              </div>
            </div>
            <Space wrap style={{ marginTop: 16 }}>
              <Button type="primary" loading={manifestBusy} onClick={createAnnotationJob}>生成预标任务</Button>
              <Button loading={reviewBusy} onClick={exportReviewManifest}>导出评审样本</Button>
              <Button status={onlyUnreviewed ? 'success' : 'default'} onClick={() => setOnlyUnreviewed((value) => !value)}>{onlyUnreviewed ? '仅未复核' : '包含已复核'}</Button>
            </Space>
          </Card>

          <Card title="质量概览" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}><div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>资产总量</div><div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{overview?.asset_count ?? '--'}</div></div>
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}><div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>检测覆盖资产</div><div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{overview?.detected_asset_count ?? '--'}</div></div>
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}><div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>已复核资产</div><div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{overview?.reviewed_asset_count ?? '--'}</div></div>
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}><div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>待复核资产</div><div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{overview?.pending_asset_count ?? '--'}</div></div>
            </div>
            {overview?.top_models?.length ? <Space wrap style={{ marginTop: 12 }}>{overview.top_models.map((item) => <Tag key={item.model_name} color="arcoblue">{item.model_name} · {item.count}</Tag>)}</Space> : null}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reviewStats ? <Card bodyStyle={{ padding: 14 }}><Text type="secondary" style={{ fontSize: 12 }}>{reviewStats.mode === 'import' ? `本次已写入 ${reviewStats.count} 条人工标注` : reviewStats.mode === 'generate' ? `本次已生成 ${reviewStats.count} 条预标记录` : `本次已导出 ${reviewStats.count} 条评审样本`}</Text></Card> : null}

          <Card title="标注清单 JSON" bodyStyle={{ padding: 16 }}>
            <Paragraph style={{ marginTop: 0 }}>这里承接预标结果、人工修订和标注回流。生成任务后，可以直接修改 JSON，再写回 `multimodal_annotations`。</Paragraph>
            <Space wrap style={{ marginBottom: 12 }}>
              <Button type="primary" loading={reviewBusy} onClick={importReviewManifest}>导入人工标注</Button>
              <Button icon={<IconCopy />} disabled={!reviewManifest} onClick={() => navigator.clipboard?.writeText(reviewManifest)}>复制 JSON</Button>
              <Button icon={<IconRefresh />} onClick={loadOverview}>刷新概览</Button>
            </Space>
            <TextArea value={reviewManifest} onChange={setReviewManifest} autoSize={{ minRows: 18, maxRows: 30 }} placeholder='[{ "asset_id": "...", "annotations": [{ "label": "车辆", "bbox": [0.1, 0.2, 0.3, 0.4] }] }]' />
          </Card>

          <Card title="任务样本预览" bodyStyle={{ padding: 16 }}>
            {selectedJobRecords.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {selectedJobRecords.slice(0, 6).map((item) => (
                  <div key={item.asset_id} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--color-border-2)', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{item.file_name || item.asset_id}</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-3)' }}>{item.event_type || '未分类事件'} · {item.device_name || '未知设备'}</div>
                      </div>
                      <Tag color="green">{item.predictions?.length || 0} 条预标</Tag>
                    </div>
                    <Space wrap style={{ marginTop: 8 }}>
                      {(item.predictions || []).slice(0, 4).map((prediction, index) => (
                        <Tag key={`${item.asset_id}-${index}`} color="arcoblue">{prediction.label} {prediction.confidence != null ? Number(prediction.confidence).toFixed(2) : '--'}</Tag>
                      ))}
                    </Space>
                  </div>
                ))}
              </div>
            ) : <Empty description="先生成一个预标任务，再查看样本预览。" />}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="预标任务" bodyStyle={{ padding: 16 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">最近的批处理任务</Text>
              <Button size="small" icon={<IconRefresh />} onClick={loadOverview}>刷新</Button>
            </Space>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {jobItems.map((item) => (
                <button key={item.job_id} type="button" onClick={() => loadJobDetail(item.job_id)} style={{ textAlign: 'left', padding: 10, borderRadius: 10, border: item.job_id === selectedJobId ? '1px solid rgba(22, 93, 255, 0.35)' : '1px solid var(--color-border-2)', background: item.job_id === selectedJobId ? 'rgba(22, 93, 255, 0.06)' : '#fff', cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{item.strategy} · {item.scope_type}</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-3)' }}>{item.record_count} 资产 · {item.prediction_count} 预标 · {item.created_at}</div>
                </button>
              ))}
            </div>
            {selectedJobStats ? (
              <div style={{ display: 'grid', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border-2)' }}>
                <Tag color="arcoblue">{selectedJob?.strategy || 'job'}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>已选资产 {selectedJobStats.selected_asset_count || 0}，生成预标 {selectedJobStats.prediction_count || 0}，已复核资产 {selectedJobStats.reviewed_asset_count || 0}</Text>
                {selectedJobStats.top_labels?.length ? <Space wrap>{selectedJobStats.top_labels.map((item) => <Tag key={item.label}>{item.label} · {item.count}</Tag>)}</Space> : null}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </QueryPageFrame>
  )
}

function CopilotTab() {
  const [question, setQuestion] = useState('上个月导入最多的图片资产类型是什么，顺便给我相关样本')
  const [running, setRunning] = useState(false)
  const [filters, setFilters] = useState(COPILOT_FILTER_DEFAULTS)
  const [messages, setMessages] = useState([])
  const [traceItems, setTraceItems] = useState([])
  const [traceStats, setTraceStats] = useState(null)
  const [selectedTraceId, setSelectedTraceId] = useState('')
  const [traceDetail, setTraceDetail] = useState(null)

  const loadTraces = async (keepSelected = true) => {
    try {
      const [listResponse, statsResponse] = await Promise.all([
        api.listMultimodalTraces({ session_id: 'main', limit: 20 }),
        api.getMultimodalTraceStats(),
      ])
      const items = Array.isArray(listResponse?.data?.items) ? listResponse.data.items : []
      setTraceItems(items)
      setTraceStats(statsResponse?.data || null)
      if (!keepSelected && items.length) setSelectedTraceId(items[0].trace_id)
    } catch (error) {
      Message.error(getErrorMessage(error, '加载查询轨迹失败'))
    }
  }

  const loadTraceDetail = async (traceId) => {
    if (!traceId) {
      setTraceDetail(null)
      return
    }
    try {
      const response = await api.getMultimodalTraceDetail(traceId)
      setTraceDetail(response?.data || null)
      setSelectedTraceId(traceId)
    } catch (error) {
      Message.error(getErrorMessage(error, '加载轨迹详情失败'))
    }
  }

  useEffect(() => {
    loadTraces(false)
  }, [])

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))

  const sendQuestion = async (presetQuestion = '') => {
    const currentQuestion = (presetQuestion || question).trim()
    if (!currentQuestion) {
      Message.warning('请输入问题')
      return
    }
    const compactedFilters = compactFilters(filters)
    setRunning(true)
    try {
      const response = await api.queryMultimodalAgent({
        question: currentQuestion,
        dataset_name: 'tower_eye',
        limit: 8,
        session_id: 'main',
        filters: compactedFilters,
      })
      const data = response?.data || {}
      setMessages((current) => [
        ...current,
        {
          question: currentQuestion,
          summary: data.summary || '',
          route: data.route || '',
          sql: data.sql || '',
          sqlResult: data.sql_result || null,
          searchResults: data.search_results || [],
          followups: data.followups || [],
          steps: data.steps || [],
        },
      ])
      setQuestion('')
      await loadTraces(false)
      if (data.trace_id) await loadTraceDetail(data.trace_id)
    } catch (error) {
      Message.error(getErrorMessage(error, '副驾驶执行失败'))
    } finally {
      setRunning(false)
    }
  }

  const summaryItems = [
    { key: 'entry', label: '主入口形态', value: '多轮对话', meta: '围绕当前问题持续追加条件和轨迹。' },
    { key: 'filters', label: '筛选状态', value: formatFilters(filters), meta: '副驾驶问题和显式筛选共同生效。' },
    { key: 'trace', label: '轨迹总量', value: traceStats?.total_queries || 0, meta: '每轮问答都会记录查询轨迹。' },
    { key: 'status', label: '当前状态', value: running ? '执行中' : '已就绪', meta: '支持结构化结果、样本回放和追问建议。' },
  ]

  return (
    <QueryPageFrame
      title="AI 数据副驾驶"
      subtitle="把 Tower-Eye 的多模态检测问答、媒体详情和查询轨迹并到当前湖仓里。"
      summaryItems={summaryItems}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="高级筛选" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <Input size="small" value={filters.event_type} onChange={(value) => updateFilter('event_type', value)} placeholder="事件类型" />
              <Input size="small" value={filters.city_name} onChange={(value) => updateFilter('city_name', value)} placeholder="城市" />
              <Input size="small" value={filters.device_name} onChange={(value) => updateFilter('device_name', value)} placeholder="设备名称" />
              <Input size="small" value={filters.algorithm_name} onChange={(value) => updateFilter('algorithm_name', value)} placeholder="算法名称" />
              <InputNumber size="small" min={0} max={1} step={0.05} value={filters.confidence_min} onChange={(value) => updateFilter('confidence_min', value)} placeholder="置信度下限" />
              <InputNumber size="small" min={0} max={1} step={0.05} value={filters.confidence_max} onChange={(value) => updateFilter('confidence_max', value)} placeholder="置信度上限" />
            </div>
          </Card>

          <Card title="发起提问" bodyStyle={{ padding: 16 }}>
            <TextArea value={question} onChange={setQuestion} autoSize={{ minRows: 4, maxRows: 8 }} />
            <Space wrap style={{ marginTop: 12 }}>
              <Button type="primary" icon={<IconRobot />} onClick={() => sendQuestion()} loading={running}>开始分析</Button>
              {COPILOT_EXAMPLES.map((item) => <Button key={item} onClick={() => setQuestion(item)}>{item}</Button>)}
            </Space>
          </Card>

          <Card title="对话线程" bodyStyle={{ padding: 16 }}>
            {messages.length ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {messages.map((message, index) => (
                  <div key={index} style={{ display: 'grid', gap: 12 }}>
                    <div style={{ padding: 14, borderRadius: 14, background: 'rgba(22, 93, 255, 0.08)', border: '1px solid rgba(22, 93, 255, 0.16)' }}>
                      <div style={{ fontSize: 14, lineHeight: 1.7 }}>{message.question}</div>
                    </div>
                    <div style={{ padding: 16, borderRadius: 16, background: '#fff', border: '1px solid var(--color-border-2)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>AI 数据副驾驶</div>
                          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-3)' }}>{message.route}</div>
                        </div>
                        <Tag color="green">已完成</Tag>
                      </div>
                      {message.steps?.length ? <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>{message.steps.map((step) => <JourneyStep key={step.key} title={step.title} status={step.status} detail={step.detail} time={step.time} />)}</div> : null}
                      {message.sql ? <Card size="small" title="生成 SQL" style={{ marginTop: 14, background: 'var(--color-fill-1)' }}><Text code copyable style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{message.sql}</Text></Card> : null}
                      {message.summary ? <Card size="small" title="结论摘要" style={{ marginTop: 14 }}><Paragraph style={{ margin: 0 }}>{message.summary}</Paragraph></Card> : null}
                      {message.sqlResult?.columns?.length ? <Card size="small" title="结构化结果" style={{ marginTop: 14 }}><ResultSummary result={message.sqlResult} /><Table columns={buildTableColumns(message.sqlResult.columns)} data={message.sqlResult.rows} rowKey={(_, rowIndex) => rowIndex} pagination={{ pageSize: 5 }} size="small" scroll={{ x: 'max-content' }} border /></Card> : null}
                      <div style={{ marginTop: 14 }}><SearchResultList results={message.searchResults || []} searched emptyText="本轮没有补充相关资产" /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <Empty description="当前还没有问题，直接输入业务问题开始。" />}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="查询轨迹" bodyStyle={{ padding: 16 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">最近的查询回放</Text>
              <Button size="small" icon={<IconRefresh />} onClick={() => loadTraces(true)}>刷新</Button>
            </Space>
            {traceStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}><div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>总查询</div><div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{traceStats.total_queries || 0}</div></div>
                <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}><div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>成功数</div><div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{traceStats.success_count || 0}</div></div>
              </div>
            ) : null}
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {traceItems.map((item) => (
                <button key={item.trace_id} type="button" onClick={() => loadTraceDetail(item.trace_id)} style={{ textAlign: 'left', padding: 10, borderRadius: 10, border: item.trace_id === selectedTraceId ? '1px solid rgba(22, 93, 255, 0.35)' : '1px solid var(--color-border-2)', background: item.trace_id === selectedTraceId ? 'rgba(22, 93, 255, 0.06)' : '#fff', cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{truncateText(item.question || '未命名查询', 28)}</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-3)' }}>{item.route || '未命名路径'} · {item.created_at || ''}</div>
                </button>
              ))}
            </div>
            {traceDetail ? (
              <div style={{ display: 'grid', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border-2)' }}>
                <Paragraph style={{ margin: 0 }}>{traceDetail.question}</Paragraph>
                <Tag color="arcoblue">{traceDetail.route}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatFilters(traceDetail.filters || {})}</Text>
                {traceDetail.sql ? <Text code copyable style={{ whiteSpace: 'pre-wrap' }}>{traceDetail.sql}</Text> : null}
                {(traceDetail.steps || []).map((step) => <JourneyStep key={step.key} title={step.title} status={step.status} detail={step.detail} time={step.time} />)}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </QueryPageFrame>
  )
}

export default function LakeQueryPage() {
  const { tab } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!tab || !PAGE_MAP[tab]) {
      navigate('/lake-query/sql', { replace: true })
      return
    }
    if (tab === 'nl2sql') {
      navigate('/lake-query/sql', { replace: true })
    }
  }, [navigate, tab])

  const activeTab = PAGE_MAP[tab] ? (tab === 'vector' || tab === 'multimodal' || tab === 'hybrid' ? 'retrieval' : tab) : 'sql'
  const retrievalPreset = RETRIEVAL_PRESET_MAP[tab] || 'semantic'

  return (
    <div style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      {activeTab === 'sql' && <SqlWorkspaceTab />}
      {activeTab === 'retrieval' && <RetrievalWorkspaceTab initialStrategy={retrievalPreset} />}
      {activeTab === 'copilot' && <CopilotTab />}
      {activeTab === 'annotation' && <AnnotationWorkbenchTab />}
    </div>
  )
}
