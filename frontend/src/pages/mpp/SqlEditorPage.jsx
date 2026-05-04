import { useEffect, useRef, useState } from 'react'

const MPP_BASE = '/api/mpp'

async function mppGet(path, params = {}) {
  const url = new URL(MPP_BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`MPP 请求失败: ${res.status}`)
  return res.json()
}

async function mppPost(path, body = {}) {
  const res = await fetch(MPP_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`MPP 请求失败: ${res.status}`)
  return res.json()
}

function ResultTable({ columns, rows }) {
  if (!columns || columns.length === 0) return <p className="mpp-empty">无结果集</p>
  return (
    <div className="mpp-result-scroll">
      <table className="data-table mpp-result-table">
        <thead>
          <tr>{columns.map((col, i) => <th key={i}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {(rows || []).map((row, ri) => (
            <tr key={ri}>
              {(Array.isArray(row) ? row : columns.map(c => row[c])).map((cell, ci) => (
                <td key={ci} className="mono">{cell === null ? <span className="mpp-null">NULL</span> : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SlowSqlPanel({ clusterId }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)

  const load = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const data = await mppGet('/sql/slowSqlList', { clusterId, pageNum: page, pageSize: 20 })
      setList(data.data?.list || data.data || data || [])
    } catch (e) {
      console.warn('慢SQL加载失败:', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [clusterId, page])

  return (
    <div className="mpp-slow-sql">
      <div className="mpp-panel-header">
        <h3 className="mpp-section-title">慢 SQL 分析</h3>
        <button className="button button-secondary button-small" onClick={load} disabled={loading}>刷新</button>
      </div>
      {loading ? <div className="mpp-loading">加载中...</div> : (
        list.length === 0 ? <p className="mpp-empty">暂无慢 SQL 记录</p> : (
          <div className="mpp-result-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>执行时间</th>
                  <th>耗时(ms)</th>
                  <th>数据库</th>
                  <th>SQL 语句</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row, i) => (
                  <tr key={i}>
                    <td>{row.startTime || row.createTime || '—'}</td>
                    <td className="mono">{row.queryTimeMs || row.time || '—'}</td>
                    <td>{row.db || row.database || '—'}</td>
                    <td className="mpp-sql-cell mono">{row.stmt || row.sql || '—'}</td>
                    <td>{row.state || row.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export default function SqlEditorPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [databases, setDatabases] = useState([])
  const [selectedDb, setSelectedDb] = useState('')
  const [tables, setTables] = useState([])
  const [sql, setSql] = useState('SELECT 1;')
  const [result, setResult] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [activeTab, setActiveTab] = useState('editor')
  const [historyPage, setHistoryPage] = useState(1)
  const textareaRef = useRef(null)

  useEffect(() => {
    mppGet('/new/cluster/list').then(data => {
      const list = data.data || data || []
      setClusters(list)
      if (list.length > 0) {
        const id = list[0].clusterId || list[0].id
        setClusterId(String(id))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!clusterId) return
    mppGet('/sql/dbList', { clusterId }).then(data => {
      setDatabases(data.data || data || [])
    }).catch(() => {})
  }, [clusterId])

  useEffect(() => {
    if (!clusterId || !selectedDb) return
    mppGet('/sql/tableList', { clusterId, dbName: selectedDb }).then(data => {
      setTables(data.data || data || [])
    }).catch(() => {})
  }, [clusterId, selectedDb])

  const loadHistory = async () => {
    try {
      const data = await mppGet('/sql/list', { pageNum: historyPage, pageSize: 20 })
      setHistory(data.data?.list || data.data || [])
    } catch (e) {}
  }

  useEffect(() => {
    if (activeTab === 'history') loadHistory()
  }, [activeTab, historyPage])

  const handleExecute = async () => {
    if (!sql.trim()) return
    setExecuting(true)
    setError('')
    setResult(null)
    try {
      const data = await mppPost('/sql/execute', {
        sql: sql.trim(),
        clusterId: Number(clusterId) || clusterId,
        db: selectedDb || undefined,
      })
      const payload = data.data || data
      setResult({
        columns: payload.columns || payload.columnNames || Object.keys((payload.rows || payload.data || [[]])[0] || {}),
        rows: payload.rows || payload.data || [],
        affectedRows: payload.affectedRows,
        time: payload.time || payload.queryTime,
      })
    } catch (e) {
      setError('执行失败：' + e.message)
    } finally {
      setExecuting(false)
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleExecute()
    }
    // Tab 缩进
    if (e.key === 'Tab') {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const next = sql.substring(0, start) + '  ' + sql.substring(end)
      setSql(next)
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2
      }, 0)
    }
  }

  const insertTable = (tableName) => {
    const insert = `SELECT * FROM ${selectedDb ? selectedDb + '.' : ''}${tableName} LIMIT 100;`
    setSql(insert)
    textareaRef.current?.focus()
  }

  return (
    <div className="content-wrap mpp-sql-editor-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">SQL 编辑器</h1>
          <p className="page-sub">面向 Doris 集群的多标签 SQL 查询工具</p>
        </div>
      </div>

      <div className="mpp-sql-layout">
        {/* 左侧数据库树 */}
        <div className="mpp-sql-sidebar">
          <div className="mpp-sql-sidebar-head">
            <select
              className="field-input mpp-cluster-select"
              value={clusterId}
              onChange={e => setClusterId(e.target.value)}
            >
              <option value="">选择集群</option>
              {clusters.map((c, i) => (
                <option key={i} value={c.clusterId || c.id}>{c.clusterName || c.name}</option>
              ))}
            </select>
          </div>

          <div className="mpp-db-tree">
            {databases.length === 0 ? (
              <p className="mpp-empty">暂无数据库</p>
            ) : databases.map((db, i) => {
              const dbName = typeof db === 'string' ? db : (db.name || db.dbName)
              const isOpen = selectedDb === dbName
              return (
                <div key={i} className="mpp-db-node">
                  <button
                    className={`mpp-db-label${isOpen ? ' is-open' : ''}`}
                    onClick={() => setSelectedDb(isOpen ? '' : dbName)}
                  >
                    <span className="mpp-db-icon">🗄️</span>
                    <span>{dbName}</span>
                    <span className="mpp-db-chevron">{isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && (
                    <div className="mpp-table-list">
                      {tables.length === 0 ? (
                        <span className="mpp-table-empty">暂无表</span>
                      ) : tables.map((t, j) => {
                        const tName = typeof t === 'string' ? t : (t.name || t.tableName)
                        return (
                          <button
                            key={j}
                            className="mpp-table-item"
                            onClick={() => insertTable(tName)}
                            title="点击生成 SELECT 语句"
                          >
                            <span className="mpp-table-icon">📋</span>
                            <span>{tName}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 右侧编辑区 */}
        <div className="mpp-sql-main">
          {/* 子 Tab */}
          <div className="mpp-tabs">
            {[
              { key: 'editor', label: 'SQL 编辑器' },
              { key: 'history', label: '执行历史' },
              { key: 'slow', label: '慢 SQL 分析' },
            ].map(t => (
              <button
                key={t.key}
                className={`mpp-tab${activeTab === t.key ? ' is-active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >{t.label}</button>
            ))}
          </div>

          {activeTab === 'editor' && (
            <div className="mpp-editor-panel">
              <div className="mpp-editor-toolbar">
                <select
                  className="field-input mpp-db-select"
                  value={selectedDb}
                  onChange={e => setSelectedDb(e.target.value)}
                >
                  <option value="">选择数据库</option>
                  {databases.map((db, i) => {
                    const n = typeof db === 'string' ? db : (db.name || db.dbName)
                    return <option key={i} value={n}>{n}</option>
                  })}
                </select>
                <button
                  className="button button-primary"
                  onClick={handleExecute}
                  disabled={executing || !clusterId}
                >
                  {executing ? '执行中...' : '▶ 执行 (Ctrl+Enter)'}
                </button>
              </div>

              <textarea
                ref={textareaRef}
                className="mpp-sql-textarea"
                value={sql}
                onChange={e => setSql(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入 SQL 语句，Ctrl+Enter 执行..."
                spellCheck={false}
              />

              {error && <div className="error-banner">{error}</div>}

              {result && (
                <div className="mpp-result-panel">
                  <div className="mpp-result-meta">
                    {result.affectedRows !== undefined && (
                      <span>影响行数：{result.affectedRows}</span>
                    )}
                    {result.time && <span>耗时：{result.time} ms</span>}
                    {result.rows && <span>结果行数：{result.rows.length}</span>}
                  </div>
                  <ResultTable columns={result.columns} rows={result.rows} />
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="mpp-editor-panel glass-card">
              <h3 className="mpp-section-title">执行历史</h3>
              {history.length === 0 ? (
                <p className="mpp-empty">暂无历史记录</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>执行时间</th>
                      <th>数据库</th>
                      <th>SQL</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row, i) => (
                      <tr key={i}>
                        <td>{row.createTime || row.startTime || '—'}</td>
                        <td>{row.db || '—'}</td>
                        <td className="mpp-sql-cell mono">{row.stmt || row.sql || '—'}</td>
                        <td>{row.state || '—'}</td>
                        <td>
                          <button
                            className="button button-small"
                            onClick={() => { setSql(row.stmt || row.sql || ''); setActiveTab('editor') }}
                          >复用</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'slow' && (
            <div className="mpp-editor-panel">
              <SlowSqlPanel clusterId={clusterId} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
