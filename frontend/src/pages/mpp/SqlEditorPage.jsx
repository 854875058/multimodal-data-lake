import { useEffect, useRef, useState } from 'react'
import {
  Button, Card, Space, Table, Tag, Tabs, Select, Input, Popconfirm,
  Message, Typography, Empty, Spin, Tree
} from '@arco-design/web-react'
import {
  IconPlayArrow, IconRefresh, IconDelete, IconStorage, IconCommand, IconHistory
} from '@arco-design/web-react/icon'

const { Title, Text } = Typography
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
    method: 'POST',
    credentials: 'include',
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

export default function SqlEditorPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [databases, setDatabases] = useState([])
  const [tablesByDb, setTablesByDb] = useState({})
  const [expandedKeys, setExpandedKeys] = useState([])
  const [sql, setSql] = useState('SELECT 1;')
  const [result, setResult] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [activeTab, setActiveTab] = useState('editor')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    dorisGet('/clusters').then(data => {
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0) setClusterId(list[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!clusterId) return
    setDatabases([])
    setTablesByDb({})
    setExpandedKeys([])
    dorisGet('/sql/databases', { cluster_id: clusterId }).then(data => {
      setDatabases(data.databases || [])
    }).catch(() => {})
  }, [clusterId])

  const loadTables = async (db) => {
    if (tablesByDb[db]) return
    try {
      const data = await dorisGet('/sql/tables', { cluster_id: clusterId, database: db })
      setTablesByDb(prev => ({ ...prev, [db]: data.tables || [] }))
    } catch (e) { /* ignore */ }
  }

  const loadHistory = async () => {
    if (!clusterId) return
    setHistoryLoading(true)
    try {
      const data = await dorisGet('/sql/history', { cluster_id: clusterId, limit: 50 })
      setHistory(data.history || [])
    } catch (e) { /* ignore */ }
    finally { setHistoryLoading(false) }
  }

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [activeTab, clusterId])

  const handleExecute = async () => {
    if (!sql.trim()) return
    if (!clusterId) {
      Message.warning('请先选择集群')
      return
    }
    setExecuting(true)
    setResult(null)
    try {
      const data = await dorisPost('/sql/execute', {
        cluster_id: clusterId,
        sql: sql.trim(),
        limit: 500,
      })
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
    } catch (e) {
      Message.error('执行失败：' + e.message)
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleExecute()
    }
  }

  const insertTable = (db, tableName) => {
    const insert = `SELECT * FROM \`${db}\`.\`${tableName}\` LIMIT 100;`
    setSql(insert)
    setActiveTab('editor')
  }

  const treeData = databases.map(db => ({
    key: `db:${db}`,
    title: (
      <span><IconStorage style={{ marginRight: 6, color: 'var(--color-text-3)' }} />{db}</span>
    ),
    children: (tablesByDb[db] || []).map(t => ({
      key: `tbl:${db}:${t}`,
      title: (
        <span style={{ cursor: 'pointer' }} onClick={() => insertTable(db, t)}>
          <IconCommand style={{ marginRight: 6, color: 'var(--color-text-3)' }} />{t}
        </span>
      ),
      isLeaf: true,
    })),
  }))

  const resultColumns = (result?.columns || []).map(col => ({
    title: col,
    dataIndex: col,
    render: v => v == null ? <Text type="secondary">NULL</Text> : <Text code>{String(v)}</Text>,
    ellipsis: true,
  }))

  const historyColumns = [
    { title: '时间', dataIndex: 'created_at', width: 170 },
    { title: '状态', dataIndex: 'success', width: 80,
      render: v => v ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
    { title: '耗时(s)', dataIndex: 'elapsed', width: 90, render: v => <Text code>{v ?? '—'}</Text> },
    { title: '返回行', width: 80, render: (_, r) => <Text code>{r.rows_returned || r.affected_rows || 0}</Text> },
    { title: 'SQL', dataIndex: 'sql', ellipsis: true,
      render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '操作', width: 90, fixed: 'right',
      render: (_, r) => (
        <Button type="text" size="small" onClick={() => { setSql(r.sql); setActiveTab('editor') }}>回填</Button>
      ) },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>SQL 编辑器</Title>
          <Text type="secondary">面向 Doris 集群的 SQL 查询工具</Text>
        </div>
        <Space>
          <Text type="secondary">集群：</Text>
          <Select
            placeholder="选择集群"
            value={clusterId || undefined}
            onChange={setClusterId}
            style={{ width: 200 }}
          >
            {clusters.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 180px)', minHeight: 560 }}>
        {/* 左侧库表树 */}
        <Card
          title="数据库"
          style={{ width: 280, flexShrink: 0 }}
          bodyStyle={{ padding: 8, overflow: 'auto', height: 'calc(100% - 50px)' }}
        >
          {clusters.length === 0 ? (
            <Empty description="请先注册集群" />
          ) : databases.length === 0 ? (
            <Empty description="暂无数据库" />
          ) : (
            <Tree
              treeData={treeData}
              expandedKeys={expandedKeys}
              onExpand={(keys, { node }) => {
                setExpandedKeys(keys)
                if (node._key.startsWith('db:')) loadTables(node._key.slice(3))
              }}
              blockNode
            />
          )}
        </Card>

        {/* 右侧编辑器 */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }} bodyStyle={{ padding: 0, height: 'calc(100% - 50px)', display: 'flex', flexDirection: 'column' }}>
          <Tabs
            activeTab={activeTab}
            onChange={setActiveTab}
            style={{ padding: '0 16px' }}
          >
            <TabPane key="editor" title={<span><IconCommand /> SQL 编辑器</span>} />
            <TabPane key="history" title={<span><IconHistory /> 执行历史</span>} />
          </Tabs>

          {activeTab === 'editor' && (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ marginBottom: 12 }}>
                <Button
                  type="primary"
                  icon={<IconPlayArrow />}
                  onClick={handleExecute}
                  loading={executing}
                  disabled={!clusterId}
                >
                  执行 (Ctrl+Enter)
                </Button>
              </div>
              <TextArea
                value={sql}
                onChange={setSql}
                onKeyDown={handleKeyDown}
                placeholder="输入 SQL 语句，Ctrl+Enter 执行..."
                style={{
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: 13,
                  minHeight: 180,
                  resize: 'vertical',
                }}
                autoSize={{ minRows: 8, maxRows: 16 }}
              />

              {result && (
                <div style={{ marginTop: 16, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <Space style={{ marginBottom: 8 }} size="large">
                    {result.elapsed != null && <Text type="secondary">耗时：<Text code>{result.elapsed}s</Text></Text>}
                    {result.affectedRows != null && <Text type="secondary">影响：<Text code>{result.affectedRows}</Text> 行</Text>}
                    {result.rows && result.columns.length > 0 && <Text type="secondary">返回：<Text code>{result.rows.length}</Text> 行</Text>}
                    {result.hasMore && <Tag color="orange">已截断（最多 500 行）</Tag>}
                    {result.message && <Text type="success">{result.message}</Text>}
                  </Space>
                  {result.columns.length > 0 ? (
                    <Table
                      columns={resultColumns}
                      data={result.rows}
                      pagination={{ pageSize: 20 }}
                      rowKey={(_, i) => i}
                      scroll={{ x: 'max-content' }}
                      size="small"
                      border
                    />
                  ) : (
                    <Empty description="无结果集" />
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div style={{ padding: 16, flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Space style={{ marginBottom: 12 }}>
                <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>刷新</Button>
                <Popconfirm
                  title="确认清空当前集群的 SQL 历史？"
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
                noDataElement={<Empty description={!clusterId ? '请先选择集群' : '暂无历史记录'} />}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
