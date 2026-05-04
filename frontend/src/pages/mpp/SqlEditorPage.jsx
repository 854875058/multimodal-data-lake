import { useEffect, useRef, useState } from 'react'

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
              {columns.map((col, ci) => (
                <td key={ci} className="mono">
                  {row[col] === null || row[col] === undefined
                    ? <span className="mpp-null">NULL</span>
                    : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  const [activeTab, setActiveTab] = useState('editor')
  const textareaRef = useRef(null)

  // 加载集群列表
  useEffect(() => {
    dorisGet('/clusters').then(data => {
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0) {
        setClusterId(list[0].id)
      }
    }).catch(() => {})
  }, [])

  // 加载数据库列表
  useEffect(() => {
    if (!clusterId) return
    dorisGet('/sql/databases', { cluster_id: clusterId }).then(data => {
      setDatabases(data.databases || [])
    }).catch(() => {})
  }, [clusterId])

  // 加载表列表
  useEffect(() => {
    if (!clusterId || !selectedDb) return
    dorisGet('/sql/tables', { cluster_id: clusterId, database: selectedDb }).then(data => {
      setTables(data.tables || [])
    }).catch(() => {})
  }, [clusterId, selectedDb])

  const handleExecute = async () => {
    if (!sql.trim()) return
    if (!clusterId) {
      setError('请先选择集群')
      return
    }
    setExecuting(true)
    setError('')
    setResult(null)
    try {
      const data = await dorisPost('/sql/execute', {
        cluster_id: clusterId,
        sql: sql.trim(),
        limit: 500,
      })
      if (!data.success) {
        setError(data.detail || '执行失败')
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
    const insert = `SELECT * FROM ${selectedDb ? '`' + selectedDb + '`.' : ''}\`${tableName}\` LIMIT 100;`
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
              onChange={e => { setClusterId(e.target.value); setSelectedDb(''); setTables([]) }}
            >
              <option value="">选择集群</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="mpp-db-tree">
            {clusters.length === 0 ? (
              <p className="mpp-empty">请先在集群管理中添加 Doris 集群</p>
            ) : databases.length === 0 ? (
              <p className="mpp-empty">暂无数据库</p>
            ) : databases.map((dbName, i) => {
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
                      ) : tables.map((tName, j) => (
                        <button
                          key={j}
                          className="mpp-table-item"
                          onClick={() => insertTable(tName)}
                          title="点击生成 SELECT 语句"
                        >
                          <span className="mpp-table-icon">📋</span>
                          <span>{tName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 右侧编辑区 */}
        <div className="mpp-sql-main">
          <div className="mpp-tabs">
            {[
              { key: 'editor', label: 'SQL 编辑器' },
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
                  {databases.map((dbName, i) => (
                    <option key={i} value={dbName}>{dbName}</option>
                  ))}
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
                    {result.affectedRows !== undefined && result.affectedRows !== null && (
                      <span>影响行数：{result.affectedRows}</span>
                    )}
                    {result.elapsed !== undefined && <span>耗时：{result.elapsed} s</span>}
                    {result.rows && result.columns.length > 0 && <span>结果行数：{result.rows.length}</span>}
                    {result.hasMore && <span className="mpp-warn">（结果已截断，最多显示 500 行）</span>}
                    {result.message && <span>{result.message}</span>}
                  </div>
                  <ResultTable columns={result.columns} rows={result.rows} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
