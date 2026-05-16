import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Grid,
  Input,
  Message,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { IconCommand, IconPlayArrow, IconRefresh, IconSearch } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'

const { Row, Col } = Grid
const { Title, Text, Paragraph } = Typography
const TabPane = Tabs.TabPane
const FormItem = Form.Item

function getStatusColor(status) {
  if (status === 'active') return 'green'
  if (status === 'staged') return 'orange'
  return 'gray'
}

export default function OperatorCenterPage() {
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState({ summary: { total: 0, active: 0, staged: 0 }, operators: [] })
  const [keyword, setKeyword] = useState('')
  const [executeModalVisible, setExecuteModalVisible] = useState(false)
  const [selectedOperator, setSelectedOperator] = useState(null)
  const [lastExecution, setLastExecution] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const loadCatalog = async () => {
    setLoading(true)
    try {
      const response = await api.getOperatorCatalog()
      setCatalog({
        summary: response?.summary || { total: 0, active: 0, staged: 0 },
        operators: Array.isArray(response?.operators) ? response.operators : [],
      })
    } catch (error) {
      Message.error(getErrorMessage(error, '加载迁移算子目录失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCatalog()
  }, [])

  const filteredOperators = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return catalog.operators
    return catalog.operators.filter((item) =>
      [
        item.name,
        item.modality,
        item.category,
        item.description,
        item.source_code_path,
        item.migration_status,
      ].some((field) => String(field || '').toLowerCase().includes(normalized))
    )
  }, [catalog.operators, keyword])

  const activeOperators = filteredOperators.filter((item) => item.status === 'active')
  const stagedOperators = filteredOperators.filter((item) => item.status === 'staged')

  const openExecuteModal = (operator) => {
    setSelectedOperator(operator)
    form.setFieldsValue({
      source_path: '',
      sink_path: '',
      params_json: JSON.stringify(
        Object.fromEntries(
          Object.entries(operator?.params_schema || {}).map(([key, value]) => [key, value?.default])
        ),
        null,
        2
      ),
    })
    setExecuteModalVisible(true)
  }

  const handleExecute = async () => {
    if (!selectedOperator) return
    try {
      const values = await form.validate()
      let params = {}
      try {
        params = values.params_json ? JSON.parse(values.params_json) : {}
      } catch {
        Message.error('参数 JSON 格式不合法')
        return
      }
      setSubmitting(true)
      const response = await api.executeOperator({
        operator_key: selectedOperator.key,
        source_path: values.source_path,
        sink_path: values.sink_path,
        params,
      })
      setLastExecution(response?.data || null)
      Message.success('算子执行完成')
      setExecuteModalVisible(false)
    } catch (error) {
      Message.error(getErrorMessage(error, '执行迁移算子失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: '算子',
      dataIndex: 'name',
      width: 220,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Text bold>{item.name}</Text>
          <Text type="secondary">{item.description}</Text>
        </Space>
      ),
    },
    { title: '模态', dataIndex: 'modality', width: 90, render: (value) => <Tag color="arcoblue">{value}</Tag> },
    { title: '分类', dataIndex: 'category', width: 90, render: (value) => <Tag>{value}</Tag> },
    { title: '迁移状态', dataIndex: 'migration_status', width: 220 },
    { title: '源码路径', dataIndex: 'source_code_path', render: (value) => <Text code>{value}</Text> },
    {
      title: '执行态',
      dataIndex: 'status',
      width: 120,
      render: (value) => <Tag color={getStatusColor(value)}>{value === 'active' ? '可执行' : '待启用'}</Tag>,
    },
    {
      title: '操作',
      width: 100,
      render: (_, item) => (
        item.status === 'active'
          ? <Button type="text" icon={<IconPlayArrow />} onClick={() => openExecuteModal(item)}>执行</Button>
          : <Text type="secondary">等待补依赖</Text>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>算子中心</Title>
          <Text type="secondary">当前仓已经开始承接迁移后的算子代码，不再依赖外部目录扫描来展示能力。</Text>
        </div>
        <Space>
          <Input
            allowClear
            prefix={<IconSearch />}
            placeholder="筛选算子、模态、分类或源码路径"
            style={{ width: 320 }}
            value={keyword}
            onChange={setKeyword}
          />
          <Button icon={<IconRefresh />} onClick={loadCatalog} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card bodyStyle={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>迁移算子总数</div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{catalog.summary.total}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-2)' }}>已经搬进当前仓的算子条目数量。</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card bodyStyle={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>可执行算子</div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: '#00b42a' }}>{catalog.summary.active}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-2)' }}>代码已迁移且已补齐当前仓运行时能力。</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card bodyStyle={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>待启用源码</div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: '#ff7d00' }}>{catalog.summary.staged}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-2)' }}>源码已搬入当前仓，后续补依赖后可打开执行链路。</div>
          </Card>
        </Col>
      </Row>

      <Card bodyStyle={{ padding: 20 }} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={4}>
          <Text bold>迁移说明</Text>
          <Paragraph style={{ margin: 0 }}>
            这版算子中心已经切换到当前仓自己的迁移目录与注册 API。当前优先把文本脱敏算子做成可执行能力，
            同时把 PPT 转 Markdown、视频隐私脱敏、视频冗余过滤三份源码迁入当前仓，避免能力继续悬挂在外部代码库。
          </Paragraph>
        </Space>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs defaultActiveTab="active" style={{ padding: '0 20px' }}>
          <TabPane key="active" title="可执行迁移">
            <div style={{ padding: 20 }}>
              <Table rowKey="key" loading={loading} columns={columns} data={activeOperators} pagination={false} borderCell />
            </div>
          </TabPane>
          <TabPane key="staged" title="源码已迁入">
            <div style={{ padding: 20 }}>
              <Table rowKey="key" loading={loading} columns={columns} data={stagedOperators} pagination={false} borderCell />
            </div>
          </TabPane>
        </Tabs>
      </Card>

      {lastExecution ? (
        <Card title="最近一次执行结果" style={{ marginTop: 16 }}>
          <Descriptions
            column={2}
            data={[
              { label: '算子 Key', value: lastExecution.operator_key },
              { label: '输入目录', value: lastExecution.source_path },
              { label: '输出目录', value: lastExecution.sink_path },
              { label: '处理文件', value: `${lastExecution.summary?.total_files || 0} 个` },
              { label: '成功文件', value: `${lastExecution.summary?.success_files || 0} 个` },
              { label: '复制文件', value: `${lastExecution.summary?.copied_files || 0} 个` },
            ]}
          />
        </Card>
      ) : null}

      <Modal
        title={`执行算子${selectedOperator ? ` - ${selectedOperator.name}` : ''}`}
        visible={executeModalVisible}
        onOk={handleExecute}
        onCancel={() => setExecuteModalVisible(false)}
        confirmLoading={submitting}
        style={{ width: 680 }}
      >
        <Form form={form} layout="vertical">
          <FormItem label="输入目录" field="source_path" rules={[{ required: true, message: '请输入 source_path' }]}>
            <Input placeholder="例如：E:\\data\\source_texts" />
          </FormItem>
          <FormItem label="输出目录" field="sink_path" rules={[{ required: true, message: '请输入 sink_path' }]}>
            <Input placeholder="例如：E:\\data\\cleaned_texts" />
          </FormItem>
          <FormItem label="参数 JSON" field="params_json">
            <Input.TextArea autoSize={{ minRows: 6, maxRows: 12 }} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </FormItem>
        </Form>
      </Modal>
    </div>
  )
}
