import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Avatar,
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
const { Row, Col } = Grid
const { TextArea } = Input
const TabPane = Tabs.TabPane
const Option = Select.Option

const DORIS_BASE = '/api/doris'

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

  const resultColumns = (result?.columns || []).map((column) => ({
    title: column,
    dataIndex: column,
    ellipsis: true,
    render: (value) => (value == null ? <Text type="secondary">NULL</Text> : <Text code>{String(value)}</Text>),
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

  return (
    <div className="prd-page">
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>SQL 查询工作台</Title>
          <Text type="secondary">
            已将 SQL 查询与 NL2SQL 合并到同一页。自然语言生成 SQL、手工编辑、执行验证和历史回填现在走同一条链路。
          </Text>
        </div>
        <div className="prd-page-actions">
          <Text type="secondary">集群</Text>
          <Select
            placeholder="选择集群"
            value={clusterId || undefined}
            onChange={setClusterId}
            style={{ width: 220 }}
          >
            {clusters.map((cluster) => (
              <Option key={cluster.id} value={cluster.id}>
                {cluster.name}
              </Option>
            ))}
          </Select>
          <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>
            刷新历史
          </Button>
        </div>
      </div>

      <div className="prd-summary-band">
        <div className="prd-summary-item">
          <div className="k">当前集群</div>
          <div className="v">{clusters.find((item) => item.id === clusterId)?.name || '未选择集群'}</div>
          <div className="m">编辑器、对象树和 SQL 历史都绑定在当前集群上。</div>
        </div>
        <div className="prd-summary-item">
          <div className="k">合并状态</div>
          <div className="v">SQL + NL2SQL</div>
          <div className="m">自然语言生成 SQL 后会直接写入同一个编辑器，不再拆成两个页面。</div>
        </div>
        <div className="prd-summary-item">
          <div className="k">编辑模式</div>
          <div className="v">Ctrl + Enter</div>
          <div className="m">支持快速执行，也支持从历史记录和对象树一键回填 SQL。</div>
        </div>
        <div className="prd-summary-item">
          <div className="k">历史记录</div>
          <div className="v">{history.length} 条</div>
          <div className="m">保留执行轨迹，便于继续验证生成 SQL 或回看分析过程。</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card
            title={(
              <Space>
                <IconCommand />
                自然语言转 SQL
              </Space>
            )}
            bodyStyle={{ padding: 16 }}
          >
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
              <Button type="primary" icon={<IconCommand />} onClick={handleGenerateSql} loading={converting}>
                生成 SQL
              </Button>
              <Button icon={<IconCopy />} onClick={applyGeneratedSql} disabled={!generatedSql}>
                写入编辑器
              </Button>
            </Space>
            {generatedSql ? (
              <Card size="small" style={{ marginTop: 12, background: 'var(--color-fill-1)' }}>
                <Text code copyable style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
                  {generatedSql}
                </Text>
              </Card>
            ) : null}
          </Card>

          <Card
            title={(
              <Space>
                <IconStorage />
                数据库对象
              </Space>
            )}
            extra={(
              <Select
                size="small"
                placeholder="集群"
                value={clusterId || undefined}
                onChange={setClusterId}
                style={{ width: 140 }}
              >
                {clusters.map((cluster) => (
                  <Option key={cluster.id} value={cluster.id}>
                    {cluster.name}
                  </Option>
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
                  if (node._key.startsWith('db:')) {
                    loadTables(node._key.slice(3))
                  }
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
                <Button type="primary" icon={<IconPlayArrow />} onClick={handleExecute} loading={executing} disabled={!clusterId}>
                  执行 SQL
                </Button>
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
                      columns={resultColumns}
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
                <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>
                  刷新
                </Button>
                <Popconfirm
                  title="确认清空当前集群的 SQL 执行历史？"
                  onOk={async () => {
                    await dorisDelete('/sql/history', { cluster_id: clusterId })
                    Message.success('历史已清空')
                    loadHistory()
                  }}
                >
                  <Button status="danger" icon={<IconDelete />} disabled={!clusterId}>
                    清空历史
                  </Button>
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
    </div>
  )
}

function VectorSearchTab() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('text')
  const [limit, setLimit] = useState(10)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const run = async () => {
    if (!query.trim()) {
      Message.warning('请输入检索内容')
      return
    }
    setSearching(true)
    try {
      const response = await api.search(query.trim(), mode, Number(limit))
      if (!response.success) {
        throw new Error(response.message || '检索失败')
      }
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
    <div className="prd-page">
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>向量检索</Title>
          <Text type="secondary">支持文本语义检索和文搜图，适合快速验证当前向量资产的可用性。</Text>
        </div>
      </div>
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
            <Button type="primary" icon={<IconSearch />} onClick={run} loading={searching}>
              开始检索
            </Button>
          </Form.Item>
        </Form>
        <SearchResultList results={results} searched={searched} />
      </Card>
    </div>
  )
}

function PlaceholderTab({ icon, title, milestone, desc }) {
  return (
    <div className="prd-page">
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>{title}</Title>
          <Text type="secondary">{milestone}</Text>
        </div>
      </div>
      <Card bodyStyle={{ padding: 48, textAlign: 'center' }}>
        <Avatar size={64} style={{ backgroundColor: 'var(--color-primary-light-1)', color: 'rgb(22, 93, 255)', marginBottom: 16 }}>
          {icon}
        </Avatar>
        <Paragraph type="secondary" style={{ maxWidth: 680, margin: '0 auto' }}>
          {desc}
        </Paragraph>
      </Card>
    </div>
  )
}

const TITLE_MAP = {
  sql: 'SQL 查询工作台',
  vector: '向量检索',
  multimodal: '多模态检索',
  hybrid: '混合检索',
  copilot: 'AI 数据副驾驶',
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
      {activeTab === 'multimodal' && (
        <PlaceholderTab
          icon={<IconImage style={{ fontSize: 28 }} />}
          title="多模态检索"
          milestone="后续接入真实跨模态检索链路"
          desc="这一页后续会继续承接文搜图、图搜文、跨模态召回与结果解释。当前先完成 SQL 查询与 NL2SQL 的入口收口，避免分析链路继续割裂。"
        />
      )}
      {activeTab === 'hybrid' && (
        <PlaceholderTab
          icon={<IconSwap style={{ fontSize: 28 }} />}
          title="混合检索"
          milestone="后续接入 RRF 融合检索工作台"
          desc="混合检索会承接关键词与向量结果的联合召回和排序解释。当前先把 SQL 查询工作台合并完整，后续再把检索工作台整体做成统一产品面。"
        />
      )}
      {activeTab === 'copilot' && (
        <PlaceholderTab
          icon={<IconRobot style={{ fontSize: 28 }} />}
          title="AI 数据副驾驶"
          milestone="后续接入推理链路与多步执行面板"
          desc="副驾驶后续会承接自然语言问数、检索调用、SQL 生成、执行验证与总结输出。当前优先把 SQL 查询与 NL2SQL 合并成一条完整链路，作为副驾驶的底层基础。"
        />
      )}
    </div>
  )
}
