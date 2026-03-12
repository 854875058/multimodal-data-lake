import { useMemo, useRef, useState } from 'react'
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
          <h1 className="page-title">数据接入</h1>
          <p className="page-subtitle">支持批量上传文本、图片、音频、视频等多模态文件，作为资产浏览和 AI 工作台的手动接入入口。</p>
        </div>
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
          <p>支持 `txt`、`pdf`、`docx`、`pptx`、`jpg`、`png`、`mp3`、`wav`、`mp4` 等格式。</p>
          <button type="button" className="button button-primary">选择文件</button>
          <input ref={inputRef} type="file" multiple className="hidden-input" onChange={handleInputChange} />
        </div>

        <div className="upload-meta">
          <span>已选文件 {selectedFiles.length} 个</span>
          <span>总大小 {formatBytes(totalSize)}</span>
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
