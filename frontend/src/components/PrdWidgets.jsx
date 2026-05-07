import React from 'react'

// ── Sparkline ──────────────────────────────────────────────────────────────
export function Sparkline({ points = [], color = '#1F4FE0', fill, height = 34 }) {
  if (!points || points.length === 0) return null
  const w = 180
  const h = height
  const max = Math.max(...points)
  const min = Math.min(...points)
  const r = max - min || 1
  const step = w / (points.length - 1)
  const pts = points.map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / r) * h).toFixed(1)}`).join(' ')
  const fillColor = fill || color + '22'
  const lineCmd = pts.replace(/(\d),(\d)/g, '$1 L $2').replace(/^/, 'M ')
  return (
    <svg className="prd-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={`${lineCmd} L ${w},${h} L 0,${h} Z`} fill={fillColor} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

// ── Health Ring ─────────────────────────────────────────────────────────────
export function HealthRing({ percent = 0, color, label = '/100' }) {
  const r = 50
  const c = 2 * Math.PI * r
  const off = c * (1 - percent / 100)
  const ringColor = color || (percent >= 90 ? '#1B9E5C' : percent >= 70 ? '#E68B00' : '#D63B3B')
  return (
    <div className="prd-ring">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EFF2F8" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={ringColor} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="val">
        {Math.round(percent)}
        <div className="small">{label}</div>
      </div>
    </div>
  )
}

// ── Cluster Topology ───────────────────────────────────────────────────────
// nodes: [{id, role: 'fe'|'be', label, status: 'ok'|'warn'|'dead', master?: bool}]
export function ClusterTopology({ feNodes = [], beNodes = [] }) {
  const totalFe = feNodes.length
  const totalBe = beNodes.length
  const feLefts = totalFe > 0
    ? feNodes.map((_, i) => totalFe === 1 ? 50 : 13 + (i * (66 / Math.max(1, totalFe - 1))))
    : []
  const beLefts = totalBe > 0
    ? beNodes.map((_, i) => totalBe === 1 ? 50 : 8 + (i * (74 / Math.max(1, totalBe - 1))))
    : []

  const feY = 20, beY = 110
  return (
    <div className="prd-topo">
      <svg viewBox="0 0 600 180" preserveAspectRatio="none">
        {feNodes.map((_, i) => (
          <line key={`fl-${i}`} x1={(feLefts[i] || 50) * 6} y1={feY + 30}
            x2={300} y2={beY - 10} stroke="#C8D4EC" strokeWidth="1.2" />
        ))}
        {beNodes.map((_, i) => (
          <line key={`bl-${i}`} x1={300} y1={beY - 10}
            x2={(beLefts[i] || 50) * 6} y2={beY + 20} stroke="#C8D4EC" strokeWidth="1.2" />
        ))}
      </svg>
      {feNodes.map((n, i) => (
        <div key={`fe-${i}`}
          className={`node fe ${n.status === 'warn' ? 'warn' : ''} ${n.status === 'dead' ? 'dead' : ''}`}
          style={{ left: `${feLefts[i]}%`, top: `${feY}px` }}
          title={n.label}>
          <span className="node-title">{n.label}</span>
          <span className="node-meta">{n.master ? 'Leader' : 'Follower'}</span>
        </div>
      ))}
      {beNodes.map((n, i) => (
        <div key={`be-${i}`}
          className={`node be ${n.status === 'warn' ? 'warn' : ''} ${n.status === 'dead' ? 'dead' : ''}`}
          style={{ left: `${beLefts[i]}%`, top: `${beY}px` }}
          title={n.label}>
          <span className="node-title">{n.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Hello Bar (角色化欢迎栏) ────────────────────────────────────────────────
export function HelloBar({ avatar, name, role, greet, headline, tip, ctaButtons = [] }) {
  return (
    <div className="prd-hello-bar">
      <div className="prd-role-card">
        <div className="av">{avatar}</div>
        <div>
          <div className="name">{name}</div>
          <div className="role">{role}</div>
        </div>
      </div>
      <div>
        <div className="prd-hello-greet">{greet}</div>
        <div className="prd-hello-name">{headline}</div>
        <div className="prd-hello-tip">{tip}</div>
      </div>
      <div className="prd-hello-cta">
        {ctaButtons.map((b, i) => (
          <button key={i} className={`prd-btn-light ${b.primary ? 'primary' : ''}`} onClick={b.onClick}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── KPI 卡片 ───────────────────────────────────────────────────────────────
export function StatCard({ label, value, valueSuffix, sub, delta, deltaDir, icon, iconBg, iconColor, sparkPoints, sparkColor }) {
  return (
    <div className="prd-stat">
      <div className="label">{label}</div>
      <div className="val">
        {value}
        {valueSuffix && <span className="small"> {valueSuffix}</span>}
      </div>
      {sub && <div className="sub">{sub}</div>}
      {delta && <div className={`delta ${deltaDir === 'up' ? 'up' : deltaDir === 'dn' ? 'dn' : ''}`}>{delta}</div>}
      {sparkPoints && <Sparkline points={sparkPoints} color={sparkColor || '#1F4FE0'} />}
      {icon && (
        <div className="ico" style={{ background: iconBg || '#EAF0FF', color: iconColor || '#1F4FE0' }}>
          {icon}
        </div>
      )}
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────
export function PrdCard({ title, sub, extra, children, bodyStyle }) {
  return (
    <div className="prd-card">
      {(title || extra) && (
        <div className="prd-card-head">
          <div>
            {title && <div className="prd-card-title">{title}</div>}
            {sub && <div className="prd-card-sub">{sub}</div>}
          </div>
          {extra}
        </div>
      )}
      <div className="prd-card-body" style={bodyStyle}>{children}</div>
    </div>
  )
}

// ── Alert Row ──────────────────────────────────────────────────────────────
export function AlertRow({ level = 'warn', title, meta, action, onAction }) {
  return (
    <div className="prd-alert-row">
      <div className={`lev ${level}`}>⚠</div>
      <div className="body">
        <div className="ttl">{title}</div>
        {meta && <div className="meta">{meta}</div>}
      </div>
      {action && <div className="act" onClick={onAction}>{action} →</div>}
    </div>
  )
}

// ── Tag ────────────────────────────────────────────────────────────────────
export function PrdTag({ kind = 'info', led, children }) {
  return <span className={`prd-tag ${kind} ${led ? 'led' : ''}`}>{children}</span>
}

// ── Check Row（巡检明细） ─────────────────────────────────────────────────
export function CheckRow({ status = 'ok', icon, title, meta, value }) {
  return (
    <div className={`prd-check-row ${status}`}>
      <div className="icon">{icon}</div>
      <div className="body">
        <div className="ttl">{title}</div>
        {meta && <div className="meta">{meta}</div>}
      </div>
      {value && <div className="val">{value}</div>}
    </div>
  )
}
