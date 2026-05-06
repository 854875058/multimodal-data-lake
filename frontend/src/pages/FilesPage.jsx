import { useEffect, useMemo, useState } from 'react'
import {
  Card, Button, Space, Table, Tag, Select, Typography, Empty, Grid,
  Statistic, Message, Popconfirm, Descriptions, Spin
} from '@arco-design/web-react'
import { IconRefresh, IconEye, IconDelete, IconStorage, IconFolder } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import PreviewModal from '@/components/PreviewModal.jsx'

const { Title, Text } = Typography
const { Row, Col } = Grid
const Option = Select.Option

const initialPreview = { open: false, loading: false, preview: null, error: '' }

function MiniTable({ rows }) {
  if (!Array.isArray(rows) || !rows.length) {
    return <Empty description="暂无数据" />
  }
  const columns = Object.keys(rows[0] || {}).map(k => ({
    title: k,
    dataIndex: k,
    render: v => <Text code style={{ fontSize: 12 }}>{String(v ?? '—')}</Text>,
    ellipsis: true,
  }))
  return (
    <Table
      columns={columns}
      data={rows}
      pagination={false}
      size="small"
      border
      rowKey={(_, i) => i}
      scroll={{ x: 'max-content' }}
    />
  )
}

export default function FilesPage() {
  const [settings, setSettings] = useState(null)
  const [catalogs, setCatalogs] = useState([])
  const [schemas, setSchemas] = useState([])
  const [tables, setTables] = useState([])
  const [selectedCatalog, setSelectedCatalog] = useState('')
  const [selectedSchema, setSelectedSchema] = useState('')
  const [selectedTable, setSelectedTable] = useState('')
  const [assetDetail, setAssetDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [files, setFiles] = useState([])
  const [fileTypes, setFileTypes] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [docType, setDocType] = useState('all')
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [deletingHash, setDeletingHash] = useState('')
  const [previewState, setPreviewState] = useState(initialPreview)

  const loadPlatform = async () => {
    try {
      const [s, c] = await Promise.all([api.getPlatformSettings(), api.getAssetCatalogs()])
      setSettings(s?.data || {})
      const list = Array.isArray(c?.items) ? c.items : []
      setCatalogs(list)
      setSelectedCatalog(list[0]?.name || '')
    } catch (e) {
      Message.error(getErrorMessage(e, '加载资产目录失败'))
    }
  }

  const loadFileTypes = async () => {
    try {
      const r = await api.getFileTypes()
      setFileTypes(Array.isArray(r) ? r : [])
    } catch { setFileTypes([]) }
  }

  const loadFiles = async () => {
    setLoadingFiles(true)
    try {
      const r = await api.getFiles(page, pageSize, docType)
      setFiles(Array.isArray(r.files) ? r.files : [])
      setTotal(Number(r.total || 0))
    } catch (e) {
      setFiles([])
      setTotal(0)
      Message.error(getErrorMessage(e, '加载资产列表失败'))
    } finally {
      setLoadingFiles(false)
    }
  }

  const loadSchemas = async (catalog) => {
    if (!catalog) { setSchemas([]); setSelectedSchema(''); return }
    try {
      const r = await api.getAssetSchemas(catalog)
      const list = Array.isArray(r?.items) ? r.items : []
      setSchemas(list)
      setSelectedSchema(list[0]?.name || '')
    } catch { setSchemas([]); setSelectedSchema('') }
  }

  const loadTables = async (catalog, schema) => {
    if (!catalog || !schema) { setTables([]); setSelectedTable(''); return }
    try {
      const r = await api.getAssetTables(catalog, schema)
      const list = Array.isArray(r?.items) ? r.items : []
      setTables(list)
      setSelectedTable(list[0]?.name || '')
    } catch { setTables([]); setSelectedTable('') }
  }

  const loadDetail = async (catalog, schema, table) => {
    if (!catalog || !schema || !table) { setAssetDetail(null); return }
    setDetailLoading(true)
    try {
      const r = await api.getAssetDetail(catalog, schema, table, 8)
      setAssetDetail(r?.data || null)
    } catch { setAssetDetail(null) }
    finally { setDetailLoading(false) }
  }

  useEffect(() => { loadPlatform(); loadFileTypes() }, [])
  useEffect(() => { loadFiles() }, [docType, page])
  useEffect(() => { loadSchemas(selectedCatalog) }, [selectedCatalog])
  useEffect(() => { loadTables(selectedCatalog, selectedSchema) }, [selectedCatalog, selectedSchema])
  useEffect(() => { loadDetail(selectedCatalog, selectedSchema, selectedTable) }, [selectedCatalog, selectedSchema, selectedTable])

  const handlePreview = async (fileHash) => {
    setPreviewState({ open: true, loading: true, preview: null, error: '' })
    try {
      const r = await api.previewFile(fileHash)
      setPreviewState({ open: true, loading: false, preview: r, error: '' })
    } catch (e) {
      setPreviewState({ open: true, loading: false, preview: null, error: getErrorMessage(e, '预览失败') })
    }
  }

  const handleDelete = async (file) => {
    setDeletingHash(file.file_hash)
    try {
      const r = await api.deleteFile(file.file_hash)
      if (r.success) {
        Message.success(r.message || '已删除')
        await Promise.all([loadFileTypes(), loadFiles(), loadDetail(selectedCatalog, selectedSchema, selectedTable)])
      } else {
        Message.error(r.message || '删除失败')
      }
    } catch (e) {
      Message.error(getErrorMessage(e, '删除失败'))
    } finally {
      setDeletingHash('')
    }
  }

  const fileColumns = [
    { title: '文件名称', dataIndex: 'doc_name', render: v => <Text bold>{v || '未命名'}</Text> },
    { title: '类型', dataIndex: 'doc_type', width: 110, render: v => <Tag color="arcoblue">{v || '未知'}</Tag> },
    { title: '来源', dataIndex: 'source_uri', render: v => <Text type="secondary" ellipsis>{v || '本地上传'}</Text> },
    { title: '哈希', dataIndex: 'file_hash', width: 240, render: v => <Text code style={{ fontSize: 11 }}>{v}</Text>, ellipsis: true },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, file) => (
        <Space>
          <Button size="small" type="text" icon={<IconEye />} onClick={() => handlePreview(file.file_hash)}>预览</Button>
          <Popconfirm title={`确认删除「${file.doc_name || '该资产'}」？`} onOk={() => handleDelete(file)}>
            <Button size="small" type="text" status="danger" icon={<IconDelete />} loading={deletingHash === file.file_hash}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>资产目录</Title>
          <Text type="secondary">Gravitino 三级目录 · 已入湖资产管理</Text>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card title={<Space><IconFolder />Gravitino 目录</Space>} bodyStyle={{ padding: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size="medium">
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Catalog</Text>
                <Select value={selectedCatalog} onChange={setSelectedCatalog} style={{ width: '100%', marginTop: 4 }}>
                  {catalogs.map(c => <Option key={c.name} value={c.name}>{c.label}</Option>)}
                </Select>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Schema</Text>
                <Select value={selectedSchema} onChange={setSelectedSchema} style={{ width: '100%', marginTop: 4 }}>
                  {schemas.map(s => <Option key={s.name} value={s.name}>{s.label}</Option>)}
                </Select>
              </div>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>表列表</Text>
                <Space direction="vertical" style={{ width: '100%' }} size={4}>
                  {tables.length === 0 ? <Empty description="暂无表" /> :
                    tables.map(t => (
                      <Card
                        key={t.name}
                        size="small"
                        hoverable
                        bodyStyle={{ padding: '8px 12px' }}
                        style={{
                          cursor: 'pointer',
                          borderColor: selectedTable === t.name ? 'var(--color-primary-light-3)' : undefined,
                          background: selectedTable === t.name ? 'var(--color-primary-light-1)' : undefined,
                        }}
                        onClick={() => setSelectedTable(t.name)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</div>
                            <Text type="secondary" style={{ fontSize: 11 }} ellipsis>{t.description}</Text>
                          </div>
                          <Tag size="small" color="arcoblue">{t.engine}</Tag>
                        </div>
                      </Card>
                    ))}
                </Space>
              </div>
            </Space>
          </Card>
        </Col>

        <Col span={16}>
          <Card
            title={
              <Space>
                <IconStorage />
                {assetDetail?.table || '资产详情'}
                {assetDetail && <Tag color="arcoblue">{assetDetail.engine}</Tag>}
              </Space>
            }
            bodyStyle={{ padding: 16 }}
          >
            <Spin loading={detailLoading} style={{ display: 'block' }}>
              {!assetDetail ? (
                <Empty description="选择左侧表查看详情" />
              ) : (
                <>
                  <Row gutter={12} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Card bodyStyle={{ padding: 12 }}>
                        <Statistic title="路径" value={`${assetDetail.catalog}.${assetDetail.schema}`} valueStyle={{ fontSize: 14, fontFamily: 'monospace' }} />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card bodyStyle={{ padding: 12 }}>
                        <Statistic title="样本行数" value={assetDetail.row_count || 0} />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card bodyStyle={{ padding: 12 }}>
                        <Statistic title="字段数" value={assetDetail.columns?.length || 0} />
                      </Card>
                    </Col>
                  </Row>
                  <Descriptions
                    column={2} size="small"
                    style={{ marginBottom: 16 }}
                    data={[
                      { label: '存储位置', value: <Text code>{assetDetail.storage_path || '—'}</Text> },
                      { label: '文件格式', value: assetDetail.file_format || assetDetail.engine || '—' },
                    ]}
                  />
                  <Title heading={6} style={{ marginBottom: 8 }}>字段结构</Title>
                  <MiniTable rows={assetDetail.columns || []} />
                  <Title heading={6} style={{ marginTop: 16, marginBottom: 8 }}>样本预览</Title>
                  <MiniTable rows={assetDetail.sample_rows || []} />
                  {assetDetail.media_samples?.length > 0 && (
                    <>
                      <Title heading={6} style={{ marginTop: 16, marginBottom: 8 }}>多模态预览</Title>
                      <Space wrap>
                        {assetDetail.media_samples.map(m => (
                          <Card
                            key={m.file_hash}
                            size="small"
                            hoverable
                            style={{ width: 200, cursor: 'pointer' }}
                            bodyStyle={{ padding: 12 }}
                            onClick={() => handlePreview(m.file_hash)}
                          >
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.doc_name}</div>
                            <Tag size="small" color="arcoblue" style={{ marginTop: 4 }}>{m.doc_type}</Tag>
                          </Card>
                        ))}
                      </Space>
                    </>
                  )}
                </>
              )}
            </Spin>
          </Card>
        </Col>
      </Row>

      <Card
        title="已入湖资产列表"
        extra={
          <Space>
            <Select value={docType} onChange={(v) => { setPage(1); setDocType(v) }} style={{ width: 160 }}>
              <Option value="all">全部类型</Option>
              {fileTypes.map(t => (
                <Option key={t.doc_type || 'unknown'} value={t.doc_type}>
                  {t.doc_type || '未知'} ({t.count})
                </Option>
              ))}
            </Select>
            <Button icon={<IconRefresh />} onClick={loadFiles} loading={loadingFiles}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={fileColumns}
          data={files}
          loading={loadingFiles}
          rowKey="file_hash"
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
            showTotal: true,
          }}
          noDataElement={<Empty description="暂无资产" />}
        />
      </Card>

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
