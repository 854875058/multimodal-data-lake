import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Button, Space, Table, Tag, Input, Select, Tabs, Form, Typography,
  Empty, Grid, Descriptions, Message, Alert, InputNumber
} from '@arco-design/web-react'
import {
  IconRefresh, IconSettings, IconPlayArrow, IconSearch, IconCommand,
  IconCheckCircle, IconCloseCircle
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatDateTime, truncateText } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { Row, Col } = Grid
const TabPane = Tabs.TabPane
const Option = Select.Option
const TextArea = Input.TextArea

function normalizeDorisStatus(item) {
  if (!item) return null
  return {
    connected: Boolean(item.online),
    status: item.status || (item.online ? '在线' : '离线'),
    message: item.note || '',
    endpoint: item.endpoint || '—',
    latency_ms: item.latency_ms ?? null,
    probed_at: item.probed_at || '',
  }
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(null)
  const [externalTables, setExternalTables] = useState([])
  const [testingDoris, setTestingDoris] = useState(false)
  const [dorisStatus, setDorisStatus] = useState(null)
  const [activeTab, setActiveTab] = useState('sql')

  const [sqlQuery, setSqlQuery] = useState('SHOW TABLES;')
  const [sqlResult, setSqlResult] = useState({ columns: [], rows: [], message: '', mode: '' })
  const [executingSql, setExecutingSql] = useState(false)

  const [externalForm, setExternalForm] = useState({
    table_name: 'lance_vector_table',
    source_path: 'seaweedfs://multimodal/lance_vectors',
    file_format: 'lance',
    schema: 'federated',
    comment: 'Lance 向量外表',
  })
  const [creatingExt, setCreatingExt] = useState(false)

  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产')
  const [generatedSql, setGeneratedSql] = useState('')
  const [convertingSql, setConvertingSql] = useState(false)

  const [vectorPrompt, setVectorPrompt] = useState('红色背景的图片')
  const [convertingVector, setConvertingVector] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('text')
  const [limit, setLimit] = useState(10)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const loadPageData = async () => {
    try {
      const [s, e, c] = await Promise.all([
        api.getPlatformSettings(),
        api.getExternalTables(),
        api.getPlatformComponentStatus('doris'),
      ])
      setSettings(s?.data || null)
      setExternalTables(Array.isArray(e?.items) ? e.items : [])
      setDorisStatus(normalizeDorisStatus(Array.isArray(c?.items) ? c.items[0] : null))
    } catch (err) {
      Message.error(getErrorMessage(err, '加载查询台配置失败'))
    }
  }

  useEffect(() => { loadPageData() }, [])

  const handleTestDoris = async () => {
    if (!settings) return
    setTestingDoris(true)
    try {
      const r = await api.testDorisConnection(settings)
      const c = await api.getPlatformComponentStatus('doris')
      const item = Array.isArray(c?.items) ? c.items[0] : null
      setDorisStatus(item ? normalizeDorisStatus(item) : {
        connected: Boolean(r?.connected),
        status: r?.connected ? '在线' : '离线',
        message: r?.message || '',
        endpoint: settings?.doris_mysql_host ? `${settings.doris_mysql_host}:${settings.doris_mysql_port || 9030}` : '—',
        latency_ms: null, probed_at: '',
      })
      r?.connected ? Message.success(r.message || '连接正常') : Message.warning(r?.message || '连接失败')
    } catch (e) {
      Message.error(getErrorMessage(e, '测试连接失败'))
    } finally {
      setTestingDoris(false)
    }
  }

  const handleCreateExternal = async () => {
    setCreatingExt(true)
    try {
      const r = await api.createExternalTable(externalForm)
      Message.success(r?.message || '外表已保存')
      const e = await api.getExternalTables()
      setExternalTables(Array.isArray(e?.items) ? e.items : [])
      if (r?.data?.sql_preview) setSqlQuery(r.data.sql_preview)
    } catch (e) {
      Message.error(getErrorMessage(e, '创建外表失败'))
    } finally {
      setCreatingExt(false)
    }
  }

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) { Message.warning('请输入 SQL'); return }
    setExecutingSql(true)
    try {
      const r = await api.executeDorisSql({ query: sqlQuery, limit: 20 })
      setSqlResult({
        columns: Array.isArray(r?.columns) ? r.columns : [],
        rows: Array.isArray(r?.rows) ? r.rows : [],
        message: r?.message || '', mode: r?.mode || '',
      })
    } catch (e) {
      setSqlResult({ columns: [], rows: [], message: '', mode: '' })
      Message.error(getErrorMessage(e, 'SQL 执行失败'))
    } finally {
      setExecutingSql(false)
    }
  }

  const handleNlToSql = async () => {
    if (!nlPrompt.trim()) { Message.warning('请输入自然语言'); return }
    setConvertingSql(true)
    try {
      const r = await api.convertNlToSql({ prompt: nlPrompt, top_k: 10 })
      const sql = r?.sql || ''
      setGeneratedSql(sql)
      setSqlQuery(sql)
      setActiveTab('sql')
      Message.success(r?.reasoning || '已生成 SQL')
    } catch (e) {
      Message.error(getErrorMessage(e, 'NL2SQL 失败'))
    } finally {
      setConvertingSql(false)
    }
  }

  const handleNlToVector = async () => {
    if (!vectorPrompt.trim()) { Message.warning('请输入语义描述'); return }
    setConvertingVector(true)
    try {
      const r = await api.convertNlToVector({ prompt: vectorPrompt, top_k: limit })
      const data = r?.data || {}
      setQuery(data.query || vectorPrompt)
      setMode(data.mode || 'text')
      setLimit(Number(data.top_k || 10))
      Message.success(data.command_text || '已生成检索指令')
    } catch (e) {
      Message.error(getErrorMessage(e, '生成检索指令失败'))
    } finally {
      setConvertingVector(false)
    }
  }

  const handleVectorSearch = async () => {
    if (!query.trim()) { Message.warning('请输入检索内容'); return }
    setSearching(true)
    try {
      const r = await api.search(query.trim(), mode, Number(limit))
      if (!r.success) throw new Error(r.message || '检索失败')
      setResults(Array.isArray(r.results) ? r.results : [])
      setSearched(true)
    } catch (e) {
      setResults([])
      setSearched(true)
      Message.error(getErrorMessage(e, '检索失败'))
    } finally {
      setSearching(false)
    }
  }

  const sqlCols = (sqlResult.columns?.length ? sqlResult.columns : Object.keys(sqlResult.rows?.[0] || {}))
    .map(c => ({ title: c, dataIndex: c, render: v => <Text code style={{ fontSize: 12 }}>{String(v ?? '—')}</Text>, ellipsis: true }))

  const dorisEndpoint = settings?.doris_mysql_host ? `${settings.doris_mysql_host}:${settings.doris_mysql_port || 9030}` : '—'

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>查询分析</Title>
          <Text type="secondary">Doris 联邦查询 · NL2SQL · 向量检索</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} onClick={loadPageData}>刷新</Button>
          <Button type="primary" icon={<IconSettings />} onClick={() => navigate('/settings/access')}>来源配置</Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 16 }}>
        <Row gutter={16}>
          <Col span={16}>
            <Space style={{ marginBottom: 12 }}>
              <Title heading={6} style={{ margin: 0 }}>Doris 连接状态</Title>
              {dorisStatus && (
                dorisStatus.connected
                  ? <Tag color="green" icon={<IconCheckCircle />}>{dorisStatus.status}</Tag>
                  : <Tag color="red" icon={<IconCloseCircle />}>{dorisStatus.status}</Tag>
              )}
            </Space>
            <Descriptions
              column={3} size="small"
              data={[
                { label: 'HTTP', value: <Text code>{settings?.doris_http_url || '—'}</Text> },
                { label: 'MySQL', value: <Text code>{dorisEndpoint}</Text> },
                { label: 'Database', value: settings?.doris_database || '—' },
                { label: 'User', value: settings?.doris_user || '—' },
                { label: 'Password', value: settings?.doris_password ? <Tag size="small" color="green">已配置</Tag> : <Tag size="small" color="orange">未配置</Tag> },
                { label: '延迟', value: Number.isFinite(dorisStatus?.latency_ms) ? `${dorisStatus.latency_ms} ms` : '—' },
                { label: '最近探测', value: dorisStatus?.probed_at ? formatDateTime(dorisStatus.probed_at) : '—' },
                { label: '探测说明', value: dorisStatus?.message || '尚未探测' },
              ]}
              labelStyle={{ width: 80 }}
            />
          </Col>
          <Col span={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
              <Button type="primary" icon={<IconCheckCircle />} onClick={handleTestDoris} loading={testingDoris} long>
                测试 Doris 连接
              </Button>
              <Button icon={<IconSettings />} onClick={() => navigate('/settings/access')} long>
                前往来源配置
              </Button>
            </div>
          </Col>
        </Row>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
          <TabPane key="sql" title={<span><IconCommand /> SQL 编辑器</span>} />
          <TabPane key="nl" title={<span><IconCommand /> 自然语言生成</span>} />
          <TabPane key="vector" title={<span><IconSearch /> 向量检索</span>} />
          <TabPane key="external" title="外表创建" />
        </Tabs>

        <div style={{ padding: 16 }}>
          {activeTab === 'sql' && (
            <>
              <TextArea
                value={sqlQuery}
                onChange={setSqlQuery}
                style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, marginBottom: 12 }}
                autoSize={{ minRows: 4, maxRows: 10 }}
              />
              <Space style={{ marginBottom: 16 }}>
                <Button type="primary" icon={<IconPlayArrow />} onClick={handleExecuteSql} loading={executingSql}>执行 SQL</Button>
                <Button onClick={() => setSqlQuery('SHOW TABLES;')}>恢复默认</Button>
                {sqlResult.mode && <Tag color="arcoblue">{sqlResult.mode}</Tag>}
              </Space>
              {generatedSql && (
                <Alert type="info" content={<>NL2SQL 结果：<Text code>{generatedSql}</Text></>} style={{ marginBottom: 12 }} />
              )}
              {sqlResult.message && <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{sqlResult.message}</Text>}
              {sqlResult.rows.length > 0 ? (
                <Table columns={sqlCols} data={sqlResult.rows} rowKey={(_, i) => i} pagination={{ pageSize: 10 }} size="small" border scroll={{ x: 'max-content' }} />
              ) : (
                <Empty description="暂无结果" />
              )}
            </>
          )}

          {activeTab === 'nl' && (
            <Row gutter={24}>
              <Col span={12}>
                <Title heading={6}>NL → SQL</Title>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>用自然语言描述查询意图，自动生成 SQL 草案</Paragraph>
                <TextArea value={nlPrompt} onChange={setNlPrompt} autoSize={{ minRows: 3 }} style={{ marginBottom: 12 }} />
                <Button type="primary" icon={<IconCommand />} onClick={handleNlToSql} loading={convertingSql}>生成 SQL</Button>
                {generatedSql && (
                  <Card size="small" style={{ marginTop: 12 }}>
                    <Text code copyable style={{ fontSize: 12 }}>{generatedSql}</Text>
                  </Card>
                )}
              </Col>
              <Col span={12}>
                <Title heading={6}>NL → 向量检索</Title>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>语义描述自动生成向量检索指令</Paragraph>
                <TextArea value={vectorPrompt} onChange={setVectorPrompt} autoSize={{ minRows: 3 }} style={{ marginBottom: 12 }} />
                <Button type="primary" icon={<IconSearch />} onClick={handleNlToVector} loading={convertingVector}>生成检索指令</Button>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                  推荐模式：<Tag size="small">{mode}</Tag>　Top K：<Tag size="small">{limit}</Tag>
                </Text>
              </Col>
            </Row>
          )}

          {activeTab === 'vector' && (
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
                  <Button type="primary" icon={<IconSearch />} onClick={handleVectorSearch} loading={searching}>开始检索</Button>
                </Form.Item>
              </Form>
              {!searched ? (
                <Empty description="输入查询内容开始检索" />
              ) : results.length === 0 ? (
                <Empty description="没有匹配的结果" />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
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
                </Space>
              )}
            </>
          )}

          {activeTab === 'external' && (
            <>
              <Form layout="vertical" style={{ maxWidth: 720 }}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="表名">
                      <Input value={externalForm.table_name} onChange={v => setExternalForm(f => ({ ...f, table_name: v }))} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="格式">
                      <Select value={externalForm.file_format} onChange={v => setExternalForm(f => ({ ...f, file_format: v }))}>
                        <Option value="lance">lance</Option>
                        <Option value="parquet">parquet</Option>
                        <Option value="json">json</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item label="来源路径">
                      <Input value={externalForm.source_path} onChange={v => setExternalForm(f => ({ ...f, source_path: v }))} />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item label="备注">
                      <Input value={externalForm.comment} onChange={v => setExternalForm(f => ({ ...f, comment: v }))} />
                    </Form.Item>
                  </Col>
                </Row>
                <Button type="primary" onClick={handleCreateExternal} loading={creatingExt}>创建外表定义</Button>
              </Form>
              <Title heading={6} style={{ marginTop: 24 }}>已保存外表</Title>
              {externalTables.length === 0 ? (
                <Empty description="还没有外表定义" />
              ) : (
                <Row gutter={[12, 12]}>
                  {externalTables.map(item => (
                    <Col span={8} key={`${item.table_name}-${item.created_at}`}>
                      <Card size="small" bodyStyle={{ padding: 12 }}>
                        <Text bold>{item.table_name}</Text>
                        <div><Tag size="small" color="arcoblue">{item.file_format}</Tag></div>
                        <Text code style={{ fontSize: 11 }}>{item.source_path}</Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
