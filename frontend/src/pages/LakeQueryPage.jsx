import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Button, Space, Table, Tag, Tabs, Select, Input, Form, Popconfirm,
  Message, Typography, Empty, Tree, InputNumber, Grid, Avatar
} from '@arco-design/web-react'
import {
  IconPlayArrow, IconRefresh, IconDelete, IconStorage, IconCommand, IconHistory,
  IconSearch, IconCopy, IconImage, IconRobot, IconSwap
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { truncateText } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { Row, Col } = Grid
const TabPane = Tabs.TabPane
const Option = Select.Option
const TextArea = Input.TextArea

const DORIS_BASE = '/api/doris'

async function dorisGet(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPost(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisDelete(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function SqlQueryTab() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [databases, setDatabases] = useState([])
  const [tablesByDb, setTablesByDb] = useState({})
  const [expandedKeys, setExpandedKeys] = useState([])
  const [sql, setSql] = useState('SELECT 1;')
  const [result, setResult] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [subTab, setSubTab] = useState('editor')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    dorisGet('/clusters').then(d => {
      const list = d.clusters || []
      setClusters(list)
      if (list.length > 0) setClusterId(list[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!clusterId) return
    setDatabases([]); setTablesByDb({}); setExpandedKeys([])
    dorisGet('/sql/databases', { cluster_id: clusterId }).then(d => setDatabases(d.databases || [])).catch(() => {})
  }, [clusterId])

  const loadTables = async (db) => {
    if (tablesByDb[db]) return
    try {
      const d = await dorisGet('/sql/tables', { cluster_id: clusterId, database: db })
      setTablesByDb(prev => ({ ...prev, [db]: d.tables || [] }))
    } catch { /* */ }
  }

  const loadHistory = async () => {
    if (!clusterId) return
    setHistoryLoading(true)
    try {
      const d = await dorisGet('/sql/history', { cluster_id: clusterId, limit: 50 })
      setHistory(d.history || [])
    } catch { /* */ }
    finally { setHistoryLoading(false) }
  }

  useEffect(() => { if (subTab === 'history') loadHistory() }, [subTab, clusterId])

  const handleExecute = async () => {
    if (!sql.trim()) return
    if (!clusterId) { Message.warning('请先选择集群'); return }
    setExecuting(true); setResult(null)
    try {
      const d = await dorisPost('/sql/execute', { cluster_id: clusterId, sql: sql.trim(), limit: 500 })
      if (!d.success) { Message.error(d.detail || '执行失败'); return }
      setResult({
        columns: d.columns || [], rows: d.rows || [],
        affectedRows: d.affected_rows, elapsed: d.elapsed,
        hasMore: d.has_more, message: d.message,
      })
    } catch (e) {
      Message.error('执行失败：' + e.message)
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault(); handleExecute()
    }
  }

  const insertTable = (db, t) => {
    setSql(`SELECT * FROM \`${db}\`.\`${t}\` LIMIT 100;`)
    setSubTab('editor')
  }

  const treeData = databases.map(db => ({
    key: `db:${db}`,
    title: <span><IconStorage style={{ marginRight: 6, color: 'var(--color-text-3)' }} />{db}</span>,
    children: (tablesByDb[db] || []).map(t => ({
      key: `tbl:${db}:${t}`,
      title: <span style={{ cursor: 'pointer' }} onClick={() => insertTable(db, t)}>
        <IconCommand style={{ marginRight: 6, color: 'var(--color-text-3)' }} />{t}
      </span>,
      isLeaf: true,
    })),
  }))

  const resultColumns = (result?.columns || []).map(col => ({
    title: col, dataIndex: col,
    render: v => v == null ? <Text type="secondary">NULL</Text> : <Text code>{String(v)}</Text>,
    ellipsis: true,
  }))

  const historyColumns = [
    { title: '时间', dataIndex: 'created_at', width: 170 },
    { title: '状态', dataIndex: 'success', width: 80, render: v => v ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
    { title: '耗时(s)', dataIndex: 'elapsed', width: 90, render: v => <Text code>{v ?? '—'}</Text> },
    { title: '返回行', width: 80, render: (_, r) => <Text code>{r.rows_returned || r.affected_rows || 0}</Text> },
    { title: 'SQL', dataIndex: 'sql', ellipsis: true, render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '操作', width: 90, fixed: 'right',
      render: (_, r) => <Button type="text" size="small" onClick={() => { setSql(r.sql); setSubTab('editor') }}>回填</Button>,
    },
  ]

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 260px)', minHeight: 520 }}>
      <Card title={<Space><IconStorage />数据库</Space>}
        extra={
          <Select size="small" placeholder="集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 130 }}>
            {clusters.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>
        }
        style={{ width: 280, flexShrink: 0 }}
        bodyStyle={{ padding: 8, overflow: 'auto', height: 'calc(100% - 50px)' }}>
        {clusters.length === 0 ? <Empty description="请先在湖运维注册集群" />
          : databases.length === 0 ? <Empty description="暂无数据库" />
          : <Tree treeData={treeData} expandedKeys={expandedKeys}
              onExpand={(keys, { node }) => {
                setExpandedKeys(keys)
                if (node._key.startsWith('db:')) loadTables(node._key.slice(3))
              }} blockNode />}
      </Card>

      <Card style={{ flex: 1 }} bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Tabs activeTab={subTab} onChange={setSubTab} style={{ padding: '0 16px' }}>
          <TabPane key="editor" title={<span><IconCommand /> 编辑器</span>} />
          <TabPane key="history" title={<span><IconHistory /> 历史</span>} />
        </Tabs>

        {subTab === 'editor' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ marginBottom: 12 }}>
              <Button type="primary" icon={<IconPlayArrow />} onClick={handleExecute} loading={executing} disabled={!clusterId}>
                执行 (Ctrl+Enter)
              </Button>
            </div>
            <TextArea value={sql} onChange={setSql} onKeyDown={handleKeyDown}
              placeholder="输入 SQL 语句，Ctrl+Enter 执行..."
              style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }}
              autoSize={{ minRows: 8, maxRows: 16 }} />
            {result && (
              <div style={{ marginTop: 16, flex: 1, minHeight: 0 }}>
                <Space style={{ marginBottom: 8 }} size="large">
                  {result.elapsed != null && <Text type="secondary">耗时：<Text code>{result.elapsed}s</Text></Text>}
                  {result.affectedRows != null && <Text type="secondary">影响：<Text code>{result.affectedRows}</Text> 行</Text>}
                  {result.rows && result.columns.length > 0 && <Text type="secondary">返回：<Text code>{result.rows.length}</Text> 行</Text>}
                  {result.hasMore && <Tag color="orange">已截断</Tag>}
                </Space>
                {result.columns.length > 0
                  ? <Table columns={resultColumns} data={result.rows} pagination={{ pageSize: 20 }} rowKey={(_, i) => i} scroll={{ x: 'max-content' }} size="small" border />
                  : <Empty description="无结果集" />}
              </div>
            )}
          </div>
        )}

        {subTab === 'history' && (
          <div style={{ padding: 16, flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Space style={{ marginBottom: 12 }}>
              <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>刷新</Button>
              <Popconfirm title="确认清空当前集群的 SQL 历史？"
                onOk={async () => { await dorisDelete('/sql/history', { cluster_id: clusterId }); Message.success('已清空'); loadHistory() }}>
                <Button status="danger" icon={<IconDelete />} disabled={!clusterId}>清空历史</Button>
              </Popconfirm>
            </Space>
            <Table columns={historyColumns} data={history} loading={historyLoading} rowKey="id"
              pagination={{ pageSize: 10, showTotal: true }}
              noDataElement={<Empty description={!clusterId ? '请先选择集群' : '暂无历史'} />} />
          </div>
        )}
      </Card>
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
    if (!query.trim()) { Message.warning('请输入检索内容'); return }
    setSearching(true)
    try {
      const r = await api.search(query.trim(), mode, Number(limit))
      if (!r.success) throw new Error(r.message || '检索失败')
      setResults(Array.isArray(r.results) ? r.results : [])
      setSearched(true)
    } catch (e) {
      setResults([]); setSearched(true)
      Message.error(getErrorMessage(e, '检索失败'))
    } finally { setSearching(false) }
  }

  return (
    <>
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item label="查询内容" style={{ flex: 1, minWidth: 300 }}>
          <Input value={query} onChange={setQuery} placeholder="语义描述、关键词或图片描述" allowClear />
        </Form.Item>
        <Form.Item label="模式">
          <Select value={mode} onChange={setMode} style={{ width: 100 }}>
            <Option value="text">文本</Option>
            <Option value="image">图像</Option>
          </Select>
        </Form.Item>
        <Form.Item label="Top K">
          <InputNumber value={limit} onChange={setLimit} min={1} max={100} style={{ width: 90 }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" icon={<IconSearch />} onClick={run} loading={searching}>开始检索</Button>
        </Form.Item>
      </Form>
      {!searched ? <Empty description="输入查询内容开始检索" />
        : results.length === 0 ? <Empty description="没有匹配的结果" />
        : <Space direction="vertical" style={{ width: '100%' }}>
            {results.map((r, i) => (
              <Card key={`${r.file_hash}-${i}`} bodyStyle={{ padding: 16 }} hoverable>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <Title heading={6} style={{ margin: 0 }}>{r.doc_name || '未命名文件'}</Title>
                    <Space size="small" style={{ marginTop: 4 }}>
                      <Tag color="arcoblue">{r.doc_type || '未知'}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>距离 {Number(r.distance ?? 0).toFixed(4)}</Text>
                    </Space>
                  </div>
                  <Tag>#{i + 1}</Tag>
                </div>
                <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                  {truncateText(r.text || '该结果暂无文本摘要', 200)}
                </Paragraph>
                <Text type="secondary" style={{ fontSize: 11 }}>来源：{r.source_uri || '本地入库'}</Text>
              </Card>
            ))}
          </Space>}
    </>
  )
}

function NL2SqlTab({ onJumpToSql }) {
  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产')
  const [generatedSql, setGeneratedSql] = useState('')
  const [converting, setConverting] = useState(false)

  const run = async () => {
    if (!nlPrompt.trim()) { Message.warning('请输入自然语言'); return }
    setConverting(true)
    try {
      const r = await api.convertNlToSql({ prompt: nlPrompt, top_k: 10 })
      setGeneratedSql(r?.sql || '')
      Message.success(r?.reasoning || '已生成 SQL 草案')
    } catch (e) {
      Message.error(getErrorMessage(e, 'NL2SQL 失败'))
    } finally { setConverting(false) }
  }

  const copyAndJump = async () => {
    if (!generatedSql) return
    try { await navigator.clipboard?.writeText(generatedSql) } catch { /* */ }
    Message.success('SQL 已复制，跳转到 SQL 查询')
    onJumpToSql && onJumpToSql(generatedSql)
  }

  return (
    <Row gutter={24}>
      <Col span={14}>
        <Title heading={6}>用自然语言写 SQL</Title>
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          描述你想查询的内容，AI 自动生成对应的 Doris SQL，可一键带入「SQL 查询」执行
        </Paragraph>
        <TextArea value={nlPrompt} onChange={setNlPrompt} autoSize={{ minRows: 4, maxRows: 8 }} style={{ marginBottom: 12 }} />
        <Space>
          <Button type="primary" icon={<IconCommand />} onClick={run} loading={converting}>生成 SQL</Button>
          {generatedSql && <Button icon={<IconCopy />} onClick={copyAndJump}>复制并跳转执行</Button>}
        </Space>
        {generatedSql && (
          <Card size="small" style={{ marginTop: 12 }}>
            <Text code copyable style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{generatedSql}</Text>
          </Card>
        )}
      </Col>
      <Col span={10}>
        <Card title="提示词技巧" bodyStyle={{ padding: 16 }} style={{ background: 'var(--color-fill-1)' }}>
          <Space direction="vertical" size="small">
            <Text>· 明确指定字段：例如「按 doc_type 分组」</Text>
            <Text>· 限定时间范围：例如「最近 7 天」</Text>
            <Text>· 说明聚合方式：例如「按数量倒序」</Text>
            <Text>· 给出表名：例如「从 files 表查」</Text>
          </Space>
        </Card>
      </Col>
    </Row>
  )
}

function PlaceholderTab({ icon, title, milestone, desc }) {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <Avatar size={64} style={{ backgroundColor: 'var(--color-primary-light-1)', color: 'rgb(22, 93, 255)', marginBottom: 16 }}>
        {icon}
      </Avatar>
      <Title heading={5} style={{ marginBottom: 8 }}>{title}</Title>
      <Tag color="arcoblue" style={{ marginBottom: 16 }}>{milestone}</Tag>
      <Paragraph type="secondary" style={{ maxWidth: 600, margin: '0 auto', fontSize: 14 }}>
        {desc}
      </Paragraph>
      <Tag color="orange" style={{ marginTop: 24 }}>规划中</Tag>
    </div>
  )
}

const TITLE_MAP = {
  sql: 'SQL 查询',
  vector: '向量检索',
  multimodal: '多模态检索',
  hybrid: '混合检索',
  nl2sql: 'NL2SQL',
  copilot: 'AI 数据副驾驶',
}

export default function LakeQueryPage() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const activeTab = TITLE_MAP[tab] ? tab : 'sql'

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <Title heading={5} style={{ margin: 0 }}>{TITLE_MAP[activeTab]}</Title>
        <Text type="secondary">湖查询 · {TITLE_MAP[activeTab]}</Text>
      </div>

      <Card bodyStyle={{ padding: 16 }}>
        {activeTab === 'sql' && <SqlQueryTab />}
        {activeTab === 'vector' && <VectorSearchTab />}
        {activeTab === 'multimodal' && (
          <PlaceholderTab
            icon={<IconImage style={{ fontSize: 28 }} />}
            title="多模态检索"
            milestone="M4 · 跨模态向量检索"
            desc="支持 文本 ↔ 图像 ↔ 音频 跨模态检索：用文本检索图片、用图片检索文本、用音频检索视频片段。基于 CLIP / Whisper 多模态向量索引，返回带模态标签的统一结果集。"
          />
        )}
        {activeTab === 'hybrid' && (
          <PlaceholderTab
            icon={<IconSwap style={{ fontSize: 28 }} />}
            title="混合检索"
            milestone="M4-3 · BM25 + 向量 RRF 融合"
            desc="将 BM25 关键词召回和向量语义召回通过 Reciprocal Rank Fusion 融合，平衡精确匹配和语义相似度。后端 Lance 已就绪 RRF 模式，前端将提供融合权重、召回数量、降权策略等可视化配置。"
          />
        )}
        {activeTab === 'nl2sql' && <NL2SqlTab onJumpToSql={() => navigate('/lake-query/sql')} />}
        {activeTab === 'copilot' && (
          <PlaceholderTab
            icon={<IconRobot style={{ fontSize: 28 }} />}
            title="AI 数据副驾驶"
            milestone="M5-5 · LangGraph 编排"
            desc="用自然语言提问，AI 自动检索元数据 → 生成 SQL → 执行 → 总结。每一步都可追溯，并能调用 nl2sql / vector_search / chart_recommend 等 MCP 工具。"
          />
        )}
      </Card>
    </div>
  )
}
