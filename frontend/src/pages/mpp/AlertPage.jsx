import { useEffect, useState } from 'react'
import {
  Button, Card, Space, Table, Tag, Tabs, Form, Input, InputNumber, Select,
  Message, Popconfirm, Typography, Empty, Grid
} from '@arco-design/web-react'
import {
  IconRefresh, IconDelete, IconPlus, IconNotification
} from '@arco-design/web-react/icon'

const { Row, Col } = Grid
const { Title, Text } = Typography
const TabPane = Tabs.TabPane
const FormItem = Form.Item
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

async function dorisDelete(path) {
  const res = await fetch(DORIS_BASE + path, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function LevelTag({ level }) {
  const map = {
    CRITICAL: { color: 'red', label: '严重' },
    WARNING: { color: 'orange', label: '警告' },
    INFO: { color: 'arcoblue', label: '信息' },
  }
  const { color, label } = map[level] || { color: 'gray', label: level || '—' }
  return <Tag color={color}>{label}</Tag>
}

const metricLabels = {
  be_disk_usage: 'BE 磁盘使用率 (%)',
  fe_alive_count: 'FE 存活节点数',
  be_alive_count: 'BE 存活节点数',
  query_latency_ms: '查询延迟 (ms)',
  connection_count: '当前连接数',
}

function HistoryPanel({ clusterId }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const data = await dorisGet('/alerts/records', { cluster_id: clusterId, limit: 50 })
      setRecords(data.records || [])
    } catch (e) { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [clusterId])

  const columns = [
    { title: '告警时间', dataIndex: 'created_at', width: 180 },
    { title: '规则名称', dataIndex: 'name' },
    { title: '指标', dataIndex: 'metric', render: v => <Text code>{metricLabels[v] || v || '—'}</Text> },
    { title: '当前值', dataIndex: 'value', width: 110, render: v => <Text code>{v != null ? Number(v).toFixed(2) : '—'}</Text> },
    { title: '级别', dataIndex: 'level', width: 90, render: v => <LevelTag level={v} /> },
    { title: '详情', dataIndex: 'message', render: v => <Text type="secondary">{v || '—'}</Text> },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Button icon={<IconRefresh />} onClick={load} loading={loading}>刷新</Button>
      </div>
      <Table
        columns={columns}
        data={records}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10, showTotal: true }}
        noDataElement={<Empty description="暂无告警记录" />}
      />
    </div>
  )
}

function RulesPanel({ clusterId, refreshKey }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await dorisGet('/alerts', clusterId ? { cluster_id: clusterId } : {})
      setRules(data.alerts || [])
    } catch (e) { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [clusterId, refreshKey])

  const handleDelete = async (rule) => {
    try {
      await dorisDelete(`/alerts/${rule.id}`)
      Message.success('规则已删除')
      load()
    } catch (e) {
      Message.error('删除失败：' + e.message)
    }
  }

  const columns = [
    { title: '规则名称', dataIndex: 'name' },
    { title: '指标', dataIndex: 'metric', render: v => metricLabels[v] || v },
    { title: '条件', dataIndex: 'operator', width: 80, render: v => <Text code>{v}</Text> },
    { title: '阈值', dataIndex: 'threshold', width: 100, render: v => <Text code>{v}</Text> },
    { title: '级别', dataIndex: 'level', width: 90, render: v => <LevelTag level={v} /> },
    {
      title: '状态', dataIndex: 'enabled', width: 90,
      render: v => v ? <Tag color="green">已启用</Tag> : <Tag>已禁用</Tag>,
    },
    {
      title: '操作', width: 90, fixed: 'right',
      render: (_, rule) => (
        <Popconfirm title={`确认删除规则「${rule.name}」？`} onOk={() => handleDelete(rule)}>
          <Button type="text" status="danger" size="small" icon={<IconDelete />}>删除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12, textAlign: 'right' }}>
        <Button icon={<IconRefresh />} onClick={load} loading={loading}>刷新</Button>
      </div>
      <Table
        columns={columns}
        data={rules}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10, showTotal: true }}
        noDataElement={<Empty description="暂无告警规则" />}
      />
    </div>
  )
}

function CreateRulePanel({ clusterId, onCreated }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!clusterId) {
      Message.warning('请先在右上角选择集群')
      return
    }
    try {
      const values = await form.validate()
      setSubmitting(true)
      await dorisPost('/alerts', {
        cluster_id: clusterId,
        ...values,
        threshold: Number(values.threshold),
      })
      Message.success('告警规则已创建')
      form.resetFields()
      onCreated && onCreated()
    } catch (e) {
      if (e?.message) Message.error('创建失败：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      style={{ maxWidth: 720 }}
      initialValues={{
        metric: 'be_disk_usage',
        operator: '>',
        threshold: 80,
        level: 'WARNING',
      }}
    >
      <Row gutter={16}>
        <Col span={24}>
          <FormItem label="规则名称" field="name" rules={[{ required: true, message: '请填写规则名称' }]}>
            <Input placeholder="如：BE 磁盘使用率过高" />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem label="监控指标" field="metric">
            <Select>
              {Object.entries(metricLabels).map(([k, v]) => (
                <Option key={k} value={k}>{v}</Option>
              ))}
            </Select>
          </FormItem>
        </Col>
        <Col span={6}>
          <FormItem label="触发条件" field="operator">
            <Select>
              <Option value=">">大于 (&gt;)</Option>
              <Option value=">=">大于等于 (&gt;=)</Option>
              <Option value="<">小于 (&lt;)</Option>
              <Option value="<=">小于等于 (&lt;=)</Option>
            </Select>
          </FormItem>
        </Col>
        <Col span={6}>
          <FormItem label="阈值" field="threshold" rules={[{ required: true, message: '请输入阈值' }]}>
            <InputNumber placeholder="80" style={{ width: '100%' }} />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem label="告警级别" field="level">
            <Select>
              <Option value="INFO">信息</Option>
              <Option value="WARNING">警告</Option>
              <Option value="CRITICAL">严重</Option>
            </Select>
          </FormItem>
        </Col>
      </Row>
      <Button type="primary" icon={<IconPlus />} onClick={handleSubmit} loading={submitting} disabled={!clusterId}>
        创建规则
      </Button>
    </Form>
  )
}

export default function AlertPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [activeTab, setActiveTab] = useState('history')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    dorisGet('/clusters').then(data => {
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0) setClusterId(list[0].id)
    }).catch(() => {})
  }, [])

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>告警监控</Title>
          <Text type="secondary">Doris 集群告警规则配置与历史记录</Text>
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
        </Space>
      </div>

      {clusters.length === 0 ? (
        <Card>
          <Empty
            icon={<IconNotification style={{ fontSize: 48, color: 'var(--color-text-3)' }} />}
            description="暂无集群，请先在「集群管理」页面注册 Doris 集群"
          />
        </Card>
      ) : (
        <Card>
          <Tabs activeTab={activeTab} onChange={setActiveTab}>
            <TabPane key="history" title="告警记录">
              <HistoryPanel clusterId={clusterId} />
            </TabPane>
            <TabPane key="rules" title="告警规则">
              <RulesPanel clusterId={clusterId} refreshKey={refreshKey} />
            </TabPane>
            <TabPane key="create" title="新建规则">
              <CreateRulePanel
                clusterId={clusterId}
                onCreated={() => { setActiveTab('rules'); setRefreshKey(k => k + 1) }}
              />
            </TabPane>
          </Tabs>
        </Card>
      )}
    </div>
  )
}
