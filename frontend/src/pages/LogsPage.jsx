import { useEffect, useMemo, useState } from 'react'
import api, { getErrorMessage } from '@/api'
import { formatDateTime } from '@/utils/format'

export default function LogsPage() {
  const [lines, setLines] = useState(500)
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const lineCount = useMemo(() => {
    if (!logs) {
      return 0
    }
    return logs.split(/\r?\n/).filter(Boolean).length
  }, [logs])

  const loadLogs = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await api.getLogs(Number(lines))
      setLogs(response?.logs || '')
      setLastUpdated(new Date())
    } catch (requestError) {
      setLogs('')
      setError(getErrorMessage(requestError, '加载日志失败。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [lines])

  const downloadLogs = () => {
    const blob = new Blob([logs || ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `app-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">系统日志</h1>
          <p className="page-subtitle">查看后端日志内容，支持切换行数、手动刷新，并导出文本文件用于平台排障。</p>
        </div>
      </div>

      <div className="glass-card">
        <div className="toolbar">
          <div className="toolbar-group">
            <div className="field compact-field">
              <label htmlFor="lines">日志行数</label>
              <select id="lines" className="select" value={lines} onChange={(event) => setLines(Number(event.target.value))}>
                <option value="100">100</option>
                <option value="300">300</option>
                <option value="500">500</option>
                <option value="1000">1000</option>
                <option value="2000">2000</option>
              </select>
            </div>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-secondary" onClick={loadLogs} disabled={loading}>
              {loading ? '刷新中...' : '刷新日志'}
            </button>
            <button type="button" className="button button-primary" onClick={downloadLogs} disabled={!logs}>
              下载日志
            </button>
          </div>
        </div>

        <div className="log-meta">
          <span>当前展示 {lineCount} 行</span>
          <span>最近刷新：{lastUpdated ? formatDateTime(lastUpdated) : '--'}</span>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}
        {loading ? <div className="loading-state">正在读取日志...</div> : null}
        {!loading && !error && !logs ? <div className="empty-state">暂无日志内容。</div> : null}
        {!loading && logs ? <pre className="log-viewer">{logs}</pre> : null}
      </div>
    </div>
  )
}
