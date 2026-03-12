export function formatBytes(bytes = 0) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const size = value / (1024 ** index)
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function truncateText(value = '', maxLength = 160) {
  const text = String(value ?? '').trim()
  if (!text) {
    return ''
  }
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}...`
}

export function formatNumber(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return '--'
  }
  return new Intl.NumberFormat('zh-CN').format(amount)
}

export function formatPercent(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return '--'
  }
  return `${amount.toFixed(1)}%`
}

export function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

export function formatList(values = []) {
  const items = Array.isArray(values) ? values.filter(Boolean) : []
  return items.length ? items.join('、') : '暂无'
}
