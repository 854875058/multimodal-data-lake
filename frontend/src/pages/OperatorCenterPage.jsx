import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Descriptions,
  Form,
  Input,
  Message,
  Modal,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { IconCommand, IconPlayArrow, IconRefresh, IconSearch } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'

const { Title, Text, Paragraph } = Typography
const TabPane = Tabs.TabPane
const FormItem = Form.Item

const emptySummary = { total: 0, active: 0, staged: 0, runnable: 0, blocked: 0 }
const emptyCatalog = { summary: emptySummary, operators: [] }

function getHealthColor(state) {
  if (state === 'runnable') return 'green'
  if (state === 'staged') return 'orange'
  if (state === 'missing_env' || state === 'missing_dependency' || state === 'import_error') return 'red'
  return 'gray'
}

function getHealthLabel(state) {
  if (state === 'runnable') return '可运行'
  if (state === 'staged') return '待接通'
  if (state === 'missing_env') return '缺少环境变量'
  if (state === 'missing_dependency') return '缺少依赖'
  if (state === 'import_error') return '导入失败'
  return '未知'
}

function buildDefaultParamsText(operator) {
  const schema = operator?.params_schema || {}
  const defaults = Object.fromEntries(
    Object.entries(schema)
      .filter(([, meta]) => Object.prototype.hasOwnProperty.call(meta || {}, 'default'))
      .map(([key, meta]) => [key, meta?.default])
  )
  return JSON.stringify(defaults, null, 2)
}

function formatJson(value) {
  return JSON.stringify(value || {}, null, 2)
}

function renderIssueList(issues) {
  if (!Array.isArray(issues) || !issues.length) {
    return <Text type="secondary">无阻塞项</Text>
  }

  return (
    <Space direction="vertical" size={6}>
      {issues.map((issue, index) => (
        <div key={`${issue.kind || 'issue'}-${index}`}>
          <Text>{issue.message || '存在未说明问题'}</Text>
          {Array.isArray(issue.items) && issue.items.length ? (
            <div style={{ marginTop: 4 }}>
              <Space wrap>
                {issue.items.map((item) => (
                  <Tag key={String(item)}>{String(item)}</Tag>
                ))}
              </Space>
            </div>
          ) : null}
        </div>
      ))}
    </Space>
  )
}

function renderSimpleList(items, emptyLabel = '无') {
  if (!Array.isArray(items) || !items.length) {
    return <Text type="secondary">{emptyLabel}</Text>
  }
  return (
    <Space wrap>
      {items.map((item) => (
        <Tag key={String(item)}>{String(item)}</Tag>
      ))}
    </Space>
  )
}

function SectionTitle({ children }) {
  return (
    <Text bold style={{ display: 'block', marginBottom: 8 }}>
      {children}
    </Text>
  )
}

export default function OperatorCenterPage() {
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState(emptyCatalog)
  const [keyword, setKeyword] = useState('')
  const [executeModalVisible, setExecuteModalVisible] = useState(false)
  const [selectedOperator, setSelectedOperator] = useState(null)
  const [lastExecution, setLastExecution] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedOperatorDetail, setSelectedOperatorDetail] = useState(null)
  const [form] = Form.useForm()

  const loadCatalog = async () => {
    setLoading(true)
    try {
      const response = await api.getOperatorCatalog()
      setCatalog({
        summary: response?.summary || emptySummary,
        operators: Array.isArray(response?.operators) ? response.operators : [],
      })
    } catch (error) {
      Message.error(getErrorMessage(error, '加载算子目录失败'))
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
        item.key,
        item.name,
        item.modality,
        item.category,
        item.summary,
        item.description,
        item.source_code_path,
        item.migration_status,
        ...(Array.isArray(item.tags) ? item.tags : []),
      ].some((field) => String(field || '').toLowerCase().includes(normalized))
    )
  }, [catalog.operators, keyword])

  const runnableOperators = filteredOperators.filter((item) => item?.health?.can_execute)
  const blockedOperators = filteredOperators.filter((item) => !item?.health?.can_execute)

  const loadOperatorDetail = async (operatorKey) => {
    setDetailLoading(true)
    try {
      const response = await api.getOperatorDetail(operatorKey)
      setSelectedOperatorDetail(response?.operator || null)
    } catch (error) {
      Message.error(getErrorMessage(error, '加载算子详情失败'))
    } finally {
      setDetailLoading(false)
    }
  }

  const openDetailModal = async (operator) => {
    setSelectedOperator(operator)
    setSelectedOperatorDetail(null)
    setDetailVisible(true)
    await loadOperatorDetail(operator.key)
  }

  const openExecuteModal = (operator) => {
    setSelectedOperator(operator)
    form.setFieldsValue({
      source_path: '',
      sink_path: '',
      params_json: buildDefaultParamsText(operator),
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
        Message.error('参数 JSON 格式不正确')
        return
      }

      setSubmitting(true)
      const validation = await api.validateOperator(selectedOperator.key, { params })
      const normalizedParams = validation?.validation?.params || params
      const response = await api.executeOperator({
        operator_key: selectedOperator.key,
        source_path: values.source_path,
        sink_path: values.sink_path,
        params: normalizedParams,
      })
      setLastExecution(response?.data || null)
      Message.success('算子执行完成')
      setExecuteModalVisible(false)
    } catch (error) {
      Message.error(getErrorMessage(error, '执行算子失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const detailOperator = selectedOperatorDetail || selectedOperator

  const columns = [
    {
      title: '算子',
      dataIndex: 'name',
      width: 240,
      render: (_, item) => (
        <Space direction="vertical" size={4}>
          <Text bold>{item.name}</Text>
          <Text type="secondary">{item.summary || item.description}</Text>
          <Text code>{item.key}</Text>
        </Space>
      ),
    },
    {
      title: '模态',
      dataIndex: 'modality',
      width: 100,
      render: (value) => <Tag color="arcoblue">{value}</Tag>,
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: '运行状态',
      dataIndex: 'health',
      width: 220,
      render: (value, item) => (
        <Space direction="vertical" size={4}>
          <Space>
            <Tag color={getHealthColor(value?.state)}>{getHealthLabel(value?.state)}</Tag>
            <Tag color={item.status === 'active' ? 'green' : 'orange'}>{item.status === 'active' ? '已启用' : '仅入库'}</Tag>
          </Space>
          <Text type="secondary">
            {value?.issues?.[0]?.message || item.migration_status || '当前无额外说明'}
          </Text>
        </Space>
      ),
    },
    {
      title: '源码路径',
      dataIndex: 'source_code_path',
      render: (value) => <Text code>{value}</Text>,
    },
    {
      title: '操作',
      width: 180,
      render: (_, item) => (
        <Space>
          <Button type="text" icon={<IconCommand />} onClick={() => openDetailModal(item)}>
            详情
          </Button>
          <Button
            type="text"
            icon={<IconPlayArrow />}
            disabled={!item?.health?.can_execute}
            onClick={() => openExecuteModal(item)}
          >
            执行
          </Button>
        </Space>
      ),
    },
  ]

  const paramsColumns = [
    { title: '参数名', dataIndex: 'name', width: 180, render: (value) => <Text code>{value}</Text> },
    { title: '类型', dataIndex: 'type', width: 100 },
    {
      title: '默认值',
      dataIndex: 'default',
      width: 140,
      render: (value) => <Text>{typeof value === 'undefined' ? '-' : String(value)}</Text>,
    },
    {
      title: '必填',
      dataIndex: 'required',
      width: 80,
      render: (value) => <Tag color={value ? 'red' : 'gray'}>{value ? '是' : '否'}</Tag>,
    },
    { title: '说明', dataIndex: 'description' },
  ]

  const dependencyColumns = [
    { title: '依赖项', dataIndex: 'name', width: 180, render: (value) => <Text code>{value}</Text> },
    { title: '类型', dataIndex: 'kind', width: 140 },
    {
      title: '状态',
      dataIndex: 'state',
      width: 100,
      render: (value) => <Tag color={value === 'available' ? 'green' : value === 'missing' ? 'red' : 'gray'}>{value}</Tag>,
    },
    {
      title: '必须',
      dataIndex: 'required',
      width: 80,
      render: (value) => <Tag color={value ? 'red' : 'gray'}>{value ? '是' : '否'}</Tag>,
    },
    { title: '说明', dataIndex: 'notes' },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>算子中心</Title>
          <Text type="secondary">
            这里展示仓库内全部算子的统一注册信息，包括用途、参数、依赖、环境变量和当前是否可运行。
          </Text>
        </div>
        <Space>
          <Input
            allowClear
            prefix={<IconSearch />}
            placeholder="搜索算子、用途、分类、源码路径"
            style={{ width: 320 }}
            value={keyword}
            onChange={setKeyword}
          />
          <Button icon={<IconRefresh />} onClick={loadCatalog} loading={loading}>刷新</Button>
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid var(--color-border-2)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>算子总数</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{catalog.summary.total}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-2)' }}>统一注册中心当前收录的算子数量。</div>
        </div>
        <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid var(--color-border-2)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>可运行</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: '#00b42a' }}>{catalog.summary.runnable}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-2)' }}>已满足当前仓运行条件，可直接执行的算子数量。</div>
        </div>
        <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid var(--color-border-2)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>需处理</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: '#f53f3f' }}>{catalog.summary.blocked}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-2)' }}>仍缺少依赖、环境变量或未接通执行链路的算子数量。</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--color-border-2)', borderRadius: 8 }}>
        <Tabs defaultActiveTab="all" style={{ padding: '0 20px' }}>
          <TabPane key="all" title={`全部 (${filteredOperators.length})`}>
            <div style={{ padding: 20 }}>
              <Table rowKey="key" loading={loading} columns={columns} data={filteredOperators} pagination={false} borderCell />
            </div>
          </TabPane>
          <TabPane key="runnable" title={`可运行 (${runnableOperators.length})`}>
            <div style={{ padding: 20 }}>
              <Table rowKey="key" loading={loading} columns={columns} data={runnableOperators} pagination={false} borderCell />
            </div>
          </TabPane>
          <TabPane key="blocked" title={`需处理 (${blockedOperators.length})`}>
            <div style={{ padding: 20 }}>
              <Table rowKey="key" loading={loading} columns={columns} data={blockedOperators} pagination={false} borderCell />
            </div>
          </TabPane>
        </Tabs>
      </div>

      {lastExecution ? (
        <div style={{ marginTop: 16, background: '#fff', padding: 20, borderRadius: 8, border: '1px solid var(--color-border-2)' }}>
          <Title heading={6} style={{ marginTop: 0 }}>最近一次执行结果</Title>
          <Descriptions
            column={2}
            data={[
              { label: '算子', value: `${lastExecution.operator_name || ''} (${lastExecution.operator_key || ''})` },
              { label: '输入目录', value: lastExecution.source_path },
              { label: '输出目录', value: lastExecution.sink_path },
              { label: '处理文件', value: `${lastExecution.summary?.total_files || 0} 个` },
              { label: '成功文件', value: `${lastExecution.summary?.success_files || 0} 个` },
              { label: '复制文件', value: `${lastExecution.summary?.copied_files || 0} 个` },
            ]}
          />
          <div style={{ marginTop: 16 }}>
            <SectionTitle>归一化参数</SectionTitle>
            <pre style={{ margin: 0, padding: 12, background: 'var(--color-fill-2)', borderRadius: 6, overflowX: 'auto' }}>
              {formatJson(lastExecution.validated_params)}
            </pre>
          </div>
        </div>
      ) : null}

      <Modal
        title={detailOperator ? `算子详情 - ${detailOperator.name}` : '算子详情'}
        visible={detailVisible}
        footer={null}
        onCancel={() => setDetailVisible(false)}
        style={{ width: 920 }}
      >
        <Spin loading={detailLoading} style={{ width: '100%' }}>
          {detailOperator ? (
            <Tabs defaultActiveTab="overview">
              <TabPane key="overview" title="概览">
                <Descriptions
                  column={2}
                  data={[
                    { label: '算子 Key', value: detailOperator.key },
                    { label: '运行时', value: detailOperator.runtime || '-' },
                    { label: '模态', value: detailOperator.modality || '-' },
                    { label: '分类', value: detailOperator.category || '-' },
                    { label: '源码路径', value: detailOperator.source_code_path || '-' },
                    { label: '执行状态', value: `${getHealthLabel(detailOperator?.health?.state)} / ${detailOperator.status}` },
                  ]}
                />

                <div style={{ marginTop: 16 }}>
                  <SectionTitle>作用说明</SectionTitle>
                  <Paragraph style={{ marginTop: 0 }}>{detailOperator.description || detailOperator.summary}</Paragraph>
                </div>

                <div style={{ marginTop: 16 }}>
                  <SectionTitle>运行健康</SectionTitle>
                  {renderIssueList(detailOperator?.health?.issues)}
                </div>

                <div style={{ marginTop: 16 }}>
                  <SectionTitle>输入输出</SectionTitle>
                  <Descriptions
                    column={1}
                    data={[
                      { label: '输入类型', value: renderSimpleList(detailOperator.input_types, '未声明') },
                      { label: '输出类型', value: renderSimpleList(detailOperator.output_types, '未声明') },
                    ]}
                  />
                </div>

                <div style={{ marginTop: 16 }}>
                  <SectionTitle>使用步骤</SectionTitle>
                  {Array.isArray(detailOperator.usage_steps) && detailOperator.usage_steps.length ? (
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {detailOperator.usage_steps.map((step) => (
                        <li key={step} style={{ marginBottom: 8 }}>{step}</li>
                      ))}
                    </ol>
                  ) : (
                    <Text type="secondary">暂无使用步骤</Text>
                  )}
                </div>
              </TabPane>

              <TabPane key="params" title={`参数 (${detailOperator.params?.length || 0})`}>
                <div style={{ marginBottom: 12 }}>
                  <SectionTitle>参数定义</SectionTitle>
                  <Text type="secondary">
                    执行前会按这里的定义做参数归一化和校验。没有声明的参数不会自动出现在默认模板中。
                  </Text>
                </div>
                <Table
                  rowKey="name"
                  columns={paramsColumns}
                  data={Array.isArray(detailOperator.params) ? detailOperator.params : []}
                  pagination={false}
                  borderCell
                />
              </TabPane>

              <TabPane key="deps" title="依赖与环境">
                <div style={{ marginBottom: 16 }}>
                  <SectionTitle>环境变量</SectionTitle>
                  {renderSimpleList(detailOperator.required_env, '无需额外环境变量')}
                </div>
                <div>
                  <SectionTitle>依赖检查</SectionTitle>
                  <Table
                    rowKey={(record) => `${record.kind}-${record.name}`}
                    columns={dependencyColumns}
                    data={Array.isArray(detailOperator.dependencies) ? detailOperator.dependencies : []}
                    pagination={false}
                    borderCell
                  />
                </div>
              </TabPane>

              <TabPane key="examples" title="示例">
                {Array.isArray(detailOperator.examples) && detailOperator.examples.length ? (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    {detailOperator.examples.map((example) => (
                      <div key={example.name} style={{ paddingBottom: 12, borderBottom: '1px solid var(--color-border-2)' }}>
                        <Text bold>{example.name}</Text>
                        <Paragraph style={{ marginTop: 8 }}>{example.description}</Paragraph>
                        <Descriptions
                          column={1}
                          data={[
                            { label: 'source_path', value: example.source_path },
                            { label: 'sink_path', value: example.sink_path },
                          ]}
                        />
                        <div style={{ marginTop: 12 }}>
                          <Text bold>params</Text>
                          <pre style={{ margin: '8px 0 0', padding: 12, background: 'var(--color-fill-2)', borderRadius: 6, overflowX: 'auto' }}>
                            {formatJson(example.params)}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">暂无示例</Text>
                )}
              </TabPane>
            </Tabs>
          ) : (
            <Text type="secondary">未加载到算子详情</Text>
          )}
        </Spin>
      </Modal>

      <Modal
        title={selectedOperator ? `执行算子 - ${selectedOperator.name}` : '执行算子'}
        visible={executeModalVisible}
        onOk={handleExecute}
        onCancel={() => setExecuteModalVisible(false)}
        confirmLoading={submitting}
        style={{ width: 720 }}
      >
        <Form form={form} layout="vertical">
          <FormItem label="输入目录" field="source_path" rules={[{ required: true, message: '请输入 source_path' }]}>
            <Input placeholder="例如：E:\\data\\source_texts" />
          </FormItem>
          <FormItem label="输出目录" field="sink_path" rules={[{ required: true, message: '请输入 sink_path' }]}>
            <Input placeholder="例如：E:\\data\\clean_texts" />
          </FormItem>
          <FormItem label="参数 JSON" field="params_json">
            <Input.TextArea autoSize={{ minRows: 8, maxRows: 16 }} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </FormItem>
        </Form>
      </Modal>
    </div>
  )
}
