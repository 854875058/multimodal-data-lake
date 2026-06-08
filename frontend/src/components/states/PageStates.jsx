import { Button, Spin } from '@arco-design/web-react'

export function LoadingState({ text = '加载中...' }) {
  return (
    <div className="ui-state-block" role="status">
      <Spin size={28} />
      <div className="ui-state-title">{text}</div>
    </div>
  )
}

export function EmptyState({ title = '暂无数据', description, actionText, onAction }) {
  return (
    <div className="ui-state-block">
      <div className="ui-state-icon">--</div>
      <div className="ui-state-title">{title}</div>
      {description ? <div className="ui-state-desc">{description}</div> : null}
      {actionText && onAction ? (
        <Button type="primary" onClick={onAction}>
          {actionText}
        </Button>
      ) : null}
    </div>
  )
}

export function ErrorState({ title = '页面加载失败', description = '请稍后重试。', onRetry }) {
  return (
    <div className="ui-state-block ui-state-error" role="alert">
      <div className="ui-state-icon">!</div>
      <div className="ui-state-title">{title}</div>
      <div className="ui-state-desc">{description}</div>
      {onRetry ? (
        <Button type="primary" status="danger" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  )
}

export function PermissionState({ role = '当前用户' }) {
  return (
    <div className="ui-state-block ui-state-warning">
      <div className="ui-state-icon">!</div>
      <div className="ui-state-title">当前账号无权访问</div>
      <div className="ui-state-desc">当前身份：{role}。如需访问，请联系管理员开通权限。</div>
    </div>
  )
}
