import { useEffect } from 'react'

function renderPreview(preview) {
  if (!preview) {
    return null
  }

  switch (preview.content_type) {
    case 'image':
      return <img className="preview-image" src={preview.content_url} alt={preview.doc_name} />
    case 'audio':
      return <audio className="preview-audio" src={preview.content_url} controls />
    case 'video':
      return <video className="preview-video" src={preview.content_url} controls />
    default:
      return <pre className="preview-text">{preview.text_full || preview.content || '暂无可预览内容。'}</pre>
  }
}

export default function PreviewModal({ open, loading, preview, error, onClose }) {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal-panel glass-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <div className="modal-title">文件预览</div>
            {preview ? (
              <div className="modal-subtitle">
                <span>{preview.doc_name}</span>
                <span className="badge">{preview.doc_type || '未知类型'}</span>
              </div>
            ) : null}
          </div>
          <button type="button" className="button button-small button-ghost" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="modal-body">
          {loading ? <div className="loading-state">正在加载预览...</div> : null}
          {!loading && error ? <div className="error-banner">{error}</div> : null}
          {!loading && !error ? renderPreview(preview) : null}
        </div>
      </div>
    </div>
  )
}
