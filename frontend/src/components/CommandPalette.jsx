import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Input } from '@arco-design/web-react'
import {
  IconBug,
  IconCalendarClock,
  IconCloudDownload,
  IconCommand,
  IconCommon,
  IconDashboard,
  IconExport,
  IconFile,
  IconLanguage,
  IconLayout,
  IconLock,
  IconNotification,
  IconRobot,
  IconSearch,
  IconSettings,
  IconStorage,
  IconUpload,
  IconUser,
  IconUserGroup,
} from '@arco-design/web-react/icon'

const shortcutItems = [
  { path: '/dashboard', label: '湖总览', group: '湖总览', icon: <IconDashboard />, keys: '' },
  { path: '/files', label: '资产目录', group: '湖总览', icon: <IconFile />, keys: '' },
  { path: '/lake-query/sql', label: 'SQL 查询', group: '湖查询', icon: <IconCommand />, keys: '' },
  { path: '/lake-query/retrieval', label: '统一检索', group: '湖查询', icon: <IconSearch />, keys: '' },
  { path: '/lake-query/copilot', label: 'AI 数据副驾驶', group: '湖查询', icon: <IconRobot />, keys: '' },
  { path: '/lake-query/annotation', label: '自动化标注', group: '湖查询', icon: <IconExport />, keys: '' },
  { path: '/workflow', label: '工作流编排', group: '湖计算', icon: <IconLayout />, keys: '' },
  { path: '/compute/operators', label: '算子中心', group: '湖计算', icon: <IconCommon />, keys: '' },
  { path: '/task-center', label: '任务中心', group: '湖计算', icon: <IconCalendarClock />, keys: '' },
  { path: '/compute/jobs', label: '作业实例', group: '湖计算', icon: <IconRobot />, keys: '' },
  { path: '/compute/templates', label: '模板库', group: '湖计算', icon: <IconFile />, keys: '' },
  { path: '/ingestion', label: '总览', group: '湖存储', icon: <IconStorage />, keys: '' },
  { path: '/ingestion/source', label: '来源接入', group: '湖存储', icon: <IconCloudDownload />, keys: '' },
  { path: '/ingestion/upload', label: '本地上传', group: '湖存储', icon: <IconUpload />, keys: '' },
  { path: '/governance', label: '数据治理', group: '湖治理', icon: <IconCalendarClock />, keys: '' },
  { path: '/mpp/cluster', label: '集群管理', group: '湖运维', icon: <IconCommon />, keys: '' },
  { path: '/mpp/sql', label: 'SQL 编辑器', group: '湖运维', icon: <IconCommand />, keys: '' },
  { path: '/mpp/alert', label: '告警监控', group: '湖运维', icon: <IconNotification />, keys: '' },
  { path: '/mpp/inspection', label: '自动巡检', group: '湖运维', icon: <IconBug />, keys: '' },
  { path: '/settings/access', label: '来源配置', group: '系统配置', icon: <IconSettings />, keys: '' },
  { path: '/logs', label: '系统日志', group: '系统配置', icon: <IconLanguage />, keys: '' },
  { path: '/settings/users', label: '用户管理', group: '管理入口', icon: <IconUser />, keys: '', requiresAdmin: true },
  { path: '/settings/permissions', label: '权限管理', group: '管理入口', icon: <IconUserGroup />, keys: '', requiresAdmin: true },
]

export default function CommandPalette({ visible, onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return shortcutItems
    const q = query.toLowerCase()
    return shortcutItems.filter(
      (item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q),
    )
  }, [query])

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible])

  // Keep activeIndex in range
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, activeIndex])

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.children[activeIndex]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleSelect = useCallback(
    (item) => {
      onNavigate(item.path)
      onClose()
    },
    [onNavigate, onClose],
  )

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) handleSelect(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      footer={null}
      closable={false}
      autoFocus={false}
      style={{ width: 560, top: 120, padding: 0 }}
      maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', maxHeight: 440 }}
        onKeyDown={handleKeyDown}
      >
        <div style={{ padding: '12px 16px 0' }}>
          <Input
            ref={inputRef}
            prefix={<IconSearch style={{ color: 'var(--color-text-3)' }} />}
            placeholder="搜索页面、功能..."
            value={query}
            onChange={setQuery}
            allowClear
            style={{ height: 40, fontSize: 14 }}
          />
        </div>

        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 0',
            marginTop: 4,
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-3)' }}>
              无匹配结果
            </div>
          )}
          {filtered.map((item, index) => (
            <div
              key={item.path}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setActiveIndex(index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                cursor: 'pointer',
                background: index === activeIndex ? 'var(--color-fill-2)' : 'transparent',
                borderRadius: 4,
                margin: '0 8px',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 16, color: 'var(--color-text-2)', flexShrink: 0 }}>
                {item.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-1)' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{item.group}</div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-3)',
                  background: 'var(--color-fill-3)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                {item.path}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--color-border-2)',
            padding: '8px 16px',
            display: 'flex',
            gap: 16,
            fontSize: 11,
            color: 'var(--color-text-3)',
          }}
        >
          <span>
            <kbd style={kbdStyle}>↑</kbd> <kbd style={kbdStyle}>↓</kbd> 导航
          </span>
          <span>
            <kbd style={kbdStyle}>Enter</kbd> 选择
          </span>
          <span>
            <kbd style={kbdStyle}>Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </Modal>
  )
}

const kbdStyle = {
  display: 'inline-block',
  padding: '0 4px',
  fontSize: 10,
  lineHeight: '18px',
  background: 'var(--color-fill-3)',
  border: '1px solid var(--color-border-3)',
  borderRadius: 3,
  fontFamily: 'monospace',
  marginRight: 2,
}
