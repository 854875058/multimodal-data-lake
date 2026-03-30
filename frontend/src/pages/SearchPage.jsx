import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import { formatDateTime, truncateText } from '@/utils/format'

function ResultTable({ columns, rows }) {
  if (!Array.isArray(rows) || !rows.length) {
    return <div className="empty-state small">当前没有可展示的查询结果。</div>
  }

  const safeColumns = Array.isArray(columns) && columns.length ? columns : Object.keys(rows[0] || {})
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {safeColumns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {safeColumns.map((column) => (
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

function normalizeDorisStatus(item) {
  if (!item) {
    return null
  }

  return {
    connected: Boolean(item.online),
    mode: item.online ? 'live' : 'offline',
    status: item.status || '',
    message: item.note || '',
    endpoint: item.endpoint || '--',
    latency_ms: item.latency_ms ?? null,
    probed_at: item.probed_at || ''
  }
}

export default function SearchPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(null)
  const [externalTables, setExternalTables] = useState([])
  const [testingDoris, setTestingDoris] = useState(false)
  const [dorisStatus, setDorisStatus] = useState(null)
  const [sqlQuery, setSqlQuery] = useState('SHOW TABLES;')
  const [sqlResult, setSqlResult] = useState({ columns: [], rows: [], message: '', mode: '' })
  const [executingSql, setExecutingSql] = useState(false)
  const [externalForm, setExternalForm] = useState({
    table_name: 'lance_vector_table',
    source_path: 'seaweedfs://multimodal/lance_vectors',
    file_format: 'lance',
    schema: 'federated',
    comment: 'Lance 向量外表'
  })
  const [creatingExternalTable, setCreatingExternalTable] = useState(false)
  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产')
  const [generatedSql, setGeneratedSql] = useState('')
  const [convertingSql, setConvertingSql] = useState(false)
  const [vectorPrompt, setVectorPrompt] = useState('红色背景的图片')
  const [vectorModeHint, setVectorModeHint] = useState('text')
  const [vectorLimitHint, setVectorLimitHint] = useState(10)
  const [convertingVector, setConvertingVector] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('text')
  const [limit, setLimit] = useState(10)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [banner, setBanner] = useState({ type: '', message: '' })
  const [error, setError] = useState('')

  const loadPageData = async () => {
    setError('')
    try {
      const [settingsResponse, externalResponse, componentResponse] = await Promise.all([
        api.getPlatformSettings(),
        api.getExternalTables(),
        api.getPlatformComponentStatus('doris')
      ])
      setSettings(settingsResponse?.data || null)
      setExternalTables(Array.isArray(externalResponse?.items) ? externalResponse.items : [])
      const componentItem = Array.isArray(componentResponse?.items) ? componentResponse.items[0] : null
      setDorisStatus(normalizeDorisStatus(componentItem))
    } catch (requestError) {
      setError(getErrorMessage(requestError, '加载 Doris 查询台配置失败。'))
    }
  }

  useEffect(() => {
    loadPageData()
  }, [])

  const handleTestDoris = async () => {
    if (!settings) {
      return
    }
    setTestingDoris(true)
    setError('')
    try {
      const response = await api.testDorisConnection(settings)
      const componentResponse = await api.getPlatformComponentStatus('doris')
      const componentItem = Array.isArray(componentResponse?.items) ? componentResponse.items[0] : null
      setDorisStatus(
        componentItem
          ? normalizeDorisStatus(componentItem)
          : {
              connected: Boolean(response?.connected),
              mode: response?.mode || '',
              status: response?.connected ? '在线' : '离线',
              message: response?.message || '',
              endpoint: settings?.doris_mysql_host ? `${settings.doris_mysql_host}:${settings.doris_mysql_port || 9030}` : '--',
              latency_ms: null,
              probed_at: ''
            }
      )
      setBanner({ type: response?.connected ? 'success' : 'warning', message: response?.message || '连接测试完成。' })
    } catch (requestError) {
      setError(getErrorMessage(requestError, '测试 Doris 连接失败。'))
    } finally {
      setTestingDoris(false)
    }
  }

  const handleCreateExternalTable = async () => {
    setCreatingExternalTable(true)
    setError('')
    try {
      const response = await api.createExternalTable(externalForm)
      setBanner({ type: 'success', message: response?.message || '外表定义已保存。' })
      const externalResponse = await api.getExternalTables()
      setExternalTables(Array.isArray(externalResponse?.items) ? externalResponse.items : [])
      if (response?.data?.sql_preview) {
        setSqlQuery(response.data.sql_preview)
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, '创建外表失败。'))
    } finally {
      setCreatingExternalTable(false)
    }
  }

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) {
      setError('请输入要执行的 SQL。')
      return
    }
    setExecutingSql(true)
    setError('')
    try {
      const response = await api.executeDorisSql({ query: sqlQuery, limit: 20 })
      setSqlResult({
        columns: Array.isArray(response?.columns) ? response.columns : [],
        rows: Array.isArray(response?.rows) ? response.rows : [],
        message: response?.message || '',
        mode: response?.mode || ''
      })
    } catch (requestError) {
      setSqlResult({ columns: [], rows: [], message: '', mode: '' })
      setError(getErrorMessage(requestError, 'SQL 执行失败。'))
    } finally {
      setExecutingSql(false)
    }
  }

  const handleNlToSql = async () => {
    if (!nlPrompt.trim()) {
      setError('请输入自然语言问题。')
      return
    }
    setConvertingSql(true)
    setError('')
    try {
      const response = await api.convertNlToSql({ prompt: nlPrompt, top_k: 10 })
      const sql = response?.sql || ''
      setGeneratedSql(sql)
      setSqlQuery(sql)
      setBanner({ type: 'success', message: response?.reasoning || '已生成 SQL 草案。' })
    } catch (requestError) {
      setError(getErrorMessage(requestError, '自然语言转 SQL 失败。'))
    } finally {
      setConvertingSql(false)
    }
  }

  const handleNlToVector = async () => {
    if (!vectorPrompt.trim()) {
      setError('请输入语义检索描述。')
      return
    }
    setConvertingVector(true)
    setError('')
    try {
      const response = await api.convertNlToVector({ prompt: vectorPrompt, top_k: vectorLimitHint })
      const data = response?.data || {}
      setQuery(data.query || vectorPrompt)
      setMode(data.mode || 'text')
      setLimit(Number(data.top_k || 10))
      setVectorModeHint(data.mode || 'text')
      setBanner({ type: 'success', message: data.command_text || '已生成向量检索指令。' })
    } catch (requestError) {
      setError(getErrorMessage(requestError, '自然语言转向量检索失败。'))
    } finally {
      setConvertingVector(false)
    }
  }

  const handleVectorSearch = async (event) => {
    event.preventDefault()
    if (!query.trim()) {
      setError('请输入要检索的内容。')
      setSearched(false)
      return
    }
    setSearching(true)
    setError('')
    try {
      const response = await api.search(query.trim(), mode, Number(limit))
      if (!response.success) {
        throw new Error(response.message || '检索失败。')
      }
      setResults(Array.isArray(response.results) ? response.results : [])
      setSearched(true)
    } catch (requestError) {
      setResults([])
      setSearched(true)
      setError(getErrorMessage(requestError, '向量检索失败，请稍后重试。'))
    } finally {
      setSearching(false)
    }
  }

  const dorisEndpoint = settings?.doris_mysql_host ? `${settings.doris_mysql_host}:${settings.doris_mysql_port || 9030}` : '--'
  const dorisPasswordStatus = settings?.doris_password ? '已配置' : '未配置'

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">Doris 查询台</h1>
          <p className="page-subtitle">补齐参考文档里的 Doris 外表创建、SQL 编辑器、NL2SQL 与向量查询能力，形成统一的联邦查询入口。</p>
        </div>
      </div>

      {banner.message ? <div className={`${banner.type}-banner`}>{banner.message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="query-top-grid">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>Doris 连接状态</h2>
              <p>Doris 连接参数已统一收口到“来源配置”，查询台只消费已保存配置并负责联邦查询执行。</p>
            </div>
            {dorisStatus ? <span className={`badge ${dorisStatus.connected ? 'is-success' : 'is-warning'}`}>{dorisStatus.status || dorisStatus.mode}</span> : null}
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <div className="kpi-label">配置归口</div>
              <div className="detail-value">来源配置</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">Doris HTTP</div>
              <div className="detail-value mono">{settings?.doris_http_url || '--'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">MySQL 地址</div>
              <div className="detail-value mono">{dorisEndpoint}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">Database</div>
              <div className="detail-value">{settings?.doris_database || '--'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">User</div>
              <div className="detail-value">{settings?.doris_user || '--'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">Password</div>
              <div className="detail-value">{dorisPasswordStatus}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">最近探测</div>
              <div className="detail-value">{dorisStatus?.probed_at ? formatDateTime(dorisStatus.probed_at) : '--'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">探测说明</div>
              <div className="detail-value">{dorisStatus?.message || '尚未进行探测'}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">延迟</div>
              <div className="detail-value">{Number.isFinite(dorisStatus?.latency_ms) ? `${dorisStatus.latency_ms} ms` : '--'}</div>
            </div>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-primary" onClick={() => navigate('/settings/access')}>
              前往来源配置
            </button>
            <button type="button" className="button button-secondary" onClick={loadPageData}>
              刷新配置
            </button>
            <button type="button" className="button button-secondary" onClick={handleTestDoris} disabled={testingDoris}>
              {testingDoris ? '测试中...' : '测试 Doris 连接'}
            </button>
          </div>
        </section>

        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>外表创建</h2>
              <p>按照参考文档里的 SeaweedFS / Lance 外表方向，先提供建表定义和 SQL 预览。</p>
            </div>
          </div>

          <div className="query-settings-grid">
            <div className="field">
              <label htmlFor="external_table_name">表名</label>
              <input id="external_table_name" className="input" value={externalForm.table_name} onChange={(event) => setExternalForm((current) => ({ ...current, table_name: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="external_format">格式</label>
              <select id="external_format" className="select" value={externalForm.file_format} onChange={(event) => setExternalForm((current) => ({ ...current, file_format: event.target.value }))}>
                <option value="lance">lance</option>
                <option value="parquet">parquet</option>
                <option value="json">json</option>
              </select>
            </div>
            <div className="field grow-field">
              <label htmlFor="external_path">来源路径</label>
              <input id="external_path" className="input" value={externalForm.source_path} onChange={(event) => setExternalForm((current) => ({ ...current, source_path: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="external_comment">备注</label>
              <input id="external_comment" className="input" value={externalForm.comment} onChange={(event) => setExternalForm((current) => ({ ...current, comment: event.target.value }))} />
            </div>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-primary" onClick={handleCreateExternalTable} disabled={creatingExternalTable}>
              {creatingExternalTable ? '创建中...' : '创建外表定义'}
            </button>
          </div>

          <div className="query-pill-list">
            {externalTables.map((item) => (
              <div className="query-pill-card" key={`${item.table_name}-${item.created_at}`}>
                <div className="query-pill-title">{item.table_name}</div>
                <div className="query-pill-copy">{item.file_format} · {item.source_path}</div>
              </div>
            ))}
            {!externalTables.length ? <div className="empty-state small">当前还没有保存的外表定义。</div> : null}
          </div>
        </section>
      </div>

      <div className="query-studio-grid">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>SQL 编辑器</h2>
              <p>支持 `SHOW TABLES`、查询本地 `files / text_chunks / image_chunks`，未命中时返回明确错误，不再伪造 Mock 结果。</p>
            </div>
            {sqlResult.mode ? <span className="badge">{sqlResult.mode}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="sql_query">SQL</label>
            <textarea id="sql_query" className="textarea mono" value={sqlQuery} onChange={(event) => setSqlQuery(event.target.value)} />
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-primary" onClick={handleExecuteSql} disabled={executingSql}>
              {executingSql ? '执行中...' : '执行 SQL'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => setSqlQuery('SHOW TABLES;')}>
              恢复默认 SQL
            </button>
          </div>

          {generatedSql ? (
            <div className="detail-item">
              <div className="kpi-label">NL2SQL 结果</div>
              <div className="detail-value mono">{generatedSql}</div>
            </div>
          ) : null}

          {sqlResult.message ? <div className="workbench-help">{sqlResult.message}</div> : null}
          <ResultTable columns={sqlResult.columns} rows={sqlResult.rows} />
        </section>

        <section className="glass-card query-side-stack">
          <div className="card-header">
            <div>
              <h2>自然语言与向量检索</h2>
              <p>结合参考文档里的 NL → SQL / 向量检索方向，先做可执行草案生成与当前检索能力联动。</p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="nl_prompt">NL → SQL</label>
            <textarea id="nl_prompt" className="textarea" value={nlPrompt} onChange={(event) => setNlPrompt(event.target.value)} />
          </div>
          <button type="button" className="button button-secondary" onClick={handleNlToSql} disabled={convertingSql}>
            {convertingSql ? '转换中...' : '生成 SQL'}
          </button>

          <div className="field">
            <label htmlFor="vector_prompt">NL → 向量检索</label>
            <textarea id="vector_prompt" className="textarea" value={vectorPrompt} onChange={(event) => setVectorPrompt(event.target.value)} />
          </div>
          <button type="button" className="button button-secondary" onClick={handleNlToVector} disabled={convertingVector}>
            {convertingVector ? '生成中...' : '生成检索指令'}
          </button>

          <div className="detail-grid">
            <div className="detail-item">
              <div className="kpi-label">推荐模式</div>
              <div className="detail-value">{vectorModeHint}</div>
            </div>
            <div className="detail-item">
              <div className="kpi-label">推荐 Top K</div>
              <div className="detail-value">{vectorLimitHint}</div>
            </div>
          </div>

          <form className="search-form" onSubmit={handleVectorSearch}>
            <div className="field grow-field">
              <label htmlFor="query">语义查询</label>
              <input id="query" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="请输入语义描述、关键词或图片描述" />
            </div>
            <div className="field compact-field">
              <label htmlFor="mode">模式</label>
              <select id="mode" className="select" value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="text">文本</option>
                <option value="image">图像</option>
              </select>
            </div>
            <div className="field compact-field">
              <label htmlFor="limit">Top K</label>
              <select id="limit" className="select" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
            <div className="toolbar-group search-actions">
              <button type="submit" className="button button-primary" disabled={searching}>
                {searching ? '检索中...' : '开始检索'}
              </button>
            </div>
          </form>

          <div className="result-list">
            {!searched ? <div className="empty-state small">先生成检索指令或直接输入语义查询。</div> : null}
            {searched && !results.length && !error ? <div className="empty-state small">没有找到匹配的向量结果。</div> : null}
            {results.map((result, index) => (
              <div className="result-card glass-card" key={`${result.file_hash}-${index}`}>
                <div className="result-head">
                  <div>
                    <div className="result-title">{result.doc_name || '未命名文件'}</div>
                    <div className="result-meta">类型：{result.doc_type || '未知'} · 距离：{Number(result.distance ?? 0).toFixed(4)}</div>
                  </div>
                  <span className="badge">#{index + 1}</span>
                </div>
                <div className="result-snippet">
                  {truncateText(result.text || '该结果暂无文本摘要。', 200)}
                </div>
                <div className="result-meta is-secondary">来源：{result.source_uri || '本地入库文件'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
