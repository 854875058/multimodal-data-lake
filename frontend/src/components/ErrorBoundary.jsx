import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || '页面渲染异常'
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleRefresh = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const pageName = this.props.pageName || '当前页面'
      return (
        <div className="glass-card">
          <div className="error-banner">{pageName}发生异常：{this.state.message}</div>
          <div className="page-subtitle">我已经加了兜底，如果这是旧缓存导致的，请先按 Ctrl + F5 强制刷新。</div>
          <div className="page-actions" style={{ marginTop: 16 }}>
            <button type="button" className="button button-primary" onClick={this.handleRefresh}>
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
