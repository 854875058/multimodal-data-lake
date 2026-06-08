import { Space } from '@arco-design/web-react'

export function MetricStrip({ metrics = [] }) {
  if (!metrics.length) return null

  return (
    <div className="ui-metric-strip">
      {metrics.map((metric) => (
        <div className="ui-metric-card" data-status={metric.status || 'neutral'} key={metric.label}>
          <div className="ui-metric-label">{metric.label}</div>
          <div className="ui-metric-value">{metric.value}</div>
          {metric.trend ? <div className="ui-metric-trend">{metric.trend}</div> : null}
        </div>
      ))}
    </div>
  )
}

export default function PageScaffold({
  title,
  subtitle,
  actions,
  metrics = [],
  children,
  className = '',
}) {
  return (
    <section className={`ui-page-shell ${className}`.trim()}>
      <header className="ui-page-header">
        <div className="ui-page-heading">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <Space className="ui-page-actions">{actions}</Space> : null}
      </header>
      <MetricStrip metrics={metrics} />
      <div className="ui-page-body">{children}</div>
    </section>
  )
}
