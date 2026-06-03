import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Descriptions,
  Empty,
  Grid,
  Input,
  Message,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Typography,
} from '@arco-design/web-react'
import {
  IconArchive,
  IconEye,
  IconFile,
  IconHistory,
  IconRefresh,
  IconStorage,
  IconSync,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import PreviewModal from '@/components/PreviewModal.jsx'
import { PrdCard, PrdTag, StatCard } from '@/components/PrdWidgets.jsx'
import { formatDateTime, formatNumber } from '@/utils/format'

const { Title, Text } = Typography
const { Row, Col } = Grid
const TabPane = Tabs.TabPane
const Option = Select.Option

const initialPreview = { open: false, loading: false, preview: null, error: '' }

const versionTableMap = {
  files: 'files',
  text_chunks: 'text',
  image_chunks: 'image',
}

function normalizeDataset(item, versionStatsMap) {
  const tableName = item.name
  const versionKey = versionTableMap[tableName] || null
  const versionInfo = versionKey ? versionStatsMap[versionKey] : null
  const rowCount = Number(item.row_count ?? versionInfo?.num_rows ?? 0)
  const schemaCount = Array.isArray(versionInfo?.schema) ? versionInfo.schema.length : undefined
  return {
    ...item,
    rowCount,
    schemaCount,
    versionKey,
    currentVersion: versionInfo?.version ?? null,
    versioned: Boolean(versionKey),
    datasetType: versionKey ? 'lance' : item.engine === 'Doris External' ? 'external' : 'catalog',
  }
}

function buildDatasetSummary(detail, dataset) {
  if (!detail || !dataset) return []
  const summary = [
    { label: '数据集路径', value: `${detail.catalog}.${detail.schema}.${detail.table}` },
    { label: '存储位置', value: detail.storage_path || '--' },
    { label: '文件格式', value: detail.file_format || detail.engine || '--' },
    { label: '字段数量', value: formatNumber(detail.columns?.length || 0) },
  ]
  if (dataset.versioned) {
    summary.push({ label: '当前版本', value: `v${dataset.currentVersion ?? 0}` })
  }
  return summary
}

function buildVersionCompare(selectedVersions, currentVersion) {
  if (!Array.isArray(selectedVersions) || selectedVersions.length < 2) return null
  const ordered = [...selectedVersions].sort((a, b) => Number(a.version) - Number(b.version))
  const [base, target] = ordered
  const delta = base.num_rows != null && target.num_rows != null
    ? Number(target.num_rows || 0) - Number(base.num_rows || 0)
    : null
  return {
    base,
    target,
    delta,
    currentVersion,
  }
}

function MiniSchemaTable({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <Empty description="暂无结构信息" />
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

export default function FilesPage() {
  const [catalogs, setCatalogs] = useState([])
  const [schemas, setSchemas] = useState([])
  const [tables, setTables] = useState([])
  const [selectedCatalog, setSelectedCatalog] = useState('')
  const [selectedSchema, setSelectedSchema] = useState('')
  const [selectedTable, setSelectedTable] = useState('')
  const [assetDetail, setAssetDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [previewState, setPreviewState] = useState(initialPreview)
  const [versionStats, setVersionStats] = useState([])
  const [versionList, setVersionList] = useState([])
  const [versionLoading, setVersionLoading] = useState(false)
  const [versionSelection, setVersionSelection] = useState([])
  const [rollingVersion, setRollingVersion] = useState(null)
  const [compacting, setCompacting] = useState(false)
  const [fileTypes, setFileTypes] = useState([])
  const [searchKeyword, setSearchKeyword] = useState('')

  const versionStatsMap = useMemo(
    () => Object.fromEntries((versionStats || []).map((item) => [item.table, item])),
    [versionStats],
  )

  const datasets = useMemo(
    () => (tables || []).map((item) => normalizeDataset(item, versionStatsMap)),
    [tables, versionStatsMap],
  )

  const filteredDatasets = useMemo(() => {
    const query = searchKeyword.trim().toLowerCase()
    if (!query) return datasets
    return datasets.filter((item) => {
      const haystack = [item.name, item.label, item.description, item.engine]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [datasets, searchKeyword])

  const selectedDataset = useMemo(
    () => datasets.find((item) => item.name === selectedTable) || null,
    [datasets, selectedTable],
  )

  const compareData = useMemo(
    () => buildVersionCompare(versionList.filter((item) => versionSelection.includes(item.version)), selectedDataset?.currentVersion),
    [selectedDataset?.currentVersion, versionList, versionSelection],
  )

  const fileAssetCount = useMemo(
    () => fileTypes.reduce((sum, item) => sum + Number(item.count || 0), 0),
    [fileTypes],
  )

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
    const list = Array.isArray(response?.items) ? response.items : []
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
      Message.error(getErrorMessage(error, '加载数据集详情失败'))
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
      setVersionSelection([])
      return
    }
    setVersionLoading(true)
    try {
      const response = await api.getTableVersions(tableKey)
      const versions = Array.isArray(response?.versions) ? response.versions : []
      setVersionList(versions)
      setVersionSelection(versions.slice(0, 2).map((item) => item.version))
    } catch (error) {
      setVersionList([])
      setVersionSelection([])
      Message.error(getErrorMessage(error, '加载版本历史失败'))
    } finally {
      setVersionLoading(false)
    }
  }

  const loadFileTypes = async () => {
    try {
      const response = await api.getFileTypes()
      setFileTypes(Array.isArray(response) ? response : [])
    } catch {
      setFileTypes([])
    }
  }

  const refreshPage = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        loadCatalogs(),
        loadVersionStats(),
        loadFileTypes(),
      ])
    } catch (error) {
      Message.error(getErrorMessage(error, '刷新数据集页面失败'))
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
    loadVersionList(selectedDataset?.versionKey || null).catch(() => {})
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
        error: getErrorMessage(error, '预览失败'),
      })
    }
  }

  const handleRollback = async (tableKey, version) => {
    setRollingVersion(version)
    try {
      const response = await api.rollbackTableVersion({ table: tableKey, version })
      Message.success(response?.message || `已回滚到版本 ${version}`)
      await Promise.all([
        loadVersionStats(),
        loadVersionList(tableKey),
        loadDetail(selectedCatalog, selectedSchema, selectedTable),
      ])
    } catch (error) {
      Message.error(getErrorMessage(error, '版本回滚失败'))
    } finally {
      setRollingVersion(null)
    }
  }

  const handleCompact = async (tableKey) => {
    setCompacting(true)
    try {
      const response = await api.compactTableVersion(tableKey)
      Message.success(response?.message || '已完成数据集整理')
      await loadVersionList(tableKey)
    } catch (error) {
      Message.error(getErrorMessage(error, '数据集整理失败'))
    } finally {
      setCompacting(false)
    }
  }

  const topStats = useMemo(() => {
    const totalRows = datasets.reduce((sum, item) => sum + Number(item.rowCount || 0), 0)
    const versionedCount = datasets.filter((item) => item.versioned).length
    const liveCount = datasets.filter((item) => item.engine !== 'Doris External').length
    return {
      totalDatasets: datasets.length,
      totalRows,
      versionedCount,
      liveCount,
    }
  }, [datasets])

  const summaryItems = useMemo(() => [
    {
      key: 'scope',
      label: '当前目录范围',
      value: selectedCatalog && selectedSchema ? `${selectedCatalog} / ${selectedSchema}` : '等待目录加载',
      meta: '目录切换后，左侧数据集清单和右侧详情会同步刷新到当前 Catalog / Schema。',
    },
    {
      key: 'dataset',
      label: '当前数据集',
      value: selectedDataset?.label || selectedDataset?.name || '未选择数据集',
      meta: selectedDataset ? `${formatNumber(selectedDataset.rowCount)} 行样本，${selectedDataset.engine || 'Catalog View'}` : '从左侧目录选择一个数据集后，这里会显示当前聚焦对象。',
    },
    {
      key: 'version',
      label: '版本状态',
      value: selectedDataset?.versioned ? `Lance v${selectedDataset.currentVersion ?? 0}` : '非版本托管数据集',
      meta: selectedDataset?.versioned ? `当前可用版本 ${formatNumber(versionList.length)} 个，支持回滚与整理。` : '当前数据集仍保留详情、Schema 和样本视图，但不启用 Lance 版本能力。',
    },
    {
      key: 'compare',
      label: '对比就绪度',
      value: compareData ? `v${compareData.base.version} -> v${compareData.target.version}` : '等待选择两个版本',
      meta: compareData ? `行数变化 ${compareData.delta == null ? '--' : compareData.delta > 0 ? '+' : ''}${compareData.delta == null ? '--' : formatNumber(compareData.delta)}` : '在版本中心选择两个快照后，这里会生成摘要对比结果。',
    },
  ], [compareData, selectedCatalog, selectedDataset, selectedSchema, versionList.length])

  const versionColumns = [
    {
      title: '版本',
      dataIndex: 'version',
      width: 90,
      render: (value) => (
        <Space>
          <Text style={{ fontWeight: 800 }}>{`v${value}`}</Text>
          {selectedDataset?.currentVersion === value ? <PrdTag kind="ok">当前</PrdTag> : null}
        </Space>
      ),
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      render: (value) => <Text type="secondary">{value ? formatDateTime(value) : '系统快照'}</Text>,
    },
    {
      title: '行数',
      dataIndex: 'num_rows',
      width: 120,
      render: (value) => <Text>{value == null ? '--' : formatNumber(value)}</Text>,
    },
    {
      title: '操作',
      width: 130,
      render: (_, record) => (
        <Popconfirm
          title={`确认将 ${selectedDataset?.label || selectedDataset?.name} 回滚到 v${record.version}？`}
          onOk={() => handleRollback(selectedDataset?.versionKey, record.version)}
        >
          <Button
            size="small"
            type="text"
            disabled={selectedDataset?.currentVersion === record.version}
            loading={rollingVersion === record.version}
          >
            回滚到此版本
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div className="dataset-page">
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>数据集管理</Title>
          <Text type="secondary">
            以数据集为中心统一查看目录、结构、样本、版本与回滚状态，版本能力优先对齐 Lance Dataset 语义。
          </Text>
        </div>
        <div className="prd-page-actions">
          <Select value={selectedCatalog} onChange={setSelectedCatalog} style={{ width: 180 }}>
            {catalogs.map((item) => (
              <Option key={item.name} value={item.name}>{item.label}</Option>
            ))}
          </Select>
          <Select value={selectedSchema} onChange={setSelectedSchema} style={{ width: 180 }}>
            {schemas.map((item) => (
              <Option key={item.name} value={item.name}>{item.label}</Option>
            ))}
          </Select>
          <Button icon={<IconRefresh />} loading={refreshing} onClick={refreshPage}>刷新</Button>
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

      <div className="dataset-hero">
        <div>
          <div className="dataset-hero-kicker">Dataset Control Plane</div>
          <div className="dataset-hero-title">
            当前目录下共 {formatNumber(topStats.totalDatasets)} 个数据集，核心 Lance 数据集 {formatNumber(topStats.versionedCount)} 个
          </div>
          <div className="dataset-hero-copy">
            数据集管理页负责统一承接数据集详情、Schema 浏览、样本预览与版本回滚，不再停留在单纯的文件列表层面。
          </div>
          <div className="dataset-hero-tags">
            <PrdTag kind="info">Catalog / Schema 视图</PrdTag>
            <PrdTag kind="ok">Lance 版本管理</PrdTag>
            <PrdTag kind="purple">多模态样本预览</PrdTag>
          </div>
        </div>
        <div className="dataset-hero-side">
          <div className="dataset-hero-side-label">版本语义</div>
          <div className="dataset-hero-side-value">Lance-first</div>
          <div className="dataset-hero-side-copy">
            `files / text_chunks / image_chunks` 对应的版本中心直接走 Lance 表版本能力，更适合做数据快照与回滚。
          </div>
        </div>
      </div>

      <div className="prd-kpi-grid">
        <StatCard
          label="目录数据集"
          value={topStats.totalDatasets}
          sub="当前 Catalog / Schema 下已纳入统一管理的数据集数量"
          icon={<IconStorage />}
          iconBg="rgba(22, 93, 255, 0.12)"
          iconColor="#165dff"
        />
        <StatCard
          label="累计样本行数"
          value={formatNumber(topStats.totalRows)}
          sub="基于当前可见数据集聚合的样本规模，用于汇报容量与活跃度"
          icon={<IconArchive />}
          iconBg="rgba(27, 158, 92, 0.12)"
          iconColor="#1b9e5c"
        />
        <StatCard
          label="版本托管数据集"
          value={topStats.versionedCount}
          sub="当前已经接入 Lance 版本管理的核心数据集数量"
          icon={<IconHistory />}
          iconBg="rgba(123, 31, 162, 0.12)"
          iconColor="#7b1fa2"
        />
        <StatCard
          label="多模态资产"
          value={formatNumber(fileAssetCount)}
          sub="来自当前资产池的文件总量，可继续用于检索、训练与治理"
          icon={<IconFile />}
          iconBg="rgba(230, 139, 0, 0.14)"
          iconColor="#e68b00"
        />
      </div>

      <Row gutter={16} className="dataset-layout">
        <Col span={8}>
          <PrdCard
            title="数据集目录"
            sub="按当前 Schema 查看统一数据集清单，优先承接 Lance / 外表 / 目录视图"
            extra={<PrdTag kind="info">{selectedSchema || '未选择'}</PrdTag>}
          >
            <div style={{ marginBottom: 12 }}>
              <Input.Search
                allowClear
                placeholder="搜索数据集名称、描述或引擎"
                value={searchKeyword}
                onChange={setSearchKeyword}
              />
            </div>
            <div className="dataset-list">
              {filteredDatasets.length === 0 ? (
                <Empty description={searchKeyword ? '无匹配的数据集' : '当前目录下暂无数据集'} />
              ) : (
                filteredDatasets.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={`dataset-list-item ${selectedTable === item.name ? 'is-active' : ''}`}
                    onClick={() => setSelectedTable(item.name)}
                  >
                    <div className="dataset-list-head">
                      <div className="dataset-list-title">{item.label}</div>
                      <PrdTag kind={item.versioned ? 'ok' : item.datasetType === 'external' ? 'warn' : 'info'}>
                        {item.versioned ? 'Lance' : item.datasetType === 'external' ? 'External' : 'Catalog'}
                      </PrdTag>
                    </div>
                    <div className="dataset-list-desc">{item.description || '暂无描述'}</div>
                    <div className="dataset-list-meta">
                      <span>{formatNumber(item.rowCount)} 行</span>
                      <span>{item.engine || 'Catalog View'}</span>
                      {item.versioned ? <span>{`v${item.currentVersion ?? 0}`}</span> : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </PrdCard>
        </Col>

        <Col span={16}>
          <PrdCard
            title={selectedDataset?.label || '数据集详情'}
            sub={selectedDataset?.description || '选择左侧数据集查看详情、Schema、样本与版本管理能力'}
            extra={
              selectedDataset ? (
                <Space>
                  {selectedDataset.versioned ? <PrdTag kind="ok">{`当前版本 v${selectedDataset.currentVersion ?? 0}`}</PrdTag> : null}
                  <PrdTag kind={selectedDataset?.datasetType === 'external' ? 'warn' : 'info'}>
                    {selectedDataset?.engine || 'Catalog View'}
                  </PrdTag>
                </Space>
              ) : null
            }
          >
            <Spin loading={detailLoading}>
              {!assetDetail || !selectedDataset ? (
                <Empty description="选择左侧数据集查看详情" />
              ) : (
                <Tabs defaultActiveTab="overview" type="rounded">
                  <TabPane key="overview" title="概览">
                    <div className="dataset-metric-grid">
                      <div className="dataset-metric">
                        <div className="k">样本规模</div>
                        <div className="v">{formatNumber(selectedDataset.rowCount)}</div>
                      </div>
                      <div className="dataset-metric">
                        <div className="k">字段数量</div>
                        <div className="v">{formatNumber(assetDetail.columns?.length || 0)}</div>
                      </div>
                      <div className="dataset-metric">
                        <div className="k">版本状态</div>
                        <div className="v">{selectedDataset.versioned ? `v${selectedDataset.currentVersion ?? 0}` : '未托管'}</div>
                      </div>
                      <div className="dataset-metric">
                        <div className="k">数据类型</div>
                        <div className="v">{selectedDataset.versioned ? 'Lance Dataset' : selectedDataset.engine}</div>
                      </div>
                    </div>

                    <Descriptions
                      column={2}
                      size="small"
                      className="dataset-descriptions"
                      data={buildDatasetSummary(assetDetail, selectedDataset).map((item) => ({
                        label: item.label,
                        value: <Text>{item.value}</Text>,
                      }))}
                    />

                    <div className="dataset-section-grid">
                      <PrdCard title="Schema 摘要" sub="当前数据集字段结构，用于判断多模态字段和治理范围">
                        <MiniSchemaTable rows={assetDetail.columns || []} />
                      </PrdCard>
                      <PrdCard title="样本快照" sub="直接查看当前数据集的前几条样本，用于汇报和数据核验">
                        <MiniSampleTable rows={assetDetail.sample_rows || []} />
                      </PrdCard>
                    </div>
                  </TabPane>

                  <TabPane key="schema" title="Schema">
                    <PrdCard
                      title="字段结构浏览"
                      sub="面向数据治理、检索建模与训练准备的结构化查看入口"
                    >
                      <MiniSchemaTable rows={assetDetail.columns || []} />
                    </PrdCard>
                  </TabPane>

                  <TabPane key="versions" title="版本管理">
                    {selectedDataset.versioned ? (
                      <div className="dataset-version-layout">
                        <div className="dataset-version-note">
                          <div className="dataset-version-note-title">Lance 版本中心</div>
                          <div className="dataset-version-note-copy">
                            当前版本管理直接对齐 Lance Dataset 快照语义。这里优先解决汇报里最重要的三件事：当前生产版本、可回滚历史、以及两个版本之间的摘要差异。
                          </div>
                        </div>
                        <PrdCard
                          title="版本中心"
                          sub="当前接入的是 Lance 版本能力，适合做快照、回滚与存储整理"
                          extra={
                            <Space>
                              <Button
                                size="small"
                                icon={<IconSync />}
                                loading={compacting}
                                onClick={() => handleCompact(selectedDataset.versionKey)}
                              >
                                数据整理
                              </Button>
                              <Button size="small" icon={<IconRefresh />} onClick={() => loadVersionList(selectedDataset.versionKey)}>
                                刷新版本
                              </Button>
                            </Space>
                          }
                        >
                          <Table
                            size="small"
                            rowKey="version"
                            loading={versionLoading}
                            columns={versionColumns}
                            data={versionList}
                            pagination={false}
                            noDataElement={<Empty description="暂无版本历史" />}
                          />
                        </PrdCard>

                        <PrdCard
                          title="版本对比摘要"
                          sub="先基于版本元数据做快照对比，后续可继续补字段差异与样本差异"
                        >
                          {versionList.length === 0 ? (
                            <Empty description="暂无可对比版本" />
                          ) : (
                            <>
                              <div className="dataset-compare-selects">
                                <div className="field">
                                  <Text type="secondary">选择两个版本</Text>
                                  <Select
                                    mode="multiple"
                                    maxTagCount={2}
                                    value={versionSelection}
                                    onChange={(values) => setVersionSelection(values.slice(-2))}
                                    style={{ width: '100%', marginTop: 6 }}
                                  >
                                    {versionList.map((item) => (
                                      <Option key={item.version} value={item.version}>{`v${item.version}`}</Option>
                                    ))}
                                  </Select>
                                </div>
                              </div>

                              {compareData ? (
                                <div className="dataset-compare-panel">
                                  <div className="dataset-compare-item">
                                    <div className="k">基线版本</div>
                                    <div className="v">{`v${compareData.base.version}`}</div>
                                    <div className="m">{compareData.base.timestamp ? formatDateTime(compareData.base.timestamp) : '系统快照'}</div>
                                  </div>
                                  <div className="dataset-compare-item">
                                    <div className="k">目标版本</div>
                                    <div className="v">{`v${compareData.target.version}`}</div>
                                    <div className="m">{compareData.target.timestamp ? formatDateTime(compareData.target.timestamp) : '系统快照'}</div>
                                  </div>
                                  <div className="dataset-compare-item">
                                    <div className="k">行数变化</div>
                                    <div className="v">
                                      {compareData.delta == null
                                        ? '--'
                                        : compareData.delta === 0
                                          ? '0'
                                          : `${compareData.delta > 0 ? '+' : ''}${formatNumber(compareData.delta)}`}
                                    </div>
                                    <div className="m">{`当前生产版本 v${compareData.currentVersion ?? 0}`}</div>
                                  </div>
                                </div>
                              ) : (
                                <Empty description="请选择两个版本进行摘要对比" />
                              )}
                            </>
                          )}
                        </PrdCard>
                      </div>
                    ) : (
                      <Empty description="当前数据集不是 Lance 托管数据集，暂不支持版本回滚" />
                    )}
                  </TabPane>

                  <TabPane key="samples" title="样本与预览">
                    <div className="dataset-section-grid">
                      <PrdCard title="样本预览" sub="数据集样本直接查看">
                        <MiniSampleTable rows={assetDetail.sample_rows || []} />
                      </PrdCard>
                      <PrdCard title="多模态预览入口" sub="如果当前数据集含文件样本，可直接打开预览">
                        {assetDetail.media_samples?.length > 0 ? (
                          <div className="dataset-preview-grid">
                            {assetDetail.media_samples.map((item) => (
                              <button
                                key={item.file_hash}
                                type="button"
                                className="dataset-preview-card"
                                onClick={() => handlePreview(item.file_hash)}
                              >
                                <div className="dataset-preview-title">{item.doc_name || '未命名样本'}</div>
                                <div className="dataset-preview-meta">
                                  <PrdTag kind="info">{item.doc_type || 'unknown'}</PrdTag>
                                  <span><IconEye /> 打开预览</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Empty description="当前数据集暂无可直接预览的多模态样本" />
                        )}
                      </PrdCard>
                    </div>
                  </TabPane>
                </Tabs>
              )}
            </Spin>
          </PrdCard>
        </Col>
      </Row>

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
