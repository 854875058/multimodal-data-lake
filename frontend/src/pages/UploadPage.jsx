import { useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import { formatBytes } from '@/utils/format'

function buildKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

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
          <p className="page-subtitle">支持批量上传本地文本、图片、音频、视频与压缩包文件，作为离线材料的快速入湖入口。S3 / SeaweedFS 与 SFTP 来源接入请使用“接入工作台”。</p>
        </div>
        <div className="page-actions">
          <NavLink to="/workbench" className="button button-secondary">
            前往接入工作台
          </NavLink>
        </div>
      </div>

      <div className="ingest-entry-grid">
        <section className="glass-card ingest-entry-card is-current">
          <div className="card-header">
            <div>
              <h2>什么时候用本地上传</h2>
              <p>适合你已经拿到本机文件，想直接拖拽上传并快速入湖的场景。</p>
            </div>
            <span className="badge">Local</span>
          </div>
          <div className="ingest-entry-tags">
            <span className="badge is-muted">批量文件</span>
            <span className="badge is-muted">压缩包</span>
            <span className="badge is-muted">离线材料</span>
          </div>
          <div className="ingest-entry-list">
            <div className="ingest-entry-item">适合：本地临时文件、离线交付件、压缩包直接导入。</div>
            <div className="ingest-entry-item">支持：`zip / tar / gz / tgz` 压缩包会在服务端自动解包后继续处理。</div>
            <div className="ingest-entry-item">不适合：需要保存远程来源连接、先扫描目录再批量入湖的场景。</div>
          </div>
        </section>

        <section className="glass-card ingest-entry-card">
          <div className="card-header">
            <div>
              <h2>什么时候用接入工作台</h2>
              <p>适合来源级接入，而不是单次上传动作。</p>
            </div>
            <span className="badge">Source</span>
          </div>
          <div className="ingest-entry-tags">
            <span className="badge is-muted">S3 / SeaweedFS</span>
            <span className="badge is-muted">SFTP</span>
            <span className="badge is-muted">批量扫描</span>
          </div>
          <div className="ingest-entry-list">
            <div className="ingest-entry-item">适合：远程目录、对象存储、来源连接复用、扫描后再执行批量入湖。</div>
            <div className="ingest-entry-item">支持：保存连接配置、扫描待处理对象、批量任务执行与索引构建。</div>
            <div className="ingest-entry-item">如果数据还在 SFTP 或对象存储里，不要先手动下载到本地再回来上传。</div>
          </div>
          <div className="ingest-entry-actions">
            <NavLink to="/workbench" className="button button-secondary">
              去接入工作台
            </NavLink>
          </div>
        </section>
      </div>

      <div className="glass-card upload-card">
        <div
          className={`upload-dropzone${dragging ? ' is-dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
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
              inputRef.current?.click()
            }
          }}
        >
          <div className="upload-icon">FILES</div>
          <h2>拖拽文件到这里，或点击选择文件</h2>
          <p>支持 `txt`、`pdf`、`docx`、`pptx`、`jpg`、`png`、`mp3`、`wav`、`mp4`、`zip`、`tar`、`gz`、`tgz` 等格式。</p>
          <button type="button" className="button button-primary">选择文件</button>
          <input ref={inputRef} type="file" multiple className="hidden-input" onChange={handleInputChange} />
        </div>

        <div className="upload-meta">
          <span>已选文件 {selectedFiles.length} 个</span>
          <span>总大小 {formatBytes(totalSize)}</span>
        </div>

        <div className="upload-mode-note">
          当前页处理的是本地文件直传。若你需要连接 S3 / SeaweedFS 或 SFTP、先扫描目录、复用接入模板，再执行批量任务，请切换到“接入工作台”。
        </div>

        {progress > 0 ? (
          <div className="progress-block">
            <div className="progress-track">
              <div className={`progress-value is-${messageType}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-text">上传进度 {progress}%</div>
          </div>
        ) : null}

        {message ? <div className={`${messageType}-banner`}>{message}</div> : null}

        <div className="toolbar">
          <div className="toolbar-group">
            <button type="button" className="button button-primary" onClick={submitUpload} disabled={uploading || !selectedFiles.length}>
              {uploading ? '上传中...' : `开始上传（${selectedFiles.length}）`}
            </button>
            <button type="button" className="button button-secondary" onClick={clearFiles} disabled={uploading || !selectedFiles.length}>
              清空列表
            </button>
          </div>
        </div>

        {selectedFiles.length ? (
          <div className="file-list">
            {selectedFiles.map((file) => {
              const fileKey = buildKey(file)
              return (
                <div className="file-row" key={fileKey}>
                  <div>
                    <div className="file-name">{file.name}</div>
                    <div className="file-meta">{formatBytes(file.size)} · {file.type || '未知类型'}</div>
                  </div>
                  <button type="button" className="button button-ghost button-small" onClick={() => removeFile(fileKey)}>
                    移除
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty-state small">还没有选中文件。</div>
        )}
      </div>
    </div>
  )
}
