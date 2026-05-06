import { useEffect, useMemo, useState } from 'react'
import { Card, Select, Button, Space, Typography, Empty, Spin, Message } from '@arco-design/web-react'
import { IconRefresh, IconDownload } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatDateTime } from '@/utils/format'

const { Title, Text } = Typography
const Option = Select.Option

export default function LogsPage() {
  const [lines, setLines] = useState(500)
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const lineCount = useMemo(
    () => (logs ? logs.split(/\r?\n/).filter(Boolean).length : 0),
    [logs]
  )

  const loadLogs = async () => {
    setLoading(true)
    try {
      const response = await api.getLogs(Number(lines))
      setLogs(response?.logs || '')
      setLastUpdated(new Date())
    } catch (e) {
      setLogs('')
      Message.error(getErrorMessage(e, '加载日志失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLogs() }, [lines])

  const downloadLogs = () => {
    const blob = new Blob([logs || ''], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `app-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>系统日志</Title>
          <Text type="secondary">后端日志查看与导出</Text>
        </div>
        <Space>
          <Text type="secondary">行数：</Text>
          <Select value={lines} onChange={setLines} style={{ width: 110 }}>
            <Option value={100}>100</Option>
            <Option value={300}>300</Option>
            <Option value={500}>500</Option>
            <Option value={1000}>1000</Option>
            <Option value={2000}>2000</Option>
          </Select>
          <Button icon={<IconRefresh />} onClick={loadLogs} loading={loading}>刷新</Button>
          <Button type="primary" icon={<IconDownload />} onClick={downloadLogs} disabled={!logs}>下载</Button>
        </Space>
      </div>

      <Card>
        <Space style={{ marginBottom: 12 }} size="large">
          <Text type="secondary">当前 <Text code>{lineCount}</Text> 行</Text>
          <Text type="secondary">最近刷新：{lastUpdated ? formatDateTime(lastUpdated) : '—'}</Text>
        </Space>
        <Spin loading={loading} style={{ display: 'block' }}>
          {!loading && !logs ? (
            <Empty description="暂无日志内容" />
          ) : (
            <pre style={{
              background: '#1d2129',
              color: '#c9cdd4',
              padding: 16,
              borderRadius: 6,
              fontSize: 12,
              fontFamily: 'Consolas, Monaco, monospace',
              maxHeight: 'calc(100vh - 280px)',
              overflow: 'auto',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>{logs}</pre>
          )}
        </Spin>
      </Card>
    </div>
  )
}
