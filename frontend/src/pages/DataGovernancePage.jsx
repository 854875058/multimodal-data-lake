import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Descriptions,
  Empty,
  Input,
  Message,
  Select,
  Space,
  Spin,
  Table,
  Typography,
} from '@arco-design/web-react'
import {
  IconCheckCircle,
  IconFile,
  IconHistory,
  IconRefresh,
  IconSafe,
  IconSearch,
  IconStorage,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import PreviewModal from '@/components/PreviewModal.jsx'
import { PrdCard, PrdTag, StatCard } from '@/components/PrdWidgets.jsx'
import { formatDateTime, formatNumber } from '@/utils/format'

const { Title, Text } = Typography
const Option = Select.Option

const initialPreview = { open: false, loading: false, preview: null, error: '' }

const versionTableMap = {
  files: 'files',
  text_chunks: 'text',
  image_chunks: 'image',
}

function normalizeDataset(item, versionStatsMap, externalTableMap) {
  const tableName = item.name
  const versionKey = versionTableMap[tableName] || null
  const versionInfo = versionKey ? versionStatsMap[versionKey] : null
  const externalInfo = externalTableMap[tableName] || null
  const rowCount = Number(item.row_count ?? versionInfo?.num_rows ?? 0)
  const schemaCount = Array.isArray(versionInfo?.schema) ? versionInfo.schema.length : undefined
  const engine = item.engine || (externalInfo ? 'Doris External' : 'Catalog View')
  const datasetType = versionKey ? 'lance' : engine === 'Doris External' ? 'external' : 'catalog'

  return {
    ...item,
    engine,
    externalInfo,
    rowCount,
    schemaCount,
    versionKey,
    currentVersion: versionInfo?.version ?? null,
    versioned: Boolean(versionKey),
    datasetType,
    qualifiedName: `${item.catalog}.${item.schema}.${item.name}`,
  }
}

function buildGovernanceTags(dataset, detail) {
  if (!dataset || !detail) return []
  const tags = []
  tags.push(dataset.versioned ? { kind: 'success', text: '版本治理' } : { kind: 'info', text: '目录资产' })
  tags.push(dataset.datasetType === 'external' ? { kind: 'warning', text: '外表映射' } : { kind: 'info', text: detail.engine || '资产视图' })
  if ((detail.columns || []).length >= 8) {
    tags.push({ kind: 'purple', text: '宽表结构' })
  }
  if ((detail.sample_rows || []).length > 0) {
    tags.push({ kind: 'success', text: '样本可预览' })
  }
  return tags
}

function buildOwnershipSummary(dataset) {
  if (!dataset) return []
  const owner = dataset.datasetType === 'external' ? '湖查询联邦组' : dataset.versioned ? '多模态资产组' : '湖仓治理组'
  const steward = dataset.datasetType === 'lance' ? 'Lance 数据管理员' : '元数据管理员'
  const sla = dataset.datasetType === 'external' ? '查询口径按天校验' : '接入后 15 分钟内更新目录'
  return [
    { label: '归属团队', value: owner },
    { label: '治理责任人', value: steward },
    { label: '服务承诺', value: sla },
  ]
}

function buildAccessSummary(dataset) {
  if (!dataset) return []
  const policies = [
    { role: '管理员', scope: '全量访问 / 回滚 / 压缩', kind: 'danger' },
    { role: '分析人员', scope: dataset.datasetType === 'external' ? 'SQL 查询 / 结果下载' : '样本查看 / 结构检索', kind: 'info' },
    { role: '接入任务', scope: dataset.versioned ? '写入新版本 / 索引更新' : '目录登记 / 血缘同步', kind: 'success' },
  ]
  if (dataset.datasetType === 'external') {
    policies.push({ role: '共享调用', scope: '只读映射 / 联邦查询', kind: 'warning' })
  }
  return policies
}

function buildLineage(dataset) {
  if (!dataset) return []
  if (dataset.datasetType === 'external') {
    return [
      { title: '源数据注册', copy: '接入任务将结构与存储位置登记到统一目录。', state: 'done' },
      { title: '外表映射', copy: 'Doris 外表映射到查询域，提供统一 SQL 访问入口。', state: 'active' },
      { title: '消费分析', copy: '面向慢 SQL、看板查询和 AI 副驾驶提供下游消费。', state: 'pending' },
    ]
  }
  if (dataset.versioned) {
    return [
      { title: '来源接入', copy: '文件或对象源进入湖存储接入链路。', state: 'done' },
      { title: 'Lance 数据集', copy: '资产切片、向量化和版本快照沉淀在 Lance。', state: 'active' },
      { title: '查询消费', copy: '通过检索工作台、SQL 或外表提供下游能力。', state: 'pending' },
    ]
  }
  return [
    { title: '目录登记', copy: '元数据进入 catalog、schema、table 三级目录。', state: 'done' },
    { title: '治理编目', copy: '补齐结构、责任、权限和样本信息。', state: 'active' },
    { title: '下游发布', copy: '提供给查询、看板或任务编排复用。', state: 'pending' },
  ]
}

function buildRecommendedActions(dataset, detail, versions) {
  if (!dataset || !detail) return []
  const actions = []
  if (!dataset.versioned) actions.push('补充版本快照策略，统一纳入版本治理口径。')
  if ((detail.columns || []).length <= 2) actions.push('当前字段较少，建议补充业务属性与治理标签。')
  if ((detail.sample_rows || []).length === 0) actions.push('暂无样本快照，建议补充抽样预览能力。')
  if (dataset.datasetType === 'external') actions.push('核验外表路径和查询口径，避免联邦映射偏移。')
  if (Array.isArray(versions) && versions.length >= 4) actions.push('版本较多，建议安排一次 compaction 优化查询与存储。')
  return actions.slice(0, 4)
}

function MiniSchemaTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <Empty description="暂无字段结构" />
  }

  return (
    <Table
      size="small"
      pagination={false}
      border={false}
      rowKey={(record, index) => `${record.name}-${index}`}
      columns={[
        {
          title: '字段名',
          dataIndex: 'name',
          render: (value) => <Text style={{ fontWeight: 700 }}>{value}</Text>,
        },
        {
          title: '类型',
          dataIndex: 'type',
          render: (value) => <Text code>{String(value || '--')}</Text>,
        },
      ]}
      data={rows}
    />
  )
}

function MiniSampleTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <Empty description="暂无样本数据" />
  }

  const keys = Object.keys(rows[0] || {}).slice(0, 6)
  const columns = keys.map((key) => ({
    title: key,
    dataIndex: key,
    ellipsis: true,
    render: (value) => <Text style={{ fontSize: 12 }}>{String(value ?? '--')}</Text>,
  }))

  return (
    <Table
      size="small"
      border={false}
      pagination={false}
      rowKey={(_, index) => index}
      columns={columns}
      data={rows}
      scroll={{ x: 'max-content' }}
    />
  )
}

export default function DataGovernancePage() {
  const [catalogs, setCatalogs] = useState([])
  const [schemas, setSchemas] = useState([])
  const [tables, setTables] = useState([])
  const [versionStats, setVersionStats] = useState([])
  const [externalTables, setExternalTables] = useState([])
  const [versionList, setVersionList] = useState([])
  const [selectedCatalog, setSelectedCatalog] = useState('')
  const [selectedSchema, setSelectedSchema] = useState('')
  const [selectedTable, setSelectedTable] = useState('')
  const [assetDetail, setAssetDetail] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [versionLoading, setVersionLoading] = useState(false)
  const [previewState, setPreviewState] = useState(initialPreview)

  const versionStatsMap = useMemo(
    () => Object.fromEntries((versionStats || []).map((item) => [item.table, item])),
    [versionStats],
  )

  const externalTableMap = useMemo(
    () => Object.fromEntries((externalTables || []).map((item) => [item.table_name, item])),
    [externalTables],
  )

  const datasets = useMemo(
    () => (tables || []).map((item) => normalizeDataset(item, versionStatsMap, externalTableMap)),
    [tables, versionStatsMap, externalTableMap],
  )

  const filteredDatasets = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (!query) return datasets
    return datasets.filter((item) => {
      const haystack = [item.name, item.label, item.description, item.engine, item.qualifiedName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [datasets, keyword])

  const selectedDataset = useMemo(
    () => datasets.find((item) => item.name === selectedTable) || null,
    [datasets, selectedTable],
  )

  const governanceTags = useMemo(() => buildGovernanceTags(selectedDataset, assetDetail), [assetDetail, selectedDataset])
  const ownershipSummary = useMemo(() => buildOwnershipSummary(selectedDataset), [selectedDataset])
  const accessSummary = useMemo(() => buildAccessSummary(selectedDataset), [selectedDataset])
  const lineageItems = useMemo(() => buildLineage(selectedDataset), [selectedDataset])
  const recommendedActions = useMemo(
    () => buildRecommendedActions(selectedDataset, assetDetail, versionList),
    [assetDetail, selectedDataset, versionList],
  )

  const summaryStats = useMemo(() => {
    const versionedCount = datasets.filter((item) => item.versioned).length
    const externalCount = datasets.filter((item) => item.datasetType === 'external').length
    const totalRows = datasets.reduce((sum, item) => sum + Number(item.rowCount || 0), 0)
    return [
      {
        label: '目录数据集',
        value: formatNumber(datasets.length),
        sub: `${selectedCatalog || '--'} / ${selectedSchema || '--'}`,
        icon: <IconStorage />,
        iconBg: 'rgba(22, 93, 255, 0.10)',
      },
      {
        label: '版本化数据集',
        value: formatNumber(versionedCount),
        sub: versionedCount > 0 ? '已纳入 Lance 版本治理' : '当前目录暂无版本快照',
        icon: <IconHistory />,
        iconBg: 'rgba(18, 184, 134, 0.12)',
        iconColor: '#12b886',
      },
      {
        label: '外表映射',
        value: formatNumber(externalCount),
        sub: `${formatNumber(externalTables.length)} 个全局外表定义`,
        icon: <IconFile />,
        iconBg: 'rgba(245, 159, 0, 0.14)',
        iconColor: '#d97706',
      },
      {
        label: '目录总行数',
        value: formatNumber(totalRows),
        sub: '按当前 schema 口径汇总',
        icon: <IconSafe />,
        iconBg: 'rgba(88, 86, 214, 0.10)',
        iconColor: '#5856d6',
      },
    ]
  }, [datasets, externalTables.length, selectedCatalog, selectedSchema])

  const loadCatalogs = async () => {
    const response = await api.getAssetCatalogs()
    const list = Array.isArray(response?.items) ? response.items : []
    setCatalogs(list)
    setSelectedCatalog((current) => current || list[0]?.name || '')
  }

  const loadSchemas = async (catalog) => {
    if (!catalog) {
      setSchemas([])
      setSelectedSchema('')
      return
    }
    const response = await api.getAssetSchemas(catalog)
    const list = Array.isArray(response?.items) ? response.items : []
    setSchemas(list)
    setSelectedSchema((current) => {
      if (current && list.some((item) => item.name === current)) return current
      return list[0]?.name || ''
    })
  }

  const loadTables = async (catalog, schema) => {
    if (!catalog || !schema) {
      setTables([])
      setSelectedTable('')
      return
    }
    const response = await api.getAssetTables(catalog, schema)
    const list = (Array.isArray(response?.items) ? response.items : []).map((item) => ({ ...item, catalog, schema }))
    setTables(list)
    setSelectedTable((current) => {
      if (current && list.some((item) => item.name === current)) return current
      return list[0]?.name || ''
    })
  }

  const loadDetail = async (catalog, schema, table) => {
    if (!catalog || !schema || !table) {
      setAssetDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const response = await api.getAssetDetail(catalog, schema, table, 8)
      setAssetDetail(response?.data || null)
    } catch (error) {
      setAssetDetail(null)
      Message.error(getErrorMessage(error, '加载治理详情失败'))
    } finally {
      setDetailLoading(false)
    }
  }

  const loadVersionStats = async () => {
    try {
      const response = await api.getVersionStats()
      setVersionStats(Array.isArray(response?.stats) ? response.stats : [])
    } catch {
      setVersionStats([])
    }
  }

  const loadVersionList = async (tableKey) => {
    if (!tableKey) {
      setVersionList([])
      return
    }
    setVersionLoading(true)
    try {
      const response = await api.getTableVersions(tableKey)
      setVersionList(Array.isArray(response?.versions) ? response.versions : [])
    } catch (error) {
      setVersionList([])
      Message.error(getErrorMessage(error, '加载版本历史失败'))
    } finally {
      setVersionLoading(false)
    }
  }

  const loadExternalTables = async () => {
    try {
      const response = await api.getExternalTables()
      setExternalTables(Array.isArray(response?.items) ? response.items : [])
    } catch {
      setExternalTables([])
    }
  }

  const refreshPage = async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadCatalogs(), loadVersionStats(), loadExternalTables()])
    } catch (error) {
      Message.error(getErrorMessage(error, '刷新数据治理目录失败'))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refreshPage()
  }, [])

  useEffect(() => {
    loadSchemas(selectedCatalog).catch(() => {})
  }, [selectedCatalog])

  useEffect(() => {
    loadTables(selectedCatalog, selectedSchema).catch(() => {})
  }, [selectedCatalog, selectedSchema])

  useEffect(() => {
    loadDetail(selectedCatalog, selectedSchema, selectedTable).catch(() => {})
  }, [selectedCatalog, selectedSchema, selectedTable])

  useEffect(() => {
    loadVersionList(selectedDataset?.versionKey || '').catch(() => {})
  }, [selectedDataset?.versionKey])

  const handlePreview = async (fileHash) => {
    setPreviewState({ open: true, loading: true, preview: null, error: '' })
    try {
      const response = await api.previewFile(fileHash)
      setPreviewState({ open: true, loading: false, preview: response, error: '' })
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        preview: null,
        error: getErrorMessage(error, '加载样本预览失败'),
      })
    }
  }

  return (
    <div className="dataset-page">
      <div className="dataset-header">
        <div>
          <Title heading={4} style={{ margin: 0 }}>
            数据治理目录
          </Title>
          <Text type="secondary">
            统一查看目录资产、版本快照、样本结构和治理责任信息。
          </Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} loading={refreshing} onClick={refreshPage}>
            刷新目录
          </Button>
        </Space>
      </div>

      <div className="dataset-hero">
        <div>
          <div className="dataset-hero-kicker">Governance Catalog</div>
          <div className="dataset-hero-title">
            {selectedDataset?.label || selectedDataset?.name || '选择一个数据集查看治理详情'}
          </div>
          <div className="dataset-hero-copy">
            {assetDetail?.description || '当前页面聚合 catalog、schema、表级元数据与版本信息，用于汇报和治理巡检。'}
          </div>
          <div className="dataset-hero-tags">
            {governanceTags.map((tag) => (
              <PrdTag key={tag.text} kind={tag.kind}>
                {tag.text}
              </PrdTag>
            ))}
          </div>
        </div>
        <div className="dataset-hero-side">
          <div className="dataset-hero-side-label">当前治理范围</div>
          <div className="dataset-hero-side-value">
            {selectedCatalog || '--'} / {selectedSchema || '--'}
          </div>
          <div className="dataset-hero-side-copy">选中数据集：{selectedDataset?.qualifiedName || '--'}</div>
        </div>
      </div>

      <div className="prd-stat-grid governance-stat-grid">
        {summaryStats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <div className="governance-directory-layout">
        <div className="governance-directory-side">
          <PrdCard title="目录筛选" sub="按 catalog、schema 与关键字快速定位治理对象">
            <div className="governance-filter-stack">
              <Select placeholder="选择 catalog" value={selectedCatalog} onChange={setSelectedCatalog}>
                {catalogs.map((item) => (
                  <Option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </Option>
                ))}
              </Select>
              <Select placeholder="选择 schema" value={selectedSchema} onChange={setSelectedSchema}>
                {schemas.map((item) => (
                  <Option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </Option>
                ))}
              </Select>
              <Input
                allowClear
                prefix={<IconSearch />}
                placeholder="搜索数据集、描述或引擎"
                value={keyword}
                onChange={setKeyword}
              />
            </div>
          </PrdCard>

          <PrdCard title="数据集目录" sub={`当前命中 ${formatNumber(filteredDatasets.length)} 个数据集`}>
            <div className="dataset-list">
              {filteredDatasets.length === 0 ? (
                <Empty description="当前筛选条件下暂无数据集" />
              ) : filteredDatasets.map((item) => (
                <button
                  key={item.qualifiedName}
                  type="button"
                  className={`dataset-list-item ${item.name === selectedTable ? 'is-active' : ''}`}
                  onClick={() => setSelectedTable(item.name)}
                >
                  <div className="dataset-list-head">
                    <div>
                      <div className="dataset-list-title">{item.label || item.name}</div>
                      <div className="dataset-list-desc">{item.description || item.engine || '目录资产'}</div>
                    </div>
                    <PrdTag kind={item.versioned ? 'success' : item.datasetType === 'external' ? 'warning' : 'info'}>
                      {item.versioned ? `v${item.currentVersion ?? 0}` : item.datasetType === 'external' ? '外表' : '目录'}
                    </PrdTag>
                  </div>
                  <div className="dataset-list-meta">
                    <span>{item.engine}</span>
                    <span>{formatNumber(item.rowCount)} 行</span>
                    <span>{formatNumber(item.schemaCount || 0)} 字段</span>
                  </div>
                </button>
              ))}
            </div>
          </PrdCard>
        </div>

        <div className="governance-directory-main">
          <Spin loading={detailLoading}>
            <PrdCard title="治理概览" sub={selectedDataset?.qualifiedName || '尚未选择数据集'}>
              {!selectedDataset || !assetDetail ? (
                <Empty description="请选择左侧数据集查看详情" />
              ) : (
                <>
                  <div className="dataset-metric-grid">
                    <div className="dataset-metric">
                      <div className="k">数据行数</div>
                      <div className="v">{formatNumber(selectedDataset.rowCount)}</div>
                    </div>
                    <div className="dataset-metric">
                      <div className="k">字段数量</div>
                      <div className="v">{formatNumber(assetDetail.columns?.length || 0)}</div>
                    </div>
                    <div className="dataset-metric">
                      <div className="k">当前版本</div>
                      <div className="v">{selectedDataset.versioned ? `v${selectedDataset.currentVersion ?? 0}` : '--'}</div>
                    </div>
                    <div className="dataset-metric">
                      <div className="k">样本快照</div>
                      <div className="v">{formatNumber(assetDetail.sample_rows?.length || 0)}</div>
                    </div>
                  </div>

                  <Descriptions
                    className="dataset-descriptions"
                    column={2}
                    data={[
                      { label: '数据集路径', value: selectedDataset.qualifiedName },
                      { label: '存储位置', value: assetDetail.storage_path || '--' },
                      { label: '文件格式', value: assetDetail.file_format || assetDetail.engine || '--' },
                      {
                        label: '治理类型',
                        value: selectedDataset.datasetType === 'lance' ? '版本化资产' : selectedDataset.datasetType === 'external' ? '联邦外表' : '目录资产',
                      },
                    ]}
                  />
                </>
              )}
            </PrdCard>

            <div className="dataset-section-grid">
              <PrdCard title="字段结构" sub="用于快速识别治理颗粒度与字段完备性">
                <MiniSchemaTable rows={assetDetail?.columns || []} />
              </PrdCard>

              <PrdCard title="样本快照" sub="展示当前目录的抽样记录">
                <MiniSampleTable rows={assetDetail?.sample_rows || []} />
              </PrdCard>
            </div>

            <div className="dataset-section-grid">
              <PrdCard title="样本预览" sub="对文件型资产提供预览入口">
                <div className="dataset-preview-grid">
                  {(assetDetail?.media_samples || []).length === 0 ? (
                    <Empty description="当前数据集暂无可预览样本" />
                  ) : (assetDetail?.media_samples || []).map((item) => (
                    <button
                      key={`${item.file_hash}-${item.doc_name}`}
                      type="button"
                      className="dataset-preview-card"
                      onClick={() => handlePreview(item.file_hash)}
                    >
                      <div className="dataset-preview-title">{item.doc_name || '未命名样本'}</div>
                      <div className="dataset-list-desc">点击查看样本预览、文件摘要与基础属性。</div>
                      <div className="dataset-preview-meta">
                        <span>{String(item.doc_type || '--').toUpperCase()}</span>
                        <span>预览</span>
                      </div>
                    </button>
                  ))}
                </div>
              </PrdCard>

              <PrdCard title="治理责任" sub="归属、责任人与服务承诺">
                <div className="governance-kv-list">
                  {ownershipSummary.map((item) => (
                    <div key={item.label} className="governance-kv-item">
                      <div className="governance-kv-label">{item.label}</div>
                      <div className="governance-kv-value">{item.value}</div>
                    </div>
                  ))}
                </div>
              </PrdCard>
            </div>
          </Spin>
        </div>

        <div className="governance-directory-rail">
          <PrdCard title="版本治理" sub="当前数据集的版本状态与变化节奏">
            {!selectedDataset?.versioned ? (
              <Empty description="当前数据集未接入版本治理" />
            ) : (
              <Spin loading={versionLoading}>
                <div className="governance-version-list">
                  {versionList.map((item) => (
                    <div key={item.version} className="governance-version-item">
                      <div className="governance-version-head">
                        <span className="governance-version-badge">v{item.version}</span>
                        {selectedDataset.currentVersion === item.version ? <PrdTag kind="success">当前</PrdTag> : null}
                      </div>
                      <div className="governance-version-meta">
                        <span>{formatDateTime(item.timestamp) || '未记录时间'}</span>
                        <span>{formatNumber(item.num_rows || 0)} 行</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Spin>
            )}
          </PrdCard>

          <PrdCard title="数据血缘" sub="按目录视角展示来源、沉淀和消费链路">
            <div className="governance-lineage">
              {lineageItems.map((item, index) => (
                <div key={`${item.title}-${index}`} className={`governance-lineage-item is-${item.state}`}>
                  <div className="governance-lineage-dot">
                    <IconCheckCircle />
                  </div>
                  <div>
                    <div className="governance-lineage-title">{item.title}</div>
                    <div className="governance-lineage-copy">{item.copy}</div>
                  </div>
                </div>
              ))}
            </div>
          </PrdCard>

          <PrdCard title="权限口径" sub="按角色汇总数据集访问范围">
            <div className="governance-access-list">
              {accessSummary.map((item) => (
                <div key={item.role} className="governance-access-item">
                  <div className="governance-access-head">
                    <span className="governance-access-role">{item.role}</span>
                    <PrdTag kind={item.kind}>{item.role}</PrdTag>
                  </div>
                  <div className="governance-access-copy">{item.scope}</div>
                </div>
              ))}
            </div>
          </PrdCard>

          <PrdCard title="建议动作" sub="便于汇报时快速定位下一步治理事项">
            <div className="governance-action-list">
              {recommendedActions.length === 0 ? (
                <Empty description="当前暂无额外治理动作" />
              ) : recommendedActions.map((item) => (
                <div key={item} className="governance-action-item">
                  {item}
                </div>
              ))}
            </div>
          </PrdCard>
        </div>
      </div>

      <PreviewModal
        open={previewState.open}
        loading={previewState.loading}
        preview={previewState.preview}
        error={previewState.error}
        onClose={() => setPreviewState(initialPreview)}
      />
    </div>
  )
}
