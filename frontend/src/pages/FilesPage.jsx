import { useEffect, useMemo, useState } from 'react'
import api, { getErrorMessage } from '@/api'
import PreviewModal from '@/components/PreviewModal.jsx'

const initialPreview = {
  open: false,
  loading: false,
  preview: null,
  error: ''
}

function ResultTable({ rows }) {
  if (!Array.isArray(rows) || !rows.length) {
    return <div className="empty-state small">当前表暂无可展示样本。</div>
  }

  const columns = Object.keys(rows[0] || {})
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>
                  <div className="table-secondary" title={String(row?.[column] ?? '')}>
                    {String(row?.[column] ?? '--')}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [actionMessage, setActionMessage] = useState('')
  const [actionType, setActionType] = useState('success')
  const [deletingHash, setDeletingHash] = useState('')
  const [error, setError] = useState('')
  const [previewState, setPreviewState] = useState(initialPreview)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize])

  const loadPlatform = async () => {
    setError('')
    try {
      const [settingsResponse, catalogResponse] = await Promise.all([
        api.getPlatformSettings(),
        api.getAssetCatalogs()
      ])
      const nextSettings = settingsResponse?.data || {}
      const nextCatalogs = Array.isArray(catalogResponse?.items) ? catalogResponse.items : []
      setSettings(nextSettings)
      setCatalogs(nextCatalogs)
      setSelectedCatalog(nextCatalogs[0]?.name || '')
    } catch (requestError) {
      setError(getErrorMessage(requestError, '加载平台资产目录失败。'))
    }
  }

  const loadFileTypes = async () => {
    try {
      const result = await api.getFileTypes()
      setFileTypes(Array.isArray(result) ? result : [])
    } catch {
      setFileTypes([])
    }
  }

  const loadFiles = async () => {
    setLoadingFiles(true)
    setActionMessage('')
    try {
      const result = await api.getFiles(page, pageSize, docType)
      setFiles(Array.isArray(result.files) ? result.files : [])
      setTotal(Number(result.total || 0))
    } catch (requestError) {
      setFiles([])
      setTotal(0)
      setActionType('error')
      setActionMessage(getErrorMessage(requestError, '加载资产列表失败。'))
    } finally {
      setLoadingFiles(false)
    }
  }

  const loadSchemas = async (catalog) => {
    if (!catalog) {
      setSchemas([])
      setSelectedSchema('')
      return
    }
    try {
      const response = await api.getAssetSchemas(catalog)
      const nextSchemas = Array.isArray(response?.items) ? response.items : []
      setSchemas(nextSchemas)
      setSelectedSchema(nextSchemas[0]?.name || '')
    } catch (requestError) {
      setSchemas([])
      setSelectedSchema('')
      setError(getErrorMessage(requestError, '加载 Schema 列表失败。'))
    }
  }

  const loadTables = async (catalog, schema) => {
    if (!catalog || !schema) {
      setTables([])
      setSelectedTable('')
      return
    }
    try {
      const response = await api.getAssetTables(catalog, schema)
      const nextTables = Array.isArray(response?.items) ? response.items : []
      setTables(nextTables)
      setSelectedTable(nextTables[0]?.name || '')
    } catch (requestError) {
      setTables([])
      setSelectedTable('')
      setError(getErrorMessage(requestError, '加载数据表列表失败。'))
    }
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
    } catch (requestError) {
      setAssetDetail(null)
      setError(getErrorMessage(requestError, '加载资产详情失败。'))
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadPlatform()
    loadFileTypes()
  }, [])

  useEffect(() => {
    loadFiles()
  }, [docType, page])

  useEffect(() => {
    loadSchemas(selectedCatalog)
  }, [selectedCatalog])

  useEffect(() => {
    loadTables(selectedCatalog, selectedSchema)
  }, [selectedCatalog, selectedSchema])

  useEffect(() => {
    loadDetail(selectedCatalog, selectedSchema, selectedTable)
  }, [selectedCatalog, selectedSchema, selectedTable])

  const handlePreview = async (fileHash) => {
    setPreviewState({ open: true, loading: true, preview: null, error: '' })
    try {
      const result = await api.previewFile(fileHash)
      setPreviewState({ open: true, loading: false, preview: result, error: '' })
    } catch (requestError) {
      setPreviewState({ open: true, loading: false, preview: null, error: getErrorMessage(requestError, '加载文件预览失败。') })
    }
  }

  const closePreview = () => {
    setPreviewState(initialPreview)
  }

  const handleDelete = async (file) => {
    const confirmed = window.confirm(`确认删除资产"${file.doc_name || '未命名文件'}"吗？该操作不可撤销。`)
    if (!confirmed) {
      return
    }

    setDeletingHash(file.file_hash)
    setActionMessage('')
    try {
      const result = await api.deleteFile(file.file_hash)
      setActionType(result.success ? 'success' : 'error')
      setActionMessage(result.message || (result.success ? '删除成功。' : '删除失败。'))
      if (result.success) {
        await Promise.all([loadFileTypes(), loadFiles(), loadDetail(selectedCatalog, selectedSchema, selectedTable)])
      }
    } catch (requestError) {
      setActionType('error')
      setActionMessage(getErrorMessage(requestError, '删除资产失败。'))
    } finally {
      setDeletingHash('')
    }
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">资产浏览器</h1>
          <p className="page-subtitle">参考 Gravitino 三级目录组织资产浏览，结合当前 Lance 数据和已入湖文件提供预览、筛选与治理入口。</p>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="catalog-shell">
        <section className="glass-card catalog-tree-card">
          <div className="card-header">
            <div>
              <h2>Gravitino 目录树</h2>
              <p>按 Catalog → Schema → Table 组织当前平台资产结构。</p>
            </div>
          </div>

          <div className="catalog-selectors">
            <div className="field">
              <label htmlFor="catalog_select">Catalog</label>
              <select id="catalog_select" className="select" value={selectedCatalog} onChange={(event) => setSelectedCatalog(event.target.value)}>
                {catalogs.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="schema_select">Schema</label>
              <select id="schema_select" className="select" value={selectedSchema} onChange={(event) => setSelectedSchema(event.target.value)}>
                {schemas.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="catalog-table-list">
            {tables.map((item) => (
              <button
                key={item.name}
                type="button"
                className={`catalog-table-item${selectedTable === item.name ? ' is-active' : ''}`}
                onClick={() => setSelectedTable(item.name)}
              >
                <div>
                  <div className="catalog-table-name">{item.label}</div>
                  <div className="catalog-table-copy">{item.description}</div>
                </div>
                <span className="badge">{item.engine}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card catalog-detail-card">
          <div className="card-header">
            <div>
              <h2>{assetDetail?.table || '资产详情'}</h2>
              <p>{assetDetail?.description || '选择左侧表后查看字段结构、存储位置和样本数据。'}</p>
            </div>
            {assetDetail ? <span className="badge">{assetDetail.engine}</span> : null}
          </div>

          {detailLoading ? <div className="loading-state compact">正在加载资产详情...</div> : null}

          {!detailLoading && assetDetail ? (
            <>
              <div className="catalog-metric-grid">
                <div className="catalog-metric-card">
                  <div className="kpi-label">所属路径</div>
                  <div className="catalog-metric-value mono">{assetDetail.catalog}.{assetDetail.schema}</div>
                </div>
                <div className="catalog-metric-card">
                  <div className="kpi-label">样本行数</div>
                  <div className="catalog-metric-value">{assetDetail.row_count}</div>
                </div>
                <div className="catalog-metric-card">
                  <div className="kpi-label">字段数</div>
                  <div className="catalog-metric-value">{assetDetail.columns?.length || 0}</div>
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <div className="kpi-label">存储位置</div>
                  <div className="detail-value mono">{assetDetail.storage_path || '--'}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">文件格式</div>
                  <div className="detail-value">{assetDetail.file_format || assetDetail.engine || '--'}</div>
                </div>
              </div>

              <div className="section-title">字段结构</div>
              <ResultTable rows={assetDetail.columns || []} />

              <div className="section-title">样本预览</div>
              <ResultTable rows={assetDetail.sample_rows || []} />
            </>
          ) : null}
        </section>
      </div>

      <div className="catalog-shell">
        <section className="glass-card catalog-preview-card">
          <div className="card-header">
            <div>
              <h2>多模态预览</h2>
              <p>从当前表里抽取可预览样本，便于快速查看图片、PDF 或文档资产。</p>
            </div>
          </div>

          <div className="catalog-preview-actions">
            {(assetDetail?.media_samples || []).map((item) => (
              <button key={item.file_hash} type="button" className="catalog-preview-tile" onClick={() => handlePreview(item.file_hash)}>
                <div className="catalog-preview-title">{item.doc_name}</div>
                <div className="catalog-preview-copy">{item.doc_type}</div>
              </button>
            ))}
            {!assetDetail?.media_samples?.length ? <div className="empty-state small">当前选中表没有可预览的多模态样本。</div> : null}
          </div>
        </section>

        <section className="glass-card catalog-preview-card">
          <div className="card-header">
            <div>
              <h2>平台连接摘要</h2>
              <p>当前页面关联的目录与存储入口。</p>
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <div className="kpi-label">Gravitino</div>
              <div className="detail-value mono">{settings?.gravitino_url || '--'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">Metalake</div>
              <div className="detail-value">{settings?.metalake || '--'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">SeaweedFS Master</div>
              <div className="detail-value mono">{settings?.seaweedfs_master_url || '--'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">SeaweedFS S3</div>
              <div className="detail-value mono">{settings?.seaweedfs_s3_url || '--'}</div>
            </div>
          </div>
        </section>
      </div>

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>已入湖资产列表</h2>
            <p>当前系统里实际可管理的文件资产，支持预览与删除。</p>
          </div>
        </div>

        <div className="toolbar">
          <div className="toolbar-group">
            <div className="field compact-field">
              <label htmlFor="docType">文件类型</label>
              <select
                id="docType"
                className="select"
                value={docType}
                onChange={(event) => {
                  setPage(1)
                  setDocType(event.target.value)
                }}
              >
                <option value="all">全部类型</option>
                {fileTypes.map((item) => (
                  <option key={item.doc_type || 'unknown'} value={item.doc_type}>
                    {item.doc_type || '未知'}（{item.count}）
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-secondary" onClick={loadFiles} disabled={loadingFiles}>
              {loadingFiles ? '刷新中...' : '刷新资产'}
            </button>
          </div>
        </div>

        {actionMessage ? <div className={`${actionType}-banner`}>{actionMessage}</div> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>文件名称</th>
                <th>类型</th>
                <th>来源</th>
                <th>哈希</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loadingFiles ? (
                <tr>
                  <td colSpan="5">
                    <div className="loading-state compact">正在加载资产列表...</div>
                  </td>
                </tr>
              ) : null}

              {!loadingFiles && !files.length ? (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state small">当前没有可展示的资产。</div>
                  </td>
                </tr>
              ) : null}

              {!loadingFiles && files.map((file) => (
                <tr key={file.file_hash}>
                  <td>
                    <div className="table-primary">{file.doc_name || '未命名文件'}</div>
                  </td>
                  <td>
                    <span className="badge">{file.doc_type || '未知'}</span>
                  </td>
                  <td>
                    <div className="table-secondary" title={file.source_uri || ''}>{file.source_uri || '本地上传'}</div>
                  </td>
                  <td>
                    <div className="table-secondary mono" title={file.file_hash}>{file.file_hash}</div>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button type="button" className="button button-ghost button-small" onClick={() => handlePreview(file.file_hash)}>
                        预览
                      </button>
                      <button type="button" className="button button-danger button-small" onClick={() => handleDelete(file)} disabled={deletingHash === file.file_hash}>
                        {deletingHash === file.file_hash ? '删除中...' : '删除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <div className="pagination-meta">共 {total} 条，当前第 {page} / {totalPages} 页</div>
          <div className="toolbar-group">
            <button type="button" className="button button-secondary button-small" onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))} disabled={page <= 1 || loadingFiles}>
              上一页
            </button>
            <button type="button" className="button button-secondary button-small" onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))} disabled={page >= totalPages || loadingFiles}>
              下一页
            </button>
          </div>
        </div>
      </section>

      <PreviewModal
        open={previewState.open}
        loading={previewState.loading}
        preview={previewState.preview}
        error={previewState.error}
        onClose={closePreview}
      />
    </div>
  )
}
