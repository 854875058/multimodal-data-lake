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

const TITLE_MAP = {
  sql: 'SQL 查询工作台',
  vector: '向量检索',
  multimodal: '多模态检索',
  hybrid: '混合检索',
  copilot: 'AI 数据副驾驶',
}

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

function SearchResultList({ results, searched, emptyText = '没有匹配的结果' }) {
  if (!searched) return <Empty description="输入查询内容开始检索" />
  if (!results.length) return <Empty description={emptyText} />

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {results.map((item, index) => (
        <Card key={`${item.file_hash || item.id}-${index}`} bodyStyle={{ padding: 16 }} hoverable>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <Title heading={6} style={{ margin: 0 }}>
                {item.doc_name || '未命名文件'}
              </Title>
              <Space size="small" style={{ marginTop: 4 }} wrap>
                <Tag color="arcoblue">{item.doc_type || 'unknown'}</Tag>
                {item.score != null ? (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    RRF {Number(item.score).toFixed(6)}
                  </Text>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    距离 {Number(item.distance ?? 0).toFixed(4)}
                  </Text>
                )}
              </Space>
            </div>
            <Tag>#{index + 1}</Tag>
          </div>
          <Paragraph type="secondary" style={{ margin: '10px 0 8px' }}>
            {truncateText(item.text || '当前结果暂无文本摘要。', 220)}
          </Paragraph>
          <Text type="secondary" style={{ fontSize: 11 }}>
            来源: {item.source_uri || '本地入库'}
          </Text>
        </Card>
      ))}
    </Space>
  )
}

function JourneyStep({ title, status, detail }) {
  const color = status === 'done' ? '#1B9E5C' : status === 'running' ? '#165dff' : status === 'error' ? '#D63B3B' : '#86909c'
  const bg = status === 'done' ? 'rgba(27, 158, 92, 0.08)' : status === 'running' ? 'rgba(22, 93, 255, 0.08)' : status === 'error' ? 'rgba(214, 59, 59, 0.08)' : 'rgba(134, 144, 156, 0.08)'
  const label = status === 'done' ? '完成' : status === 'running' ? '执行中' : status === 'error' ? '失败' : '待执行'

  return (
    <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${bg}`, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>{title}</div>
        <Tag color={color} style={{ background: bg, border: 'none' }}>{label}</Tag>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{detail}</div>
    </div>
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

function SqlWorkspaceTab() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [databases, setDatabases] = useState([])
  const [tablesByDb, setTablesByDb] = useState({})
  const [expandedKeys, setExpandedKeys] = useState([])
  const [subTab, setSubTab] = useState('editor')
  const [sql, setSql] = useState('SELECT 1;')
  const [result, setResult] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产')
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
      Message.error(getErrorMessage(error, 'NL2SQL 生成失败'))
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
      // ignore clipboard failures
    }
    Message.success('SQL 已写入编辑器，并复制到剪贴板')
  }

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      handleExecute()
    }
  }

  const insertTable = (db, tableName) => {
    setSql(`SELECT * FROM \`${db}\`.\`${tableName}\` LIMIT 100;`)
    setSubTab('editor')
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
      width: 80,
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
      meta: '编辑器、对象树和 SQL 历史都绑定在当前集群上。',
    },
    {
      key: 'mode',
      label: '查询方式',
      value: '自然语言 + SQL',
      meta: '可先用自然语言生成查询草案，再进行编辑、执行和验证。',
    },
    {
      key: 'editor',
      label: '编辑模式',
      value: 'Ctrl + Enter',
      meta: '支持快速执行，也支持从历史记录和对象树一键回填 SQL。',
    },
    {
      key: 'history',
      label: '历史记录',
      value: `${history.length} 条`,
      meta: '保留执行轨迹，便于继续验证生成 SQL 或回看分析过程。',
    },
  ]

  return (
    <QueryPageFrame
      title="SQL 查询工作台"
      subtitle="支持自然语言问数、SQL 编辑、执行验证和历史回查，适合分析师和数据人员快速完成查询工作。"
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
              在这里描述你的问题，生成的 SQL 会直接写入右侧编辑器，减少来回跳转。
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
              <Empty description="请先在湖运维注册集群" />
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
                <Text type="secondary">快捷键: Ctrl + Enter</Text>
              </Space>
              <TextArea
                value={sql}
                onChange={setSql}
                onKeyDown={handleKeyDown}
                placeholder="输入 SQL 语句，或先用左侧自然语言生成 SQL"
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
                pagination={{ pageSize: 10, showTotal: true }}
                noDataElement={<Empty description={!clusterId ? '请先选择集群' : '暂无执行历史'} />}
              />
            </div>
          )}
        </Card>
      </div>
    </QueryPageFrame>
  )
}

function VectorSearchTab() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('text')
  const [limit, setLimit] = useState(10)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const summaryItems = [
    {
      key: 'mode',
      label: '检索模式',
      value: mode === 'image' ? '文搜图' : '文本语义',
      meta: '可按文本语义检索文本资产，也可按文本描述召回图像样本。',
    },
    {
      key: 'limit',
      label: 'Top K',
      value: String(limit),
      meta: '用于控制每次返回的结果数量。',
    },
  ]

  const run = async () => {
    if (!query.trim()) {
      Message.warning('请输入检索内容')
      return
    }
    setSearching(true)
    try {
      const response = await api.search(query.trim(), mode, limit)
      if (!response.success) throw new Error(response.message || '检索失败')
      setResults(Array.isArray(response.results) ? response.results : [])
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
      title="向量检索"
      subtitle="支持文本语义检索和文搜图，适合快速验证当前向量资产的可用性。"
      summaryItems={summaryItems}
    >
      <Card bodyStyle={{ padding: 16 }}>
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label="查询内容" style={{ flex: 1, minWidth: 320 }}>
            <Input value={query} onChange={setQuery} placeholder="输入语义描述、关键词或图像内容描述" allowClear />
          </Form.Item>
          <Form.Item label="模式">
            <Select value={mode} onChange={setMode} style={{ width: 120 }}>
              <Option value="text">文本</Option>
              <Option value="image">文搜图</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Top K">
            <InputNumber value={limit} onChange={setLimit} min={1} max={100} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<IconSearch />} onClick={run} loading={searching}>开始检索</Button>
          </Form.Item>
        </Form>
        <SearchResultList results={results} searched={searched} />
      </Card>
    </QueryPageFrame>
  )
}

function MultimodalSearchTab() {
  const [prompt, setPrompt] = useState('查找与设备外观异常相关的图片样本')
  const [limit, setLimit] = useState(12)
  const [strategy, setStrategy] = useState('auto')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [resolvedMode, setResolvedMode] = useState('')
  const [results, setResults] = useState([])
  const [commandText, setCommandText] = useState('')

  const summaryItems = [
    {
      key: 'entry',
      label: '入口类型',
      value: strategy === 'auto' ? '自动识别' : strategy === 'image' ? '文搜图' : '语义文本',
      meta: '会根据描述自动选择更合适的召回方式，也可以手动指定。',
    },
    {
      key: 'limit',
      label: '结果规模',
      value: `${limit} 条`,
      meta: '适合演示跨模态定位，也适合快速抽样查看结果分布。',
    },
    {
      key: 'mode',
      label: '最近策略',
      value: resolvedMode ? (resolvedMode === 'image' ? '图像召回' : '文本召回') : '等待执行',
      meta: commandText || '执行后会显示当前采用的检索指令。',
    },
  ]

  const run = async () => {
    if (!prompt.trim()) {
      Message.warning('请输入检索描述')
      return
    }
    setSearching(true)
    try {
      const vectorGuide = await api.convertNlToVector({ prompt: prompt.trim(), top_k: limit })
      const guide = vectorGuide?.data || {}
      const nextMode = strategy === 'auto' ? (guide.mode || 'text') : strategy
      const response = await api.search(prompt.trim(), nextMode, limit)
      if (!response.success) throw new Error(response.message || '检索失败')
      setResolvedMode(nextMode)
      setCommandText(guide.command_text || '')
      setResults(Array.isArray(response.results) ? response.results : [])
      setSearched(true)
    } catch (error) {
      setResults([])
      setSearched(true)
      Message.error(getErrorMessage(error, '多模态检索失败'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <QueryPageFrame
      title="多模态检索"
      subtitle="通过自然语言描述直接召回相关图像或文本资产，适合演示跨模态数据的统一检索能力。"
      summaryItems={summaryItems}
    >
      <Card bodyStyle={{ padding: 16 }}>
        <Row gutter={16}>
          <Col span={16}>
            <TextArea
              value={prompt}
              onChange={setPrompt}
              autoSize={{ minRows: 4, maxRows: 8 }}
              placeholder="例如：查找红色背景的质检图片，或者查找与故障告警相似的历史样本"
            />
          </Col>
          <Col span={8}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text type="secondary">召回策略</Text>
                <Select value={strategy} onChange={setStrategy} style={{ width: '100%', marginTop: 6 }}>
                  <Option value="auto">自动识别</Option>
                  <Option value="image">文搜图</Option>
                  <Option value="text">文本语义</Option>
                </Select>
              </div>
              <div>
                <Text type="secondary">Top K</Text>
                <InputNumber value={limit} onChange={setLimit} min={1} max={100} style={{ width: '100%', marginTop: 6 }} />
              </div>
              <Button type="primary" icon={<IconImage />} onClick={run} loading={searching}>开始检索</Button>
            </Space>
          </Col>
        </Row>

        {commandText ? (
          <div className="prd-code-block" style={{ marginTop: 16 }}>
            {commandText}
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <SearchResultList results={results} searched={searched} emptyText="当前描述下没有召回相关样本" />
        </div>
      </Card>
    </QueryPageFrame>
  )
}

function HybridSearchTab() {
  const [query, setQuery] = useState('设备异常告警')
  const [limit, setLimit] = useState(10)
  const [rrfK, setRrfK] = useState(60)
  const [results, setResults] = useState([])
  const [messageText, setMessageText] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const summaryItems = [
    {
      key: 'strategy',
      label: '融合方式',
      value: 'RRF',
      meta: '同时考虑关键词匹配与向量语义召回，避免只靠单一路径。',
    },
    {
      key: 'rrf',
      label: 'RRF 常数',
      value: String(rrfK),
      meta: '数值越大，召回排名的平滑程度越高。',
    },
    {
      key: 'limit',
      label: 'Top K',
      value: `${limit} 条`,
      meta: messageText || '执行后会显示本次混合检索的召回摘要。',
    },
  ]

  const run = async () => {
    if (!query.trim()) {
      Message.warning('请输入查询内容')
      return
    }
    setSearching(true)
    try {
      const response = await api.search(query.trim(), 'hybrid', { limit, rrf_k: rrfK })
      if (!response.success) throw new Error(response.message || '混合检索失败')
      setResults(Array.isArray(response.results) ? response.results : [])
      setMessageText(response.message || '')
      setSearched(true)
    } catch (error) {
      setResults([])
      setMessageText('')
      setSearched(true)
      Message.error(getErrorMessage(error, '混合检索失败'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <QueryPageFrame
      title="混合检索"
      subtitle="把关键词召回与向量语义召回融合到同一条结果链路里，更适合做复杂场景下的资产定位。"
      summaryItems={summaryItems}
    >
      <Card bodyStyle={{ padding: 16 }}>
        <Form layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item label="查询内容" style={{ flex: 1, minWidth: 320 }}>
            <Input value={query} onChange={setQuery} placeholder="输入既包含关键词、又希望保留语义相似度的查询问题" allowClear />
          </Form.Item>
          <Form.Item label="Top K">
            <InputNumber value={limit} onChange={setLimit} min={1} max={100} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item label="RRF K">
            <InputNumber value={rrfK} onChange={setRrfK} min={10} max={200} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<IconSwap />} onClick={run} loading={searching}>开始融合检索</Button>
          </Form.Item>
        </Form>

        {messageText ? <div className="prd-code-block">{messageText}</div> : null}

        <div style={{ marginTop: 16 }}>
          <SearchResultList results={results} searched={searched} emptyText="当前查询下没有召回相关结果" />
        </div>
      </Card>
    </QueryPageFrame>
  )
}

function buildCopilotSummary(question, sqlPayload, sqlResponse, searchResponse) {
  const parts = []
  if (sqlPayload?.sql) {
    parts.push('已生成 SQL 查询草案')
  }
  if (sqlResponse?.rows?.length) {
    parts.push(`SQL 返回 ${sqlResponse.rows.length} 条结果`)
  }
  if (searchResponse?.results?.length) {
    parts.push(`检索召回 ${searchResponse.results.length} 条相关资产`)
  }
  if (!parts.length) {
    parts.push('当前未获得可展示结果，建议收窄问题范围或明确对象类型')
  }
  return `问题「${question}」处理完成：${parts.join('，')}。`
}

function CopilotTab() {
  const [question, setQuestion] = useState('最近导入的图片资产有哪些，可以先给我结果，再给我可继续验证的 SQL')
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState([
    { key: 'plan', title: '理解问题', status: 'pending', detail: '等待开始分析问题。' },
    { key: 'sql', title: '生成 SQL', status: 'pending', detail: '等待生成可执行查询。' },
    { key: 'execute', title: '执行验证', status: 'pending', detail: '等待执行 SQL 或本地查询。' },
    { key: 'search', title: '检索补充', status: 'pending', detail: '等待根据问题补充相关资产召回。' },
    { key: 'summary', title: '生成结论', status: 'pending', detail: '等待汇总结果。' },
  ])
  const [generatedSql, setGeneratedSql] = useState('')
  const [sqlResult, setSqlResult] = useState(null)
  const [searchResult, setSearchResult] = useState({ results: [], searched: false })
  const [summary, setSummary] = useState('')

  const summaryItems = [
    {
      key: 'mode',
      label: '工作方式',
      value: '透明链路',
      meta: '每一步都展示给用户，不把推理过程藏在黑盒里。',
    },
    {
      key: 'sql',
      label: 'SQL 草案',
      value: generatedSql ? '已生成' : '待生成',
      meta: generatedSql ? '可继续复制、修改或转到 SQL 工作台验证。' : '执行后会先生成可验证的 SQL 草案。',
    },
    {
      key: 'search',
      label: '补充召回',
      value: searchResult.results.length ? `${searchResult.results.length} 条` : '未召回',
      meta: '当问题涉及图片或相似样本时，会补充检索结果帮助解释。',
    },
  ]

  const updateStep = (key, patch) => {
    setSteps((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const runCopilot = async () => {
    if (!question.trim()) {
      Message.warning('请输入问题')
      return
    }

    setRunning(true)
    setGeneratedSql('')
    setSqlResult(null)
    setSearchResult({ results: [], searched: false })
    setSummary('')
    setSteps([
      { key: 'plan', title: '理解问题', status: 'running', detail: '正在解析问题对象、时间范围和结果期望。' },
      { key: 'sql', title: '生成 SQL', status: 'pending', detail: '等待生成可执行查询。' },
      { key: 'execute', title: '执行验证', status: 'pending', detail: '等待执行 SQL 或本地查询。' },
      { key: 'search', title: '检索补充', status: 'pending', detail: '等待根据问题补充相关资产召回。' },
      { key: 'summary', title: '生成结论', status: 'pending', detail: '等待汇总结果。' },
    ])

    let sqlPayload = null
    let sqlResponse = null
    let searchResponse = null

    try {
      updateStep('plan', { status: 'done', detail: '已识别问题中的查询对象，并开始生成可验证的处理路径。' })

      updateStep('sql', { status: 'running', detail: '正在根据自然语言问题生成 SQL 草案。' })
      sqlPayload = await api.convertNlToSql({ prompt: question.trim(), top_k: 10 })
      setGeneratedSql(sqlPayload?.sql || '')
      updateStep('sql', {
        status: sqlPayload?.sql ? 'done' : 'error',
        detail: sqlPayload?.sql ? (sqlPayload.reasoning || '已生成 SQL 草案，可继续执行验证。') : '未生成 SQL。',
      })

      if (sqlPayload?.sql) {
        updateStep('execute', { status: 'running', detail: '正在执行 SQL，验证当前问题是否能直接返回结果。' })
        try {
          const execution = await api.executeDorisSql({ query: sqlPayload.sql, limit: 20 })
          sqlResponse = {
            columns: execution?.columns || [],
            rows: execution?.rows || [],
            message: execution?.message || '',
            affectedRows: execution?.rows?.length || 0,
          }
          setSqlResult(sqlResponse)
          updateStep('execute', {
            status: execution?.success ? 'done' : 'error',
            detail: execution?.success ? `已返回 ${sqlResponse.rows.length} 条结果。` : '执行未返回有效结果。',
          })
        } catch (error) {
          updateStep('execute', { status: 'error', detail: getErrorMessage(error, 'SQL 执行失败。') })
        }
      }

      updateStep('search', { status: 'running', detail: '正在补充相关资产召回，帮助理解上下文和相似样本。' })
      try {
        const vectorGuide = await api.convertNlToVector({ prompt: question.trim(), top_k: 8 })
        const searchMode = vectorGuide?.data?.mode || 'text'
        const response = await api.search(question.trim(), searchMode, 8)
        searchResponse = response
        setSearchResult({ results: response?.results || [], searched: true })
        updateStep('search', {
          status: response?.success ? 'done' : 'error',
          detail: response?.success ? `已补充召回 ${response.results?.length || 0} 条相关资产。` : '未召回到相关资产。',
        })
      } catch (error) {
        setSearchResult({ results: [], searched: true })
        updateStep('search', { status: 'error', detail: getErrorMessage(error, '检索补充失败。') })
      }

      updateStep('summary', { status: 'running', detail: '正在汇总执行结果与检索结果。' })
      const finalSummary = buildCopilotSummary(question.trim(), sqlPayload, sqlResponse, searchResponse)
      setSummary(finalSummary)
      updateStep('summary', { status: 'done', detail: finalSummary })
    } finally {
      setRunning(false)
    }
  }

  return (
    <QueryPageFrame
      title="AI 数据副驾驶"
      subtitle="将问题理解、SQL 生成、执行验证和结果总结串成一条透明链路，适合演示问数和查询辅助能力。"
      summaryItems={summaryItems}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '420px minmax(0, 1fr)', gap: 16 }}>
        <Card title={<Space><IconRobot />对话输入</Space>} bodyStyle={{ padding: 16 }}>
          <TextArea
            value={question}
            onChange={setQuestion}
            autoSize={{ minRows: 6, maxRows: 10 }}
            placeholder="例如：最近导入的图片资产有哪些，给我结果并附上可继续验证的 SQL"
          />
          <Space style={{ marginTop: 12 }} wrap>
            <Button type="primary" icon={<IconRobot />} onClick={runCopilot} loading={running}>开始分析</Button>
            <Button icon={<IconCopy />} disabled={!generatedSql} onClick={() => navigator.clipboard?.writeText(generatedSql)}>复制 SQL</Button>
          </Space>

          {generatedSql ? (
            <Card size="small" style={{ marginTop: 16, background: 'var(--color-fill-1)' }}>
              <Text code copyable style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{generatedSql}</Text>
            </Card>
          ) : null}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={<Space><IconHistory />处理步骤</Space>} bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              {steps.map((step) => (
                <JourneyStep key={step.key} title={step.title} status={step.status} detail={step.detail} />
              ))}
            </div>
          </Card>

          {summary ? (
            <Card title="结论摘要" bodyStyle={{ padding: 16 }}>
              <Paragraph style={{ margin: 0 }}>{summary}</Paragraph>
            </Card>
          ) : null}

          {sqlResult ? (
            <Card title="SQL 执行结果" bodyStyle={{ padding: 16 }}>
              <ResultSummary result={sqlResult} />
              {sqlResult.columns.length ? (
                <Table
                  columns={buildTableColumns(sqlResult.columns)}
                  data={sqlResult.rows}
                  rowKey={(_, index) => index}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 'max-content' }}
                  size="small"
                  border
                />
              ) : (
                <Empty description="当前未返回结构化结果" />
              )}
            </Card>
          ) : null}

          <Card title="相关资产补充" bodyStyle={{ padding: 16 }}>
            <SearchResultList results={searchResult.results} searched={searchResult.searched} emptyText="当前问题下没有补充召回到相关资产" />
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
    if (tab === 'nl2sql') {
      navigate('/lake-query/sql', { replace: true })
    }
  }, [navigate, tab])

  const activeTab = TITLE_MAP[tab] ? tab : 'sql'

  return (
    <div style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      {activeTab === 'sql' && <SqlWorkspaceTab />}
      {activeTab === 'vector' && <VectorSearchTab />}
      {activeTab === 'multimodal' && <MultimodalSearchTab />}
      {activeTab === 'hybrid' && <HybridSearchTab />}
      {activeTab === 'copilot' && <CopilotTab />}
    </div>
  )
}
