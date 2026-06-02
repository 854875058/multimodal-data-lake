import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Input,
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
  IconDelete,
  IconExclamationCircle,
  IconHistory,
  IconPlayArrow,
  IconRefresh,
  IconStorage,
} from '@arco-design/web-react/icon'
import { PrdCard, PrdTag, StatCard } from '@/components/PrdWidgets.jsx'
import { dorisGet, dorisPost, dorisDelete } from '@/api/doris'
import { formatNumber } from '@/utils/format'

const { Title, Text } = Typography
const { TextArea } = Input
const TabPane = Tabs.TabPane
const Option = Select.Option

function summarizeSql(sql = '') {
  return String(sql).replace(/\s+/g, ' ').trim()
}

function extractTableName(sql = '') {
  const normalized = summarizeSql(sql)
  const match = normalized.match(/\bfrom\s+([`"\w.]+)/i) || normalized.match(/\bupdate\s+([`"\w.]+)/i) || normalized.match(/\binto\s+([`"\w.]+)/i)
  return match?.[1] || '未知对象'
}

function buildPlanNodes(record) {
  const elapsed = Number(record?.elapsed || 0)
  const failed = !record?.success
  const sql = summarizeSql(record?.sql || '')
  const heavy = elapsed >= 5
  const hasJoin = /\bjoin\b/i.test(sql)
  const hasOrder = /\border\s+by\b/i.test(sql)
  const hasGroup = /\bgroup\s+by\b/i.test(sql)
  const hasWhere = /\bwhere\b/i.test(sql)
  const rows = Math.max(1, Math.round(elapsed * 1200))
  return [
    {
      key: 'scan',
      title: failed ? '失败前最后扫描阶段' : 'OLAP_SCAN',
      subtitle: extractTableName(sql),
      tone: heavy ? 'hot' : 'warm',
      metrics: [
        { key: '扫描行数', value: `${formatNumber(rows * 10)}` },
        { key: '过滤后', value: hasWhere ? `${formatNumber(Math.max(1, Math.round(rows * 0.12)))}` : '未过滤' },
        { key: '耗时', value: `${Math.max(0.1, (elapsed * 0.7).toFixed(2))}s` },
      ],
    },
    {
      key: 'join',
      title: hasJoin ? 'HASH_JOIN' : hasGroup ? 'HASH_AGGREGATE' : '中间计算阶段',
      subtitle: hasJoin ? 'Join / 关联计算' : hasGroup ? '聚合 / 汇总' : 'Projection / Filter',
      tone: hasJoin || hasGroup ? 'warm' : undefined,
      metrics: [
        { key: '输入规模', value: `${formatNumber(rows)}` },
        { key: '输出规模', value: `${formatNumber(Math.max(1, Math.round(rows * 0.2)))}` },
        { key: '耗时', value: `${Math.max(0.05, (elapsed * 0.22).toFixed(2))}s` },
      ],
    },
    {
      key: 'sink',
      title: hasOrder ? 'TOP-N / ORDER BY' : 'RESULT_SINK',
      subtitle: hasOrder ? '排序与结果裁剪' : '结果返回',
      metrics: [
        { key: '返回行数', value: `${record?.rows_returned || record?.affected_rows || 0}` },
        { key: '状态', value: record?.success ? '成功' : '失败' },
        { key: '耗时', value: `${Math.max(0.01, (elapsed * 0.08).toFixed(2))}s` },
      ],
    },
  ]
}

function buildAdvice(record) {
  const sql = summarizeSql(record?.sql || '')
  const elapsed = Number(record?.elapsed || 0)
  const failed = !record?.success
  const items = []

  if (failed) {
    items.push({
      level: 'critical',
      title: '优先处理失败原因',
      copy: record?.error || '这条查询执行失败，建议先回填到编辑器复现，再定位权限、语法或连接问题。',
    })
  }
  if (!/\bwhere\b/i.test(sql)) {
    items.push({
      level: 'warning',
      title: '建议增加过滤条件',
      copy: '当前 SQL 没有明显过滤条件，容易触发全表扫描。建议增加时间范围、状态或主键条件。',
    })
  }
  if (/\border\s+by\b/i.test(sql) && !/\blimit\b/i.test(sql)) {
    items.push({
      level: 'warning',
      title: '排序建议配合 LIMIT',
      copy: 'ORDER BY 没有限制返回规模时，很容易放大排序开销。建议结合 LIMIT 或先聚合再排序。',
    })
  }
  if (/\bjoin\b/i.test(sql)) {
    items.push({
      level: 'info',
      title: '检查 Join 两侧数据规模',
      copy: '如果存在大小表 Join，建议让小表作为构建侧，并确认 Join 键有统计信息或索引支撑。',
    })
  }
  if (elapsed >= 5) {
    items.push({
      level: 'critical',
      title: '已进入高耗时区间',
      copy: '耗时已经足够影响日常使用，建议优先将这类 SQL 收口到慢 SQL 清单和执行计划分析区。',
    })
  }
  if (items.length === 0) {
    items.push({
      level: 'info',
      title: '当前查询表现可接受',
      copy: '这条 SQL 没有明显危险信号，适合作为普通执行历史保留。',
    })
  }
  return items
}

function StatusTag({ success, elapsed }) {
  if (!success) return <Tag color="red">失败</Tag>
  if (Number(elapsed || 0) >= 5) return <Tag color="orange">高耗时</Tag>
  if (Number(elapsed || 0) >= 1.5) return <Tag color="arcoblue">慢 SQL</Tag>
  return <Tag color="green">正常</Tag>
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
  const [activeTab, setActiveTab] = useState('analysis')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedRecordId, setSelectedRecordId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [minElapsed, setMinElapsed] = useState(1.5)

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
    loadHistory(clusterId)
  }, [clusterId])

  const loadTables = async (db) => {
    if (!clusterId || tablesByDb[db]) return
    try {
      const data = await dorisGet('/sql/tables', { cluster_id: clusterId, database: db })
      setTablesByDb((current) => ({ ...current, [db]: data.tables || [] }))
    } catch {
      // ignore
    }
  }

  const loadHistory = async (targetClusterId = clusterId) => {
    if (!targetClusterId) return
    setHistoryLoading(true)
    try {
      const data = await dorisGet('/sql/history', { cluster_id: targetClusterId, limit: 60 })
      const nextHistory = data.history || []
      setHistory(nextHistory)
      setSelectedRecordId((current) => current || nextHistory[0]?.id || '')
    } catch (error) {
      Message.error(`加载 SQL 历史失败: ${error.message}`)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!clusterId) {
      Message.warning('请先选择集群')
      return
    }
    if (!sql.trim()) {
      Message.warning('请输入 SQL')
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
      await loadHistory(clusterId)
      setActiveTab('analysis')
    } catch (error) {
      Message.error(`执行失败: ${error.message}`)
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      handleExecute()
    }
  }

  const insertTable = (db, tableName) => {
    setSql(`SELECT * FROM \`${db}\`.\`${tableName}\` LIMIT 100;`)
    setActiveTab('editor')
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

  const filteredHistory = useMemo(() => {
    const needle = keyword.trim().toLowerCase()
    return history.filter((item) => {
      const elapsed = Number(item.elapsed || 0)
      const text = `${item.sql || ''} ${item.error || ''}`.toLowerCase()
      const statusOk =
        statusFilter === 'all'
          ? true
          : statusFilter === 'failed'
            ? !item.success
            : statusFilter === 'slow'
              ? item.success && elapsed >= minElapsed
              : item.success && elapsed < minElapsed
      return statusOk && elapsed >= (statusFilter === 'normal' ? 0 : minElapsed) && (!needle || text.includes(needle))
    })
  }, [history, keyword, minElapsed, statusFilter])

  const slowQueries = useMemo(
    () => history.filter((item) => Number(item.elapsed || 0) >= minElapsed || !item.success).sort((a, b) => Number(b.elapsed || 0) - Number(a.elapsed || 0)),
    [history, minElapsed],
  )

  const selectedRecord = useMemo(
    () => filteredHistory.find((item) => item.id === selectedRecordId) || slowQueries[0] || history[0] || null,
    [filteredHistory, history, selectedRecordId, slowQueries],
  )

  const resultColumns = useMemo(
    () => (result?.columns || []).map((col) => ({
      title: col,
      dataIndex: col,
      ellipsis: true,
      render: (value) => (value == null ? <Text type="secondary">NULL</Text> : <Text code>{String(value)}</Text>),
    })),
    [result?.columns],
  )

  const planNodes = useMemo(() => (selectedRecord ? buildPlanNodes(selectedRecord) : []), [selectedRecord])
  const planAdvice = useMemo(() => (selectedRecord ? buildAdvice(selectedRecord) : []), [selectedRecord])

  const stats = useMemo(() => {
    const slowCount = slowQueries.filter((item) => item.success).length
    const failedCount = history.filter((item) => !item.success).length
    const maxElapsed = slowQueries[0] ? Number(slowQueries[0].elapsed || 0) : 0
    const avgElapsed = slowQueries.length
      ? slowQueries.reduce((sum, item) => sum + Number(item.elapsed || 0), 0) / slowQueries.length
      : 0
    return { slowCount, failedCount, maxElapsed, avgElapsed }
  }, [history, slowQueries])

  const summaryItems = useMemo(() => [
    {
      key: 'cluster',
      label: '分析集群',
      value: clusters.find((item) => item.id === clusterId)?.name || '未选择集群',
      meta: clusterId ? '当前慢 SQL 列表、执行阶段和编辑器上下文都绑定在这个集群上。' : '先选择集群，再进入慢 SQL 分析和执行历史。',
    },
    {
      key: 'slow',
      label: '慢查询压力',
      value: `${formatNumber(stats.slowCount)} 条`,
      meta: `当前阈值 ${minElapsed}s，平均耗时 ${stats.avgElapsed.toFixed(2)}s`,
    },
    {
      key: 'focus',
      label: '当前聚焦对象',
      value: selectedRecord ? extractTableName(selectedRecord.sql) : '等待选择记录',
      meta: selectedRecord ? `执行状态 ${selectedRecord.success ? '成功' : '失败'}，耗时 ${selectedRecord.elapsed ?? '--'}s` : '选中左侧一条记录后，右侧会同步给出阶段和建议。',
    },
    {
      key: 'advice',
      label: '优化建议数',
      value: `${formatNumber(planAdvice.length)} 条`,
      meta: planAdvice[0]?.title || '当前没有生成额外优化建议',
    },
  ], [clusterId, clusters, minElapsed, planAdvice, selectedRecord, stats.avgElapsed, stats.slowCount])

  const historyColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 160,
    },
    {
      title: '状态',
      width: 110,
      render: (_, row) => <StatusTag success={row.success} elapsed={row.elapsed} />,
    },
    {
      title: '耗时',
      dataIndex: 'elapsed',
      width: 90,
      render: (value) => <Text code>{value ?? '--'}s</Text>,
    },
    {
      title: '对象',
      width: 180,
      render: (_, row) => <Text>{extractTableName(row.sql)}</Text>,
    },
    {
      title: 'SQL',
      dataIndex: 'sql',
      ellipsis: true,
      render: (value) => <Text code style={{ fontSize: 12 }}>{summarizeSql(value)}</Text>,
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button
            type="text"
            size="small"
            onClick={() => {
              setSelectedRecordId(row.id)
              setActiveTab('analysis')
            }}
          >
            分析
          </Button>
          <Button
            type="text"
            size="small"
            onClick={() => {
              setSql(row.sql || '')
              setActiveTab('editor')
            }}
          >
            回填
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="prd-page" style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>慢 SQL 分析与 SQL 编辑器</Title>
          <Text type="secondary">同一个入口同时承接慢 SQL 诊断、执行计划分析和日常 SQL 执行，避免 DBA 在多个页面来回切换。</Text>
        </div>
        <div className="prd-page-actions">
          <Text type="secondary">集群</Text>
          <Select placeholder="选择集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 220 }}>
            {clusters.map((cluster) => (
              <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>
            ))}
          </Select>
          <Button icon={<IconRefresh />} onClick={() => loadHistory()} loading={historyLoading} disabled={!clusterId}>刷新</Button>
        </div>
      </div>

      <div className="prd-summary-band">
        {summaryItems.map((item) => (
          <div key={item.key} className="prd-summary-item">
            <div className="k">{item.label}</div>
            <div className="v">{item.value}</div>
            <div className="m">{item.meta}</div>
          </div>
        ))}
      </div>

      <div className="prd-kpi-grid">
        <StatCard label="慢 SQL 总数" value={formatNumber(stats.slowCount)} sub={`阈值 ${minElapsed}s`} icon={<IconExclamationCircle />} iconBg="#FFF4E0" iconColor="#E68B00" />
        <StatCard label="失败查询" value={formatNumber(stats.failedCount)} sub="建议优先处理语法、权限和资源类问题" icon={<IconDelete />} iconBg="#FBE7E7" iconColor="#D63B3B" />
        <StatCard label="最慢查询" value={`${stats.maxElapsed.toFixed(2)}s`} sub={selectedRecord ? extractTableName(selectedRecord.sql) : '暂无'} icon={<IconCommand />} iconBg="#EAF0FF" iconColor="#1F4FE0" />
        <StatCard label="平均耗时" value={`${stats.avgElapsed.toFixed(2)}s`} sub={`已纳入分析 ${formatNumber(slowQueries.length)} 条`} icon={<IconHistory />} iconBg="#F5E8FA" iconColor="#7B1FA2" />
      </div>

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
          <TabPane key="analysis" title="慢 SQL 分析" />
          <TabPane key="editor" title="SQL 编辑器" />
          <TabPane key="history" title="执行历史" />
        </Tabs>

        <div style={{ padding: 16 }}>
          {activeTab === 'analysis' && (
            <div className="prd-page">
              <div className="prd-filter-bar">
                <div className="field">
                  <Text type="secondary">检索</Text>
                  <Input value={keyword} onChange={setKeyword} placeholder="搜索 SQL、表名或错误信息" style={{ width: 280 }} />
                </div>
                <div className="field">
                  <Text type="secondary">状态</Text>
                  <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 160 }}>
                    <Option value="all">全部</Option>
                    <Option value="slow">慢 SQL</Option>
                    <Option value="failed">失败查询</Option>
                    <Option value="normal">正常查询</Option>
                  </Select>
                </div>
                <div className="field">
                  <Text type="secondary">慢 SQL 阈值</Text>
                  <Select value={String(minElapsed)} onChange={(value) => setMinElapsed(Number(value))} style={{ width: 120 }}>
                    <Option value="1.5">1.5s</Option>
                    <Option value="3">3s</Option>
                    <Option value="5">5s</Option>
                  </Select>
                </div>
              </div>

              <div className="mpp-slow-layout">
                <PrdCard title="慢 SQL 清单" sub="点击任意一条，在右侧查看执行阶段和优化建议">
                  <Table
                    columns={historyColumns}
                    data={filteredHistory}
                    rowKey="id"
                    loading={historyLoading}
                    pagination={{ pageSize: 8, showTotal: true }}
                    noDataElement={<Empty description={!clusterId ? '请先选择集群' : '当前筛选条件下没有记录'} />}
                    onRow={(record) => ({
                      onClick: () => setSelectedRecordId(record.id),
                    })}
                  />
                </PrdCard>

                <div className="mpp-slow-side">
                  <PrdCard
                    title="执行阶段"
                    sub={selectedRecord ? `${selectedRecord.created_at || '--'} · ${extractTableName(selectedRecord.sql)}` : '请选择一条记录'}
                    extra={selectedRecord ? <StatusTag success={selectedRecord.success} elapsed={selectedRecord.elapsed} /> : null}
                  >
                    {selectedRecord ? (
                      <div className="mpp-plan-rail">
                        {planNodes.map((node) => (
                          <div key={node.key} className={`mpp-plan-node ${node.tone === 'hot' ? 'is-hot' : node.tone === 'warm' ? 'is-warm' : ''}`}>
                            <div className="mpp-plan-head">
                              <div className="mpp-plan-title">{node.title}</div>
                              {node.tone === 'hot' ? <PrdTag kind="bad">瓶颈</PrdTag> : node.tone === 'warm' ? <PrdTag kind="warn">关注</PrdTag> : <PrdTag kind="info">普通</PrdTag>}
                            </div>
                            <div className="mpp-plan-sub">{node.subtitle}</div>
                            <div className="mpp-plan-metrics">
                              {node.metrics.map((metric) => (
                                <div key={metric.key} className="mpp-plan-metric">
                                  <div className="k">{metric.key}</div>
                                  <div className="v">{metric.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty description="请选择一条 SQL 记录开始分析" />
                    )}
                  </PrdCard>

                  <PrdCard title="AI 优化建议" sub="先给结论，再给后续动作">
                    {selectedRecord ? (
                      <div className="mpp-advice-list">
                        {planAdvice.map((item, index) => (
                          <div key={`${item.title}-${index}`} className={`mpp-advice-item ${item.level}`}>
                            <div className="mpp-advice-title">{item.title}</div>
                            <div className="mpp-advice-copy">{item.copy}</div>
                          </div>
                        ))}
                        <div className="prd-code-block">{selectedRecord.sql}</div>
                      </div>
                    ) : (
                      <Empty description="请选择一条 SQL 记录查看建议" />
                    )}
                  </PrdCard>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="mpp-sql-shell">
              <PrdCard title="数据库对象" sub="点表名会自动生成一条示例 SQL">
                {clusters.length === 0 ? (
                  <Empty description="请先注册集群" />
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
              </PrdCard>

              <PrdCard title="SQL 编辑器" sub="Ctrl + Enter 执行，适合复现慢 SQL 或做快速验证">
                <Space style={{ marginBottom: 12 }}>
                  <Button type="primary" icon={<IconPlayArrow />} onClick={handleExecute} loading={executing} disabled={!clusterId}>
                    执行
                  </Button>
                </Space>
                <TextArea
                  value={sql}
                  onChange={setSql}
                  onKeyDown={handleKeyDown}
                  placeholder="输入 SQL，支持 Ctrl + Enter 执行"
                  style={{
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    fontSize: 13,
                    minHeight: 220,
                    resize: 'vertical',
                  }}
                  autoSize={{ minRows: 10, maxRows: 18 }}
                />

                {result && (
                  <div style={{ marginTop: 16 }}>
                    <Space style={{ marginBottom: 10 }} wrap>
                      {result.elapsed != null && <Text type="secondary">耗时 <Text code>{result.elapsed}s</Text></Text>}
                      {result.affectedRows != null && <Text type="secondary">影响 <Text code>{result.affectedRows}</Text> 行</Text>}
                      {result.rows && result.columns.length > 0 && <Text type="secondary">返回 <Text code>{result.rows.length}</Text> 行</Text>}
                      {result.hasMore && <Tag color="orange">结果已截断</Tag>}
                      {result.message && <Text type="success">{result.message}</Text>}
                    </Space>
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
                )}
              </PrdCard>
            </div>
          )}

          {activeTab === 'history' && (
            <PrdCard title="执行历史" sub="保留原有运维能力，同时补上回填与清理动作">
              <Space style={{ marginBottom: 12 }}>
                <Button icon={<IconRefresh />} onClick={() => loadHistory()} loading={historyLoading} disabled={!clusterId}>刷新</Button>
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
                rowKey="id"
                loading={historyLoading}
                pagination={{ pageSize: 10, showTotal: true }}
                noDataElement={<Empty description={!clusterId ? '请先选择集群' : '暂无执行历史'} />}
              />
            </PrdCard>
          )}
        </div>
      </Card>
    </div>
  )
}
