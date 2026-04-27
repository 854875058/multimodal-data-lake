import { useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import { formatBytes } from '@/utils/format'

function buildKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

const acceptedFormats = ['txt', 'pdf', 'docx', 'pptx', 'jpg', 'png', 'mp3', 'wav', 'mp4', 'zip', 'tar', 'gz', 'tgz']

export default function UploadPage() {
  const inputRef = useRef(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  const totalSize = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0),
    [selectedFiles]
  )

  const formatSummary = useMemo(
    () => acceptedFormats.slice(0, 8).join(' / '),
    []
  )

  const addFiles = (incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || [])
    if (!nextFiles.length) {
      return
    }

    setSelectedFiles((currentFiles) => {
      const exists = new Set(currentFiles.map(buildKey))
      const merged = [...currentFiles]
      nextFiles.forEach((file) => {
        const key = buildKey(file)
        if (!exists.has(key)) {
          merged.push(file)
          exists.add(key)
        }
      })
      return merged
    })
  }

  const handleInputChange = (event) => {
    addFiles(event.target.files)
    event.target.value = ''
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const removeFile = (fileKey) => {
    setSelectedFiles((currentFiles) => currentFiles.filter((file) => buildKey(file) !== fileKey))
  }

  const clearFiles = () => {
    setSelectedFiles([])
    setProgress(0)
    setMessage('')
  }

  const openPicker = () => {
    inputRef.current?.click()
  }

  const submitUpload = async () => {
    if (!selectedFiles.length) {
      setMessageType('warning')
      setMessage('请先选择需要上传的文件。')
      return
    }

    setUploading(true)
    setProgress(0)
    setMessage('')

    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 10))
    }, 180)

    try {
      const result = await api.uploadFiles(selectedFiles)
      window.clearInterval(timer)
      setProgress(100)
      setMessageType(result.success ? 'success' : 'error')
      setMessage(result.message || (result.success ? '上传成功。' : '上传失败。'))

      if (result.success) {
        setSelectedFiles([])
      }
    } catch (error) {
      window.clearInterval(timer)
      setProgress(100)
      setMessageType('error')
      setMessage(getErrorMessage(error, '上传失败，请稍后重试。'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">本地上传</h1>
          <p className="page-subtitle">处理本机文件、离线交付件和压缩包的快速入湖。远程来源接入、扫描预览和批量任务请使用"接入与扫描"。</p>
        </div>
        <div className="page-actions">
          <NavLink to="/workbench" className="button button-secondary">
            前往接入与扫描
          </NavLink>
          <button type="button" className="button button-primary" onClick={openPicker}>
            选择文件
          </button>
        </div>
      </div>

      {message ? <div className={`${messageType}-banner`}>{message}</div> : null}

      <section className="glass-card workbench-console-panel">
        <div className="workbench-guide-strip">
          <span className="badge">Local Upload</span>
          <span className="workbench-guide-copy">适合本地直传。压缩包会在服务端自动解包处理；如果数据本来就在 S3 / SeaweedFS 或 SFTP，不建议先下载再回来上传。</span>
        </div>

        <div className="workbench-summary-grid">
          <div className="workbench-summary-card">
            <div className="kpi-label">入口类型</div>
            <div className="workbench-summary-value">本地直传</div>
            <div className="workbench-summary-note">面向本机文件、离线材料和一次性交付包。</div>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">支持格式</div>
            <div className="workbench-summary-value">文件 / 压缩包</div>
            <div className="workbench-summary-note">{formatSummary} 等格式，包含压缩包导入。</div>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">已选文件</div>
            <div className="workbench-summary-value">{selectedFiles.length}</div>
            <div className="workbench-summary-note">可以批量选择并去重，支持拖拽追加。</div>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">总大小</div>
            <div className="workbench-summary-value">{formatBytes(totalSize)}</div>
            <div className="workbench-summary-note">单次上传总大小受后端限制，超限会在服务端返回明确错误。</div>
          </div>
        </div>

        <div className="local-upload-shell">
          <div
            className={`upload-dropzone local-upload-dropzone${dragging ? ' is-dragging' : ''}`}
            onClick={openPicker}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragging(false)
            }}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openPicker()
              }
            }}
          >
            <div className="upload-icon">LOCAL</div>
            <h2>拖拽文件到这里，或点击选择文件</h2>
            <p>面向本地文件直传。选完即可直接上传，不需要先配置远程来源。</p>
            <div className="toolbar-group">
              <button type="button" className="button button-primary">
                选择本地文件
              </button>
              <button type="button" className="button button-secondary" onClick={(event) => { event.stopPropagation(); submitUpload() }} disabled={uploading || !selectedFiles.length}>
                {uploading ? '上传中...' : '上传并入湖'}
              </button>
            </div>
            <input ref={inputRef} type="file" multiple className="hidden-input" onChange={handleInputChange} />
          </div>

          <div className="local-upload-side">
            <section className="glass-card local-upload-side-card">
              <div className="card-header">
                <div>
                  <h2>适用场景</h2>
                  <p>把入口边界说清楚，避免把本地上传和来源接入混成一类。</p>
                </div>
              </div>
              <div className="local-upload-note-list">
                <div className="local-upload-note-item">适合：本地临时文件、离线材料、交付压缩包。</div>
                <div className="local-upload-note-item">支持：`zip / tar / gz / tgz` 自动解包处理。</div>
                <div className="local-upload-note-item">不适合：远程目录扫描、来源配置复用、按目录批量接入。</div>
              </div>
            </section>

            <section className="glass-card local-upload-side-card">
              <div className="card-header">
                <div>
                  <h2>当前选择</h2>
                  <p>上传前先确认数量、大小和后续动作。</p>
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="kpi-label">文件数</div>
                  <div className="detail-value">{selectedFiles.length}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">总大小</div>
                  <div className="detail-value">{formatBytes(totalSize)}</div>
                </div>
              </div>
              <div className="toolbar-group">
                <button type="button" className="button button-secondary" onClick={clearFiles} disabled={uploading || !selectedFiles.length}>
                  清空列表
                </button>
                <NavLink to="/workbench" className="button button-ghost">
                  改走接入与扫描
                </NavLink>
              </div>
            </section>
          </div>
        </div>

        {progress > 0 ? (
          <div className="progress-block">
            <div className="progress-track">
              <div className={`progress-value is-${messageType}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-text">上传进度 {progress}%</div>
          </div>
        ) : null}
      </section>

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>待上传列表</h2>
            <p>这里展示即将上传入湖的本地文件；上传成功后列表会清空。</p>
          </div>
          <span className="badge">{selectedFiles.length ? `${selectedFiles.length} 项` : '空列表'}</span>
        </div>

        {selectedFiles.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>大小</th>
                  <th>类型</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {selectedFiles.map((file) => {
                  const fileKey = buildKey(file)
                  return (
                    <tr key={fileKey}>
                      <td>
                        <div className="table-primary">{file.name}</div>
                      </td>
                      <td>{formatBytes(file.size)}</td>
                      <td className="table-secondary">{file.type || '未知类型'}</td>
                      <td>
                        <button type="button" className="button button-small button-ghost" onClick={() => removeFile(fileKey)}>
                          移除
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state small">还没有选中文件。</div>
        )}
      </section>
    </div>
  )
}
