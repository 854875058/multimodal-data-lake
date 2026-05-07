import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  Form,
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
  IconSwap,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { truncateText } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Col, Row } = Grid
const TabPane = Tabs.TabPane
const Option = Select.Option

const DORIS_BASE = '/api/doris'

const PAGE_MAP = {
  sql: 'SQL 查询工作台',
  retrieval: '统一检索工作台',
  copilot: 'AI 数据副驾驶',
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
  '最近 7 天导入了哪些图片资产，按类型统计',
  '找出与设备异常外观相关的样本，并给出相似结果',
  '最近的批量入湖任务执行情况怎么样',
]

const COPILOT_SEED_SESSIONS = [
  {
    id: 's-1',
    title: 'Critical 告警统计',
    updatedAt: '今天 14:32',
    messages: [],
  },
  {
    id: 's-2',
    title: '相似图片检索',
    updatedAt: '今天 10:18',
    messages: [],
  },
]

async function dorisGet(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
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
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
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
      {result.elapsed != null ? (
        <Text type="secondary">
          耗时 <Text code>{result.elapsed}s</Text>
        </Text>
      ) : null}
      {result.affectedRows != null ? (
        <Text type="secondary">
          影响 <Text code>{result.affectedRows}</Text> 行
        </Text>
      ) : null}
      {Array.isArray(result.rows) && Array.isArray(result.columns) && result.columns.length > 0 ? (
        <Text type="secondary">
          返回 <Text code>{result.rows.length}</Text> 行
        </Text>
      ) : null}
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

function SearchResultCard({ item, index }) {
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'image'].includes(String(item.doc_type || '').toLowerCase())
  const thumbnailUrl = item.file_hash && isImage ? api.getFileContentUrl(item.file_hash) : ''

  return (
    <Card bodyStyle={{ padding: 14 }} hoverable>
      <div style={{ display: 'grid', gridTemplateColumns: isImage ? '104px minmax(0, 1fr)' : '1fr', gap: 14 }}>
        {isImage ? (
          <div
            style={{
              width: 104,
              height: 84,
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--color-fill-1)',
              border: '1px solid var(--color-border-2)',
            }}
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={item.doc_name || 'preview'}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : null}
          </div>
        ) : null}

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <Title heading={6} style={{ margin: 0 }}>
                {item.doc_name || '未命名资产'}
              </Title>
              <Space size="small" style={{ marginTop: 6 }} wrap>
                <Tag color="arcoblue">{item.doc_type || 'unknown'}</Tag>
                {item.score != null ? (
                  <Tag color="purple">RRF {Number(item.score).toFixed(4)}</Tag>
                ) : (
                  <Tag color="green">距离 {Number(item.distance ?? 0).toFixed(4)}</Tag>
                )}
              </Space>
            </div>
            <Tag>#{index + 1}</Tag>
          </div>

          <Paragraph type="secondary" style={{ margin: '10px 0 8px' }}>
            {truncateText(item.text || '当前结果暂无文本摘要。', 220)}
          </Paragraph>
          <Text type="secondary" style={{ fontSize: 11 }}>
            来源：{item.source_uri || '本地入库'}
          </Text>
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
      {results.map((item, index) => (
        <SearchResultCard key={`${item.file_hash || item.id}-${index}`} item={item} index={index} />
      ))}
    </div>
  )
}

function JourneyStep({ title, status, detail, time }) {
  const colorMap = {
    done: '#1B9E5C',
    running: '#165dff',
    error: '#D63B3B',
    pending: '#86909c',
  }
  const bgMap = {
    done: 'rgba(27, 158, 92, 0.08)',
    running: 'rgba(22, 93, 255, 0.08)',
    error: 'rgba(214, 59, 59, 0.08)',
    pending: 'rgba(134, 144, 156, 0.08)',
  }
  const textMap = {
    done: '完成',
    running: '执行中',
    error: '失败',
    pending: '待执行',
  }
  const statusColor = colorMap[status] || colorMap.pending
  const statusBg = bgMap[status] || bgMap.pending

  return (
    <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${statusBg}`, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>{title}</div>
        <Space size="small">
          {time ? <Text type="secondary" style={{ fontSize: 11 }}>{time}</Text> : null}
          <Tag color={statusColor} style={{ background: statusBg, border: 'none' }}>{textMap[status] || textMap.pending}</Tag>
        </Space>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{detail}</div>
    </div>
  )
}

function normalizeSearchIntent(question) {
  if (/(图片|图像|照片|相似|外观|截图|样本)/.test(question)) return 'visual'
  if (/(统计|多少|趋势|排名|分布|最近|任务|导入)/.test(question)) return 'hybrid'
  return 'sql'
}

function formatCopilotSummary(question, route, sqlResult, searchResults) {
  if (route === 'visual') {
    return `围绕“${question}”已完成语义检索，当前返回 ${searchResults.length} 条相关资产，可继续追加结构化条件做二次筛选。`
  }
  const sqlCount = sqlResult?.rows?.length || 0
  const retrievalCount = searchResults.length
  if (sqlCount && retrievalCount) {
    return `当前问题已经形成双路结果：SQL 返回 ${sqlCount} 条结构化结果，检索补充 ${retrievalCount} 条相关资产，适合继续追问或导出分析。`
  }
  if (sqlCount) {
    return `当前问题已通过 SQL 返回 ${sqlCount} 条结果，建议继续追问时间范围、资产类型或异常特征，缩小分析口径。`
  }
  if (retrievalCount) {
    return `当前问题主要通过检索路径命中 ${retrievalCount} 条相关资产，适合继续追加“按类型统计”或“限定最近时间”的分析追问。`
  }
  return `当前问题“${question}”未命中可展示结果，建议补充时间范围、对象类型或更明确的业务条件。`
}

function buildFollowUps(question, route) {
  if (route === 'visual') {
    return [
      '把这些相似资产限定为最近 7 天',
      '只看图片类型并继续按相似度排序',
      '补充结构化条件后重新检索',
    ]
  }
  return [
    `继续分析：${question} 的时间趋势`,
    '把当前结果限定为图片资产',
    '补充相关相似样本作为佐证',
  ]
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
  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产，并按类型统计')
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
    dorisGet('/sql/databases', { cluster_id: clusterId })
      .then((data) => setDatabases(data.databases || []))
      .catch(() => {})
  }, [clusterId])

  useEffect(() => {
    if (subTab === 'history') {
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
      if (subTab === 'history') {
        loadHistory()
      }
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
      if (data?.sql) {
        setSql(data.sql)
        setSubTab('editor')
      }
      Message.success(data?.reasoning || '已生成 SQL 草案')
    } catch (error) {
      Message.error(getErrorMessage(error, 'SQL 生成失败'))
    } finally {
      setConverting(false)
    }
  }

  const applyGeneratedSql = async () => {
    if (!generatedSql) return
    setSql(generatedSql)
    setSubTab('editor')
    try {
      await navigator.clipboard?.writeText(generatedSql)
    } catch {
      // ignore
    }
    Message.success('SQL 已写入编辑器并复制到剪贴板')
  }

  const insertTable = (db, tableName) => {
    setSql(`SELECT * FROM \`${db}\`.\`${tableName}\` LIMIT 100;`)
    setSubTab('editor')
  }

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      handleExecute()
    }
  }

  const treeData = databases.map((db) => ({
    key: `db:${db}`,
    title: (
      <span>
        <IconStorage style={{ marginRight: 6, color: 'var(--color-text-3)' }} />
        {db}
      </span>
    ),
    children: (tablesByDb[db] || []).map((tableName) => ({
      key: `tbl:${db}:${tableName}`,
      title: (
        <span style={{ cursor: 'pointer' }} onClick={() => insertTable(db, tableName)}>
          <IconCommand style={{ marginRight: 6, color: 'var(--color-text-3)' }} />
          {tableName}
        </span>
      ),
      isLeaf: true,
    })),
  }))

  const historyColumns = [
    { title: '时间', dataIndex: 'created_at', width: 170 },
    {
      title: '状态',
      dataIndex: 'success',
      width: 90,
      render: (value) => (value ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>),
    },
    {
      title: '耗时(s)',
      dataIndex: 'elapsed',
      width: 90,
      render: (value) => <Text code>{value ?? '--'}</Text>,
    },
    {
      title: '返回行',
      width: 90,
      render: (_, row) => <Text code>{row.rows_returned || row.affected_rows || 0}</Text>,
    },
    {
      title: 'SQL',
      dataIndex: 'sql',
      ellipsis: true,
      render: (value) => <Text code style={{ fontSize: 12 }}>{value}</Text>,
    },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_, row) => (
        <Button
          type="text"
          size="small"
          onClick={() => {
            setSql(row.sql || '')
            setSubTab('editor')
          }}
        >
          回填
        </Button>
      ),
    },
  ]

  const summaryItems = [
    {
      key: 'cluster',
      label: '当前集群',
      value: clusters.find((item) => item.id === clusterId)?.name || '未选择集群',
      meta: '编辑器、对象树和 SQL 历史都绑定在当前集群下。',
    },
    {
      key: 'mode',
      label: '查询方式',
      value: '自然语言 + SQL',
      meta: '先生成草案，再编辑执行，适合分析师和数据人员协同验证。',
    },
    {
      key: 'editor',
      label: '快捷执行',
      value: 'Ctrl + Enter',
      meta: '支持从历史记录和对象树快速回填 SQL。',
    },
    {
      key: 'history',
      label: '执行历史',
      value: `${history.length} 条`,
      meta: '保留执行轨迹，便于复用与回看。',
    },
  ]

  return (
    <QueryPageFrame
      title="SQL 查询工作台"
      subtitle="统一承接自然语言生成 SQL、编辑执行与历史复用，适合做精确查询、统计分析和结果验证。"
      summaryItems={summaryItems}
      actions={(
        <>
          <Text type="secondary">集群</Text>
          <Select placeholder="选择集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 220 }}>
            {clusters.map((cluster) => (
              <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>
            ))}
          </Select>
          <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>刷新历史</Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={<Space><IconCommand />自然语言转 SQL</Space>} bodyStyle={{ padding: 16 }}>
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0 }}>
              输入业务问题，系统会先产出 SQL 草案，再写入右侧编辑器，方便继续调优和执行。
            </Paragraph>
            <TextArea
              value={nlPrompt}
              onChange={setNlPrompt}
              autoSize={{ minRows: 5, maxRows: 8 }}
              placeholder="例如：查询最近 7 天导入的图片资产，并按 doc_type 分组统计"
            />
            <Space style={{ marginTop: 12 }} wrap>
              <Button type="primary" icon={<IconCommand />} onClick={handleGenerateSql} loading={converting}>生成 SQL</Button>
              <Button icon={<IconCopy />} onClick={applyGeneratedSql} disabled={!generatedSql}>写入编辑器</Button>
            </Space>
            {generatedSql ? (
              <Card size="small" style={{ marginTop: 12, background: 'var(--color-fill-1)' }}>
                <Text code copyable style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{generatedSql}</Text>
              </Card>
            ) : null}
          </Card>

          <Card
            title={<Space><IconStorage />数据库对象</Space>}
            extra={(
              <Select size="small" placeholder="集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 140 }}>
                {clusters.map((cluster) => (
                  <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>
                ))}
              </Select>
            )}
            bodyStyle={{ padding: 8, maxHeight: 560, overflow: 'auto' }}
          >
            {clusters.length === 0 ? (
              <Empty description="请先在运维模块配置集群" />
            ) : databases.length === 0 ? (
              <Empty description="暂无数据库对象" />
            ) : (
              <Tree
                treeData={treeData}
                expandedKeys={expandedKeys}
                blockNode
                onExpand={(keys, { node }) => {
                  setExpandedKeys(keys)
                  if (node._key.startsWith('db:')) loadTables(node._key.slice(3))
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
                <Text type="secondary">快捷键 Ctrl + Enter</Text>
              </Space>
              <TextArea
                value={sql}
                onChange={setSql}
                onKeyDown={handleKeyDown}
                placeholder="输入 SQL，或先用左侧自然语言生成"
                style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }}
                autoSize={{ minRows: 10, maxRows: 18 }}
              />

              {result ? (
                <div style={{ marginTop: 16 }}>
                  <ResultSummary result={result} />
                  {result.columns.length > 0 ? (
                    <Table
                      columns={buildTableColumns(result.columns)}
                      data={result.rows}
                      rowKey={(_, index) => index}
                      pagination={{ pageSize: 20 }}
                      scroll={{ x: 'max-content' }}
                      size="small"
                      border
                    />
                  ) : (
                    <Empty description="无结果集" />
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>刷新</Button>
                <Popconfirm
                  title="确认清空当前集群的 SQL 执行历史？"
                  onOk={async () => {
                    await dorisDelete('/sql/history', { cluster_id: clusterId })
                    Message.success('历史已清空')
                    loadHistory()
                  }}
                >
                  <Button status="danger" icon={<IconDelete />} disabled={!clusterId}>清空历史</Button>
                </Popconfirm>
              </Space>
              <Table
                columns={historyColumns}
                data={history}
                loading={historyLoading}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 960 }}
                border
              />
            </div>
          )}
        </Card>
      </div>
    </QueryPageFrame>
  )
}

function RetrievalWorkspaceTab({ initialStrategy = 'semantic' }) {
  const [strategy, setStrategy] = useState(initialStrategy)
  const [query, setQuery] = useState(initialStrategy === 'visual' ? '查找与设备异常外观相关的图片样本' : '夜间巡检异常样本')
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

  const summaryItems = [
    {
      key: 'strategy',
      label: '当前策略',
      value: strategy === 'semantic' ? '语义检索' : strategy === 'visual' ? '文搜图' : '混合检索',
      meta: strategy === 'hybrid'
        ? '同时利用结构化关键词与向量语义召回，更适合复杂问题。'
        : '统一在同一个工作台内切换，不再拆成多个页面。',
    },
    {
      key: 'limit',
      label: '结果规模',
      value: `${limit} 条`,
      meta: '适合演示召回效果，也适合快速抽样观察结果分布。',
    },
    {
      key: 'route',
      label: '检索路由',
      value: routeText,
      meta: routeMeta,
    },
    {
      key: 'count',
      label: '当前命中',
      value: searched ? `${results.length} 条` : '--',
      meta: messageText || '执行后会在结果区展示召回资产与检索说明。',
    },
  ]

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
        setRouteText('自然语言 -> 向量检索 + 关键词检索 -> RRF 融合')
        setRouteMeta(`RRF k=${rrfK}，适合同时要求结构化条件和语义相似度的场景。`)
      } else {
        const vectorGuide = await api.convertNlToVector({ prompt: query.trim(), top_k: limit })
        const guide = vectorGuide?.data || {}
        const mode = strategy === 'visual' ? 'image' : (guide.mode || 'text')
        const response = await api.search(query.trim(), mode, limit)
        if (!response.success) throw new Error(response.message || '检索失败')
        setResults(Array.isArray(response.results) ? response.results : [])
        setMessageText(guide.command_text || '')
        setRouteText(mode === 'image' ? '自然语言 -> 图像向量检索' : '自然语言 -> 文本语义检索')
        setRouteMeta(guide.command_text || '已根据当前问题生成可追溯的检索命令。')
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

  return (
    <QueryPageFrame
      title="统一检索工作台"
      subtitle="将向量检索、多模态检索和混合检索收口到一个入口里，用户按任务选择策略，不再按底层实现切页面。"
      summaryItems={summaryItems}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={<Space><IconSearch />检索输入</Space>} bodyStyle={{ padding: 16 }}>
            <div>
              <Text type="secondary">检索策略</Text>
              <Select value={strategy} onChange={setStrategy} style={{ width: '100%', marginTop: 6 }}>
                <Option value="semantic">语义检索</Option>
                <Option value="visual">文搜图</Option>
                <Option value="hybrid">混合检索</Option>
              </Select>
            </div>

            <div style={{ marginTop: 12 }}>
              <Text type="secondary">检索内容</Text>
              <TextArea
                value={query}
                onChange={setQuery}
                autoSize={{ minRows: 5, maxRows: 9 }}
                style={{ marginTop: 6 }}
                placeholder={strategy === 'visual'
                  ? '例如：查找红色告警标识、设备机柜外壳破损或夜间低照度场景'
                  : strategy === 'hybrid'
                    ? '例如：查询最近导入的异常图片，并补充相似外观样本'
                    : '例如：夜间巡检异常样本、PDF 质检报告摘要、相似文本片段'}
              />
            </div>

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
              <JourneyStep
                title="语义检索"
                status={strategy === 'semantic' ? 'running' : 'pending'}
                detail="适合查文本语义、摘要内容和相似描述，优先走文本向量召回。"
              />
              <JourneyStep
                title="文搜图"
                status={strategy === 'visual' ? 'running' : 'pending'}
                detail="适合查相似图片、视觉外观和跨模态样本，优先走图像向量召回。"
              />
              <JourneyStep
                title="混合检索"
                status={strategy === 'hybrid' ? 'running' : 'pending'}
                detail="适合同时要求关键词过滤和语义理解的复杂问题，结果会做融合重排。"
              />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messageText ? (
            <div className="prd-code-block">{messageText}</div>
          ) : null}

          <Card title="检索结果" bodyStyle={{ padding: 16 }}>
            <SearchResultList
              results={results}
              searched={searched}
              emptyText={strategy === 'hybrid' ? '当前问题下没有召回可融合结果' : '当前描述下没有找到相关资产'}
            />
          </Card>
        </div>
      </div>
    </QueryPageFrame>
  )
}

function CopilotTab() {
  const [sessions, setSessions] = useState(COPILOT_SEED_SESSIONS)
  const [activeSessionId, setActiveSessionId] = useState(COPILOT_SEED_SESSIONS[0].id)
  const [question, setQuestion] = useState('上个月导入最多的图片资产类型是什么，顺便给我相关样本')
  const [running, setRunning] = useState(false)
  const [latestRoute, setLatestRoute] = useState('等待提问')
  const [latestToolSummary, setLatestToolSummary] = useState('副驾驶会在提问后展示本次使用的工具与数据资源。')

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions]
  )

  const createEmptyAssistantBlock = (currentQuestion) => ({
    steps: [
      { key: 'intent', title: '理解问题', status: 'running', detail: `正在解析“${currentQuestion}”中的对象、时间范围与结果诉求。`, time: '识别中' },
      { key: 'plan', title: '路由决策', status: 'pending', detail: '等待确定走 SQL、检索或双路融合。', time: '' },
      { key: 'draft', title: '生成查询', status: 'pending', detail: '等待生成 SQL 草案或检索命令。', time: '' },
      { key: 'execute', title: '执行验证', status: 'pending', detail: '等待执行并返回结果。', time: '' },
      { key: 'summary', title: '整理结论', status: 'pending', detail: '等待组织结论、追问建议和结果摘要。', time: '' },
    ],
    route: '等待决策',
    sql: '',
    sqlResult: null,
    searchResults: [],
    summary: '',
    followups: [],
  })

  const patchAssistant = (sessionId, patch) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        messages: session.messages.map((message, index) => {
          if (index !== session.messages.length - 1 || message.role !== 'assistant') return message
          return {
            ...message,
            ...patch,
          }
        }),
      }
    }))
  }

  const patchStep = (sessionId, key, patch) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        messages: session.messages.map((message, index) => {
          if (index !== session.messages.length - 1 || message.role !== 'assistant') return message
          return {
            ...message,
            steps: message.steps.map((step) => (step.key === key ? { ...step, ...patch } : step)),
          }
        }),
      }
    }))
  }

  const createSession = () => {
    const nextId = `s-${Date.now()}`
    const session = {
      id: nextId,
      title: '新会话',
      updatedAt: '刚刚',
      messages: [],
    }
    setSessions((current) => [session, ...current])
    setActiveSessionId(nextId)
  }

  const clearSession = () => {
    setSessions((current) => current.map((session) => (
      session.id === activeSessionId ? { ...session, messages: [], title: '新会话', updatedAt: '刚刚' } : session
    )))
  }

  const sendQuestion = async (presetQuestion = '') => {
    const currentQuestion = (presetQuestion || question).trim()
    if (!currentQuestion) {
      Message.warning('请输入问题')
      return
    }

    const sessionId = activeSessionId
    const displayTitle = truncateText(currentQuestion, 14)
    const assistantSeed = createEmptyAssistantBlock(currentQuestion)

    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        title: displayTitle,
        updatedAt: '刚刚',
        messages: [
          ...session.messages,
          { role: 'user', question: currentQuestion, createdAt: '刚刚' },
          { role: 'assistant', createdAt: '处理中', ...assistantSeed },
        ],
      }
    }))

    setQuestion('')
    setRunning(true)
    setLatestRoute('正在分析')
    setLatestToolSummary('正在调用意图识别、SQL 生成、执行验证和检索补充能力。')

    const route = normalizeSearchIntent(currentQuestion)
    let generatedSql = ''
    let sqlResult = null
    let searchResults = []
    let routeLabel = ''

    try {
      patchStep(sessionId, 'intent', { status: 'done', detail: '已识别当前问题属于数据分析与资产补充类场景。', time: '320ms' })

      routeLabel = route === 'visual'
        ? '自然语言 -> 图像语义检索'
        : route === 'hybrid'
          ? '自然语言 -> SQL 精确查询 + 检索补充'
          : '自然语言 -> SQL 查询'

      patchStep(sessionId, 'plan', {
        status: 'done',
        detail: route === 'visual'
          ? '当前问题更适合直接走相似资产检索路径。'
          : route === 'hybrid'
            ? '当前问题既需要结构化统计，也需要相关样本补充，采用双路融合。'
            : '当前问题以结构化查询为主，优先生成 SQL。',
        time: '260ms',
      })
      patchAssistant(sessionId, { route: routeLabel })
      setLatestRoute(routeLabel)

      patchStep(sessionId, 'draft', { status: 'running', detail: '正在生成 SQL 草案或检索命令。', time: '生成中' })

      if (route !== 'visual') {
        const sqlPayload = await api.convertNlToSql({ prompt: currentQuestion, top_k: 10 })
        generatedSql = sqlPayload?.sql || ''
      }

      patchStep(sessionId, 'draft', {
        status: 'done',
        detail: generatedSql
          ? '已生成 SQL 草案，并保留给用户继续复核。'
          : '本轮问题优先走检索路径，不生成 SQL 草案。',
        time: generatedSql ? '740ms' : '480ms',
      })

      patchStep(sessionId, 'execute', { status: 'running', detail: '正在执行查询并补充相关资产。', time: '执行中' })

      if (generatedSql) {
        try {
          const execution = await api.executeDorisSql({ query: generatedSql, limit: 20 })
          sqlResult = {
            columns: execution?.columns || [],
            rows: execution?.rows || [],
            message: execution?.message || '',
            affectedRows: execution?.rows?.length || 0,
          }
        } catch (error) {
          sqlResult = {
            columns: [],
            rows: [],
            message: getErrorMessage(error, 'SQL 执行失败'),
            affectedRows: 0,
          }
        }
      }

      if (route === 'visual') {
        const retrieval = await api.search(currentQuestion, 'image', 8)
        searchResults = Array.isArray(retrieval?.results) ? retrieval.results : []
      } else if (route === 'hybrid') {
        const retrieval = await api.search(currentQuestion, 'hybrid', { limit: 8, rrf_k: 60 })
        searchResults = Array.isArray(retrieval?.results) ? retrieval.results : []
      } else {
        const guide = await api.convertNlToVector({ prompt: currentQuestion, top_k: 6 })
        const retrieval = await api.search(currentQuestion, guide?.data?.mode || 'text', 6)
        searchResults = Array.isArray(retrieval?.results) ? retrieval.results : []
      }

      patchStep(sessionId, 'execute', {
        status: 'done',
        detail: generatedSql
          ? `已完成执行验证，并补充 ${searchResults.length} 条相关资产。`
          : `已完成检索，共返回 ${searchResults.length} 条相关资产。`,
        time: '1.9s',
      })

      const summary = formatCopilotSummary(currentQuestion, route, sqlResult, searchResults)
      const followups = buildFollowUps(currentQuestion, route)

      patchStep(sessionId, 'summary', {
        status: 'done',
        detail: summary,
        time: '420ms',
      })

      patchAssistant(sessionId, {
        createdAt: '刚刚',
        sql: generatedSql,
        sqlResult,
        searchResults,
        summary,
        followups,
      })

      setLatestToolSummary(
        generatedSql
          ? `本轮已使用 nl2sql、doris_query、vector_search 三类能力，形成结构化结果与相关资产的组合输出。`
          : `本轮主要使用 vector_search 能力完成相似资产召回，并保留继续追加 SQL 条件的空间。`
      )
    } catch (error) {
      patchStep(sessionId, 'execute', {
        status: 'error',
        detail: getErrorMessage(error, '执行失败'),
        time: '失败',
      })
      patchStep(sessionId, 'summary', {
        status: 'error',
        detail: '本轮未形成可展示结果，建议补充对象类型、时间范围或更明确的业务条件。',
        time: '',
      })
      patchAssistant(sessionId, {
        createdAt: '失败',
        summary: '当前问题未命中可展示结果，建议缩小范围后重试。',
        followups: ['限定最近 7 天后重试', '明确资产类型后重试'],
      })
      Message.error(getErrorMessage(error, '副驾驶执行失败'))
    } finally {
      setRunning(false)
    }
  }

  const summaryItems = [
    {
      key: 'entry',
      label: '主入口形态',
      value: '多轮对话',
      meta: '面向业务分析师直接提问，不需要先理解底层模块边界。',
    },
    {
      key: 'route',
      label: '最近一次路由',
      value: latestRoute,
      meta: '每次问答都会显示本轮走的是 SQL、检索还是双路融合。',
    },
    {
      key: 'session',
      label: '当前会话',
      value: activeSession?.title || '未选择',
      meta: `${activeSession?.messages?.length || 0} 条消息，可继续追问形成上下文。`,
    },
    {
      key: 'tools',
      label: '工具使用',
      value: running ? '执行中' : '已就绪',
      meta: latestToolSummary,
    },
  ]

  return (
    <QueryPageFrame
      title="AI 数据副驾驶"
      subtitle="围绕自然语言问数、多轮追问和透明推理设计。用户看到的不只是答案，还能看到本轮走了哪些路径、用了哪些工具、结果从哪里来。"
      summaryItems={summaryItems}
      actions={(
        <>
          <Button onClick={createSession}>新建会话</Button>
          <Button status="danger" onClick={clearSession}>清空当前会话</Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 320px', gap: 16 }}>
        <Card title="历史会话" bodyStyle={{ padding: 12 }}>
          <Button type="primary" style={{ width: '100%', marginBottom: 12 }} onClick={createSession}>新建会话</Button>
          <div style={{ display: 'grid', gap: 8 }}>
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveSessionId(session.id)}
                style={{
                  textAlign: 'left',
                  padding: 12,
                  borderRadius: 10,
                  border: session.id === activeSessionId ? '1px solid rgba(22, 93, 255, 0.35)' : '1px solid var(--color-border-2)',
                  background: session.id === activeSessionId ? 'rgba(22, 93, 255, 0.06)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-1)' }}>{session.title}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-3)' }}>{session.updatedAt}</div>
              </button>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="对话线程" bodyStyle={{ padding: 16 }}>
            {activeSession?.messages?.length ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {activeSession.messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} style={{ display: 'grid', gap: 10 }}>
                    {message.role === 'user' ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ maxWidth: '78%', padding: 14, borderRadius: 14, background: 'rgba(22, 93, 255, 0.08)', border: '1px solid rgba(22, 93, 255, 0.16)' }}>
                          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 6 }}>提问 · {message.createdAt}</div>
                          <div style={{ fontSize: 14, color: 'var(--color-text-1)', lineHeight: 1.7 }}>{message.question}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ padding: 16, borderRadius: 16, background: '#fff', border: '1px solid var(--color-border-2)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>AI 数据副驾驶</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-3)' }}>{message.route}</div>
                            </div>
                            <Tag color={running && index === activeSession.messages.length - 1 ? 'arcoblue' : 'green'}>
                              {message.createdAt}
                            </Tag>
                          </div>

                          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                            {message.steps.map((step) => (
                              <JourneyStep key={step.key} title={step.title} status={step.status} detail={step.detail} time={step.time} />
                            ))}
                          </div>

                          {message.sql ? (
                            <Card size="small" title="生成的 SQL 草案" style={{ marginTop: 14, background: 'var(--color-fill-1)' }}>
                              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Text type="secondary">可继续复制到 SQL 查询工作台做二次编辑。</Text>
                                <Button
                                  size="small"
                                  icon={<IconCopy />}
                                  onClick={() => navigator.clipboard?.writeText(message.sql)}
                                >
                                  复制 SQL
                                </Button>
                              </Space>
                              <Text code copyable style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 10 }}>{message.sql}</Text>
                            </Card>
                          ) : null}

                          {message.summary ? (
                            <Card size="small" title="结论摘要" style={{ marginTop: 14 }}>
                              <Paragraph style={{ margin: 0 }}>{message.summary}</Paragraph>
                            </Card>
                          ) : null}

                          {message.sqlResult?.columns?.length ? (
                            <Card size="small" title="结构化结果" style={{ marginTop: 14 }}>
                              <ResultSummary result={message.sqlResult} />
                              <Table
                                columns={buildTableColumns(message.sqlResult.columns)}
                                data={message.sqlResult.rows}
                                rowKey={(_, rowIndex) => rowIndex}
                                pagination={{ pageSize: 5 }}
                                size="small"
                                scroll={{ x: 'max-content' }}
                                border
                              />
                            </Card>
                          ) : null}

                          <div style={{ marginTop: 14 }}>
                            <SearchResultList
                              results={message.searchResults || []}
                              searched
                              emptyText="本轮没有补充相关资产"
                            />
                          </div>

                          {message.followups?.length ? (
                            <div style={{ marginTop: 14 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>继续追问</Text>
                              <Space wrap style={{ marginTop: 8 }}>
                                {message.followups.map((item) => (
                                  <Button key={item} size="small" onClick={() => setQuestion(item)}>{item}</Button>
                                ))}
                              </Space>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="当前会话还没有问题，直接输入业务问题开始。" />
            )}
          </Card>

          <Card title="发起提问" bodyStyle={{ padding: 16 }}>
            <TextArea
              value={question}
              onChange={setQuestion}
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder="例如：上个月导入最多的图片资产类型是什么，顺便给我相关样本"
            />
            <Space wrap style={{ marginTop: 12 }}>
              <Button type="primary" icon={<IconRobot />} onClick={() => sendQuestion()} loading={running}>开始分析</Button>
              {COPILOT_EXAMPLES.map((item) => (
                <Button key={item} onClick={() => setQuestion(item)}>{item}</Button>
              ))}
            </Space>
          </Card>
        </div>

        <Card title="本轮上下文" bodyStyle={{ padding: 16 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <Text type="secondary">最近一次路由</Text>
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>{latestRoute}</div>
            </div>

            <div>
              <Text type="secondary">可用工具</Text>
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                <div style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid var(--color-border-2)' }}><b>nl2sql</b><div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>结构化查询草案生成</div></div>
                <div style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid var(--color-border-2)' }}><b>doris_query</b><div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>本地结构化结果验证</div></div>
                <div style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid var(--color-border-2)' }}><b>vector_search</b><div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>文本或图像语义补充召回</div></div>
              </div>
            </div>

            <div>
              <Text type="secondary">执行说明</Text>
              <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                {latestToolSummary}
              </Paragraph>
            </div>
          </div>
        </Card>
      </div>
    </QueryPageFrame>
  )
}

export default function LakeQueryPage() {
  const { tab } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!tab) {
      navigate('/lake-query/sql', { replace: true })
      return
    }

    if (!PAGE_MAP[tab]) {
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
    </div>
  )
}
