import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Dropdown, Menu, Space, Spin, Typography } from '@arco-design/web-react'
import {
  IconNotification,
  IconCheckCircle,
  IconExclamationCircle,
  IconCloseCircle,
  IconInfoCircle,
} from '@arco-design/web-react/icon'
import { dorisGet } from '@/api/doris'

const { Text } = Typography

function levelIcon(level) {
  const map = {
    CRITICAL: <IconCloseCircle style={{ color: '#f53f3f', fontSize: 16 }} />,
    ERROR: <IconCloseCircle style={{ color: '#f53f3f', fontSize: 16 }} />,
    WARNING: <IconExclamationCircle style={{ color: '#ff7d00', fontSize: 16 }} />,
    INFO: <IconInfoCircle style={{ color: '#165dff', fontSize: 16 }} />,
    OK: <IconCheckCircle style={{ color: '#00b42a', fontSize: 16 }} />,
  }
  return map[level] || <IconInfoCircle style={{ color: 'var(--color-text-3)', fontSize: 16 }} />
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour} 小时前`
    const diffDay = Math.floor(diffHour / 24)
    return `${diffDay} 天前`
  } catch {
    return dateStr
  }
}

export default function NotificationCenter({ onNavigate }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [dropped, setDropped] = useState(false)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await dorisGet('/alerts/records', { limit: 10 })
      const records = Array.isArray(data) ? data : data?.data || []
      setAlerts(records)
      setUnreadCount(records.length)
    } catch {
      // silently fail on fetch errors
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const handleMarkAllRead = () => {
    setUnreadCount(0)
    setDropped(false)
  }

  const handleItemClick = (item) => {
    setDropped(false)
    if (onNavigate) onNavigate('/mpp/alert')
  }

  const dropdownContent = (
    <div style={{ width: 360, background: 'var(--color-bg-2)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-2)',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: 600 }}>通知中心</Text>
        <Button type="text" size="mini" onClick={handleMarkAllRead}>
          全部标记已读
        </Button>
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Spin size={20} tip="加载中..." />
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-3)' }}>
            暂无通知
          </div>
        ) : (
          alerts.map((item, index) => (
            <div
              key={item.id || index}
              onClick={() => handleItemClick(item)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: index < alerts.length - 1 ? '1px solid var(--color-border-1)' : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-fill-1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ flexShrink: 0, marginTop: 2 }}>{levelIcon(item.level)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)', lineHeight: '20px' }}>
                  {item.name || item.message || '告警通知'}
                </div>
                {item.message && item.name !== item.message && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-3)',
                      lineHeight: '18px',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.message}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>
                  {formatTime(item.created_at)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid var(--color-border-2)',
          padding: '8px 16px',
          textAlign: 'center',
        }}
      >
        <Button type="text" size="mini" onClick={() => { setDropped(false); if (onNavigate) onNavigate('/mpp/alert') }}>
          查看全部告警
        </Button>
      </div>
    </div>
  )

  return (
    <Dropdown
      droplist={<div style={{ padding: 0 }}>{dropdownContent}</div>}
      trigger="click"
      position="br"
      popupVisible={dropped}
      onVisibleChange={setDropped}
    >
      <div
        style={{
          cursor: 'pointer',
          padding: '4px 6px',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <Badge count={unreadCount} dot={false} maxCount={99} offset={[-4, 2]}>
          <IconNotification style={{ fontSize: 18, color: 'var(--color-text-2)' }} />
        </Badge>
      </div>
    </Dropdown>
  )
}
