import { useEffect, useState } from 'react'
import {
  Card, Button, Space, Table, Tag, Modal, Form, Input, InputNumber, Tabs,
  Typography, Empty, Grid, Statistic, Message, Alert, Progress, Spin
} from '@arco-design/web-react'
import {
  IconPlus, IconRefresh, IconStop, IconFile, IconCheckCircle, IconCloseCircle
} from '@arco-design/web-react/icon'

const { Title, Text } = Typography
const { Row, Col } = Grid
const TabPane = Tabs.TabPane
const FormItem = Form.Item
const TextArea = Input.TextArea

async function rayGet(path) {
  const res = await fetch('/api/ray' + path, { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}
async function rayPost(path, body = {}) {
  const res = await fetch('/api/ray' + path, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}
async function rayDelete(path) {
  const res = await fetch('/api/ray' + path, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function StatusTag({ status }) {
  const map = {
    SUCCEEDED: { color: 'green', label: '已完成' },
    FAILED: { color: 'red', label: '失败' },
    RUNNING: { color: 'arcoblue', label: '执行中' },
    PENDING: { color: 'orange', label: '等待中' },
    STOPPED: { color: 'gray', label: '已停止' },
  }
  const v = map[String(status || '').toUpperCase()] || { color: 'gray', label: status || '—' }
  return <Tag color={v.color}>{v.label}</Tag>
}

function JobLogsModal({ job, visible, onClose }) {
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!visible || !job) return
    setLoading(true)
    rayGet(`/jobs/${job.job_id}`)
      .then(d => setLogs(d.logs || '暂无日志'))
      .catch(e => setLogs('加载日志失败：' + e.message))
      .finally(() => setLoading(false))
  }, [visible, job])

  return (
    <Modal
      title={`任务日志 — ${job?.job_id || ''}`}
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: 800 }}
    >
      <Spin loading={loading} style={{ display: 'block' }}>
        <pre style={{
          background: '#1d2129', color: '#c9cdd4',
          padding: 16, borderRadius: 6, fontSize: 12,
          fontFamily: 'Consolas, monospace',
          maxHeight: 480, overflow: 'auto', margin: 0,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{logs}</pre>
      </Spin>
    </Modal>
  )
}

function SubmitJobModal({ visible, onClose, onSubmit }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validate()
      let runtime_env = {}
      try { runtime_env = JSON.parse(values.runtime_env || '{}') }
      catch { Message.error('runtime_env 必须是合法 JSON'); return }
      setSubmitting(true)
      await onSubmit({
        ...values,
        runtime_env,
        num_cpus: Number(values.num_cpus),
        num_gpus: Number(values.num_gpus),
      })
      form.resetFields()
      onClose()
    } catch (e) {
      if (e?.message) Message.error('提交失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="提交 Ray Job"
      visible={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      confirmLoading={submitting}
      style={{ width: 560 }}
    >
      <Form form={form} layout="vertical" initialValues={{
        num_cpus: 1, num_gpus: 0, runtime_env: '{}',
      }}>
        <FormItem label="任务名称" field="name">
          <Input placeholder="自定义任务名称" />
        </FormItem>
        <FormItem label="入口命令" field="entrypoint" rules={[{ required: true, message: '请输入入口命令' }]}>
          <Input placeholder="python train.py --epochs 10" />
        </FormItem>
        <Row gutter={16}>
          <Col span={12}>
            <FormItem label="CPU 数量" field="num_cpus">
              <InputNumber min={0.5} step={0.5} style={{ width: '100%' }} />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem label="GPU 数量" field="num_gpus">
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </FormItem>
          </Col>
        </Row>
        <FormItem label="Runtime Env (JSON)" field="runtime_env">
          <TextArea
            placeholder='{"pip": ["pandas"], "env_vars": {"MY_VAR": "value"}}'
            autoSize={{ minRows: 3, maxRows: 6 }}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
        </FormItem>
      </Form>
    </Modal>
  )
}

export default function RayJobsPage() {
  const [status, setStatus] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [logJob, setLogJob] = useState(null)
  const [showSubmit, setShowSubmit] = useState(false)
  const [activeTab, setActiveTab] = useState('jobs')

  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [st, jb] = await Promise.all([
        rayGet('/status').catch(() => ({ connected: false, cluster: {} })),
        rayGet('/jobs').catch(() => ({ jobs: [] })),
      ])
      setStatus(st)
      setJobs(jb.jobs || [])
    } catch (e) {
      Message.error('加载失败：' + e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadAll(false) }, [])

  useEffect(() => {
    const hasActive = jobs.some(j => ['RUNNING', 'PENDING'].includes((j.status || '').toUpperCase()))
    if (!hasActive) return
    const timer = setInterval(() => loadAll(true), 5000)
    return () => clearInterval(timer)
  }, [jobs])

  const handleStop = async (jobId) => {
    try {
      await rayDelete(`/jobs/${jobId}`)
      Message.success(`任务 ${jobId} 已停止`)
      loadAll(true)
    } catch (e) {
      Message.error('停止失败：' + e.message)
    }
  }

  const handleSubmit = async (form) => {
    await rayPost('/jobs', form)
    Message.success('任务已提交')
    loadAll(true)
  }

  const running = jobs.filter(j => (j.status || '').toUpperCase() === 'RUNNING').length
  const succeeded = jobs.filter(j => (j.status || '').toUpperCase() === 'SUCCEEDED').length
  const failed = jobs.filter(j => (j.status || '').toUpperCase() === 'FAILED').length

  const cluster = status?.cluster || {}
  const cpuUsed = (cluster.cpus_total || 0) - (cluster.cpus_available || 0)
  const cpuPct = cluster.cpus_total > 0 ? Math.round((cpuUsed / cluster.cpus_total) * 100) : 0

  const jobColumns = [
    { title: 'Job ID', dataIndex: 'job_id', width: 200, render: v => <Text code style={{ fontSize: 11 }}>{v}</Text>, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 100, render: v => <StatusTag status={v} /> },
    { title: '入口命令', dataIndex: 'entrypoint', render: v => <Text code style={{ fontSize: 12 }}>{v || '—'}</Text>, ellipsis: true },
    { title: '开始时间', dataIndex: 'start_time', width: 180 },
    { title: '结束时间', dataIndex: 'end_time', width: 180, render: v => v || '—' },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, job) => {
        const s = (job.status || '').toUpperCase()
        return (
          <Space>
            <Button size="small" type="text" icon={<IconFile />} onClick={() => setLogJob(job)}>日志</Button>
            {['RUNNING', 'PENDING'].includes(s) && (
              <Button size="small" type="text" status="danger" icon={<IconStop />} onClick={() => handleStop(job.job_id)}>停止</Button>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>Ray 计算编排</Title>
          <Text type="secondary">分布式计算任务提交、监控与管理</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} onClick={() => loadAll(true)} loading={refreshing}>刷新</Button>
          <Button type="primary" icon={<IconPlus />} onClick={() => setShowSubmit(true)}>提交任务</Button>
        </Space>
      </div>

      <Alert
        type={status?.connected ? 'success' : 'warning'}
        content={
          <Space>
            {status?.connected ? <IconCheckCircle /> : <IconCloseCircle />}
            <Text bold>{status?.connected ? 'Ray 集群已连接' : 'Ray 集群未连接'}</Text>
            {status?.message && <Text type="secondary">— {status.message}</Text>}
          </Space>
        }
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="执行中" value={running} valueStyle={{ color: '#165dff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="已完成" value={succeeded} valueStyle={{ color: '#00b42a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="失败" value={failed} valueStyle={{ color: '#f53f3f' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="任务总数" value={jobs.length} />
          </Card>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
          <TabPane key="jobs" title="任务列表" />
          <TabPane key="cluster" title="集群资源" />
        </Tabs>
        <div style={{ padding: 16 }}>
          {activeTab === 'jobs' && (
            <Table
              columns={jobColumns}
              data={jobs}
              loading={loading}
              rowKey="job_id"
              pagination={{ pageSize: 10, showTotal: true }}
              noDataElement={<Empty description="暂无任务，点击「提交任务」创建第一个" />}
              scroll={{ x: 1200 }}
            />
          )}

          {activeTab === 'cluster' && (
            status?.connected ? (
              <Row gutter={16}>
                <Col span={6}>
                  <Card bodyStyle={{ padding: 20 }}>
                    <Statistic title="节点数" value={cluster.nodes ?? '—'} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card bodyStyle={{ padding: 20 }}>
                    <Statistic title="CPU 使用" value={cpuUsed} suffix={<Text type="secondary">/ {cluster.cpus_total ?? '—'}</Text>} />
                    <Progress percent={cpuPct} showText={false} style={{ marginTop: 8 }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card bodyStyle={{ padding: 20 }}>
                    <Statistic title="GPU 总量" value={cluster.gpus_total ?? 0} />
                    <Text type="secondary" style={{ fontSize: 12 }}>可用 {cluster.gpus_available ?? 0}</Text>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card bodyStyle={{ padding: 20 }}>
                    <Statistic title="内存 (GB)" value={cluster.memory_total_gb ?? '—'} />
                    <Text type="secondary" style={{ fontSize: 12 }}>对象存储 {cluster.object_store_gb ?? 0} GB</Text>
                  </Card>
                </Col>
              </Row>
            ) : (
              <Empty description="Ray 集群未连接，请确认 Ray Dashboard 已启动（默认 http://127.0.0.1:8265）" />
            )
          )}
        </div>
      </Card>

      <JobLogsModal job={logJob} visible={!!logJob} onClose={() => setLogJob(null)} />
      <SubmitJobModal visible={showSubmit} onClose={() => setShowSubmit(false)} onSubmit={handleSubmit} />
    </div>
  )
}
