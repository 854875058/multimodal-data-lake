import { useEffect, useState, useRef } from 'react'
import {
  Button, Card, Space, Table, Tag, Modal, Switch, InputNumber, Message,
  Typography, Empty, Select, Progress, Descriptions, Alert
} from '@arco-design/web-react'
import {
  IconRefresh, IconPlayCircle, IconCheckCircle, IconCloseCircle,
  IconExclamationCircle, IconClockCircle
} from '@arco-design/web-react/icon'

const { Title, Text } = Typography
const Option = Select.Option

const DORIS_BASE = '/api/doris'

async function dorisGet(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPost(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPut(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function StatusTag({ status }) {
  const map = {
    SUCCESS: { color: 'green', label: '成功', icon: <IconCheckCircle /> },
    FAILED: { color: 'red', label: '失败', icon: <IconCloseCircle /> },
    WARNING: { color: 'orange', label: '警告', icon: <IconExclamationCircle /> },
    RUNNING: { color: 'arcoblue', label: '执行中', icon: <IconClockCircle /> },
    PENDING: { color: 'gray', label: '待执行', icon: <IconClockCircle /> },
  }
  const v = map[String(status || '').toUpperCase()] || { color: 'gray', label: status || '—' }
  return <Tag color={v.color} icon={v.icon}>{v.label}</Tag>
}

function ScoreDisplay({ score }) {
  if (score == null) return <Text type="secondary">N/A</Text>
  const val = Number(score)
  const color = val >= 90 ? '#00b42a' : val >= 70 ? '#ff7d00' : '#f53f3f'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Progress
        type="circle"
        percent={val}
        size="mini"
        showText={false}
        color={color}
      />
      <Text style={{ color, fontWeight: 600 }}>{val.toFixed(0)}</Text>
    </span>
  )
}

function DetailModal({ inspection, visible, onClose }) {
  if (!inspection) return null
  const items = inspection.result?.items || []
  const columns = [
    { title: '检查项', dataIndex: 'name', width: 200 },
    { title: '状态', dataIndex: 'status', width: 120, render: v => <StatusTag status={v} /> },
    { title: '结果', dataIndex: 'value', render: v => <Text code>{v || '—'}</Text> },
    { title: '建议', dataIndex: 'suggestion', render: v => v ? <Text type="warning">{v}</Text> : <Text type="secondary">—</Text> },
  ]
  return (
    <Modal
      title="巡检详情"
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: 800 }}
    >
      <Descriptions
        column={2}
        size="small"
        data={[
          { label: '巡检时间', value: inspection.created_at || '—' },
          { label: '耗时', value: inspection.duration != null ? `${inspection.duration}s` : '—' },
          { label: '综合评分', value: <ScoreDisplay score={inspection.score} /> },
          { label: '状态', value: <StatusTag status={inspection.status} /> },
        ]}
        labelStyle={{ width: 90 }}
        style={{ marginBottom: 16 }}
      />
      <Table
        columns={columns}
        data={items}
        pagination={false}
        rowKey="name"
        noDataElement={<Empty description="暂无检查详情" />}
      />
    </Modal>
  )
}

export default function InspectionPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [detail, setDetail] = useState(null)
  const [schedule, setSchedule] = useState({ enabled: false, interval_minutes: 60, last_run_at: null })
  const pollRef = useRef(null)

  useEffect(() => {
    dorisGet('/clusters').then(data => {
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0) setClusterId(list[0].id)
    }).catch(() => {})
  }, [])

  const loadHistory = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const data = await dorisGet('/inspection/history', { cluster_id: clusterId, limit: 20 })
      setHistory(data.history || [])
    } catch (e) {
      Message.error('加载巡检历史失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadSchedule = async () => {
    if (!clusterId) return
    try {
      const data = await dorisGet(`/inspection/schedule/${clusterId}`)
      if (data.schedule) {
        setSchedule({
          enabled: !!data.schedule.enabled,
          interval_minutes: data.schedule.interval_minutes || 60,
          last_run_at: data.schedule.last_run_at,
        })
      }
    } catch (e) { /* ignore */ }
  }

  useEffect(() => {
    if (clusterId) { loadHistory(); loadSchedule() }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [clusterId])

  const saveSchedule = async (next) => {
    if (!clusterId) return
    try {
      await dorisPut(`/inspection/schedule/${clusterId}`, {
        enabled: next.enabled,
        interval_minutes: Number(next.interval_minutes) || 60,
      })
      setSchedule(s => ({ ...s, ...next }))
      Message.success(next.enabled ? `已开启定时巡检：每 ${next.interval_minutes} 分钟一次` : '已关闭定时巡检')
    } catch (e) {
      Message.error('保存失败：' + e.message)
    }
  }

  const pollInspection = (id) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const data = await dorisGet(`/inspection/${id}`)
        const ins = data.inspection || {}
        if (ins.status !== 'RUNNING') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setRunning(false)
          Message.success(`巡检完成，评分：${ins.score ?? 'N/A'}`)
          loadHistory()
        }
      } catch (e) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setRunning(false)
      }
    }, 2000)
  }

  const handleRunNow = async () => {
    if (!clusterId) return
    setRunning(true)
    try {
      const data = await dorisPost('/inspection/run', { cluster_id: clusterId })
      if (data.success) {
        Message.info('巡检任务已启动，正在执行...')
        pollInspection(data.inspection_id)
      } else {
        setRunning(false)
        Message.error(data.detail || '启动巡检失败')
      }
    } catch (e) {
      setRunning(false)
      Message.error('启动巡检失败：' + e.message)
    }
  }

  const loadDetail = async (record) => {
    try {
      const data = await dorisGet(`/inspection/${record.id}`)
      setDetail(data.inspection || record)
    } catch (e) {
      setDetail(record)
    }
  }

  const columns = [
    { title: '巡检时间', dataIndex: 'created_at', width: 180 },
    { title: '耗时', dataIndex: 'duration', width: 90, render: v => v != null ? <Text code>{v}s</Text> : '—' },
    { title: '综合评分', dataIndex: 'score', width: 140, render: v => <ScoreDisplay score={v} /> },
    { title: '状态', dataIndex: 'status', width: 110, render: v => <StatusTag status={v} /> },
    { title: '检查项数', dataIndex: 'check_count', width: 100, render: v => <Text code>{v ?? '—'}</Text> },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, row) => <Button type="text" size="small" onClick={() => loadDetail(row)}>查看详情</Button>,
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>自动巡检</Title>
          <Text type="secondary">Doris 集群健康巡检</Text>
        </div>
        <Space>
          <Text type="secondary">集群：</Text>
          <Select
            placeholder="选择集群"
            value={clusterId || undefined}
            onChange={setClusterId}
            style={{ width: 200 }}
          >
            {clusters.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>
          <Button
            type="primary"
            icon={<IconPlayCircle />}
            onClick={handleRunNow}
            loading={running}
            disabled={!clusterId}
          >
            立即巡检
          </Button>
          <Button icon={<IconRefresh />} onClick={loadHistory} loading={loading} disabled={!clusterId} />
        </Space>
      </div>

      {clusters.length === 0 ? (
        <Card>
          <Empty description="暂无集群，请先在「集群管理」页面注册 Doris 集群" />
        </Card>
      ) : (
        <>
          {/* 定时巡检配置 */}
          <Card title="定时巡检" style={{ marginBottom: 16 }} bodyStyle={{ padding: 20 }}>
            <Space size="large" wrap>
              <Space>
                <Text>启用定时巡检：</Text>
                <Switch
                  checked={schedule.enabled}
                  onChange={(v) => saveSchedule({ ...schedule, enabled: v })}
                />
              </Space>
              <Space>
                <Text>执行间隔：</Text>
                <InputNumber
                  min={5}
                  max={1440}
                  step={5}
                  value={schedule.interval_minutes}
                  onChange={(v) => setSchedule(s => ({ ...s, interval_minutes: v }))}
                  suffix="分钟"
                  style={{ width: 140 }}
                />
                <Button size="small" onClick={() => saveSchedule(schedule)}>保存</Button>
              </Space>
              {schedule.last_run_at && (
                <Text type="secondary">上次执行：{schedule.last_run_at}</Text>
              )}
            </Space>
          </Card>

          {/* 巡检历史 */}
          <Card title="巡检历史" bodyStyle={{ padding: 0 }}>
            <Table
              columns={columns}
              data={history}
              loading={loading}
              rowKey="id"
              pagination={{ pageSize: 10, showTotal: true }}
              noDataElement={<Empty description="暂无巡检记录，点击「立即巡检」开始" />}
              style={{ padding: 16 }}
            />
          </Card>
        </>
      )}

      <DetailModal inspection={detail} visible={!!detail} onClose={() => setDetail(null)} />
    </div>
  )
}
