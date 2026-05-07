import { useEffect, useState } from 'react'
import {
  Button, Card, Space, Table, Tag, Tabs, Modal, Form, Input, InputNumber,
  Message, Popconfirm, Statistic, Grid, Typography, Empty, Spin, Descriptions
} from '@arco-design/web-react'
import {
  IconPlus, IconRefresh, IconEdit, IconDelete, IconCheckCircle,
  IconCloseCircle, IconStorage, IconSync
} from '@arco-design/web-react/icon'
import { ClusterTopology, HealthRing, PrdTag } from '@/components/PrdWidgets.jsx'

const { Row, Col } = Grid
const { Title, Text } = Typography
const TabPane = Tabs.TabPane
const FormItem = Form.Item

const API = '/api/doris'

async function dorisGet(path, params = {}) {
  const url = new URL(API + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPost(path, body = {}) {
  const res = await fetch(API + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPut(path, body = {}) {
  const res = await fetch(API + path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisDelete(path) {
  const res = await fetch(API + path, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function AliveTag({ alive }) {
  if (alive === true || alive === 'true')
    return <Tag color="green" icon={<IconCheckCircle />}>存活</Tag>
  if (alive === false || alive === 'false')
    return <Tag color="red" icon={<IconCloseCircle />}>离线</Tag>
  return <Tag>—</Tag>
}

function ClusterFormModal({ visible, initial, onClose, onSaved }) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const isEdit = !!initial?.id

  useEffect(() => {
    if (visible) {
      form.setFieldsValue(initial || {
        name: '', fe_host: '', fe_query_port: 9030, fe_http_port: 8030,
        username: 'root', password: '', description: '',
      })
    }
  }, [visible, initial])

  const handleOk = async () => {
    try {
      const values = await form.validate()
      setSaving(true)
      const data = isEdit
        ? await dorisPut(`/clusters/${initial.id}`, values)
        : await dorisPost('/clusters', values)
      if (data.success) {
        Message.success(isEdit ? '集群已更新' : '集群已注册')
        onSaved()
        onClose()
      } else {
        Message.error(data.detail || '保存失败')
      }
    } catch (e) {
      if (e?.message) Message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isEdit ? '编辑 Doris 集群' : '注册 Doris 集群'}
      visible={visible}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={saving}
      style={{ width: 560 }}
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={16}>
          <Col span={24}>
            <FormItem label="集群名称" field="name" rules={[{ required: true, message: '请输入集群名称' }]}>
              <Input placeholder="如：生产集群" />
            </FormItem>
          </Col>
          <Col span={24}>
            <FormItem label="FE 地址" field="fe_host" rules={[{ required: true, message: '请输入 FE 主机地址' }]}>
              <Input placeholder="如：192.168.1.10" />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem label="Query 端口" field="fe_query_port">
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem label="HTTP 端口" field="fe_http_port">
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem label="用户名" field="username">
              <Input />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem label="密码" field="password">
              <Input.Password />
            </FormItem>
          </Col>
          <Col span={24}>
            <FormItem label="备注" field="description">
              <Input.TextArea rows={2} placeholder="可选" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

export default function ClusterPage() {
  const [clusters, setClusters] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [modalState, setModalState] = useState(null)

  const currentCluster = clusters.find(c => c.id === currentId) || null

  const loadClusters = async () => {
    setLoading(true)
    try {
      const data = await dorisGet('/clusters')
      const list = data.clusters || []
      setClusters(list)
      if (list.length > 0 && !list.find(c => c.id === currentId)) {
        setCurrentId(list[0].id)
      } else if (list.length === 0) {
        setCurrentId(null)
      }
    } catch (e) {
      Message.error('获取集群列表失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStatus = async (clusterId) => {
    if (!clusterId) return
    setStatusLoading(true)
    try {
      const data = await dorisGet(`/clusters/${clusterId}/status`)
      setStatus(data)
    } catch (e) {
      setStatus({ connected: false, fe_nodes: [], be_nodes: [] })
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => { loadClusters() }, [])
  useEffect(() => { if (currentId) loadStatus(currentId) }, [currentId])

  const handleTest = async () => {
    if (!currentCluster) return
    try {
      const data = await dorisPost(`/clusters/${currentCluster.id}/test`)
      if (data.success) Message.success(`连接成功，版本：${data.version}`)
      else Message.error('连接失败：' + data.message)
    } catch (e) {
      Message.error('连接测试失败：' + e.message)
    }
  }

  const handleDelete = async () => {
    if (!currentCluster) return
    try {
      await dorisDelete(`/clusters/${currentCluster.id}`)
      Message.success('集群已删除')
      setCurrentId(null)
      setStatus(null)
      loadClusters()
    } catch (e) {
      Message.error('删除失败：' + e.message)
    }
  }

  const feNodes = status?.fe_nodes || []
  const beNodes = status?.be_nodes || []

  const feColumns = [
    { title: '主机', dataIndex: 'host', render: v => <Text code>{v || '—'}</Text> },
    { title: 'Query 端口', dataIndex: 'port', render: v => <Text code>{v || '—'}</Text> },
    { title: 'HTTP 端口', dataIndex: 'http_port', render: v => <Text code>{v || '—'}</Text> },
    { title: '角色', dataIndex: 'role' },
    { title: 'Master', dataIndex: 'is_master', render: v => v ? <Tag color="arcoblue">是</Tag> : '否' },
    { title: '状态', dataIndex: 'alive', render: v => <AliveTag alive={v} /> },
    { title: '最后心跳', dataIndex: 'last_heartbeat' },
  ]

  const beColumns = [
    { title: '主机', dataIndex: 'host', render: v => <Text code>{v || '—'}</Text> },
    { title: '心跳端口', dataIndex: 'port', render: v => <Text code>{v || '—'}</Text> },
    { title: 'BE 端口', dataIndex: 'be_port', render: v => <Text code>{v || '—'}</Text> },
    { title: '状态', dataIndex: 'alive', render: v => <AliveTag alive={v} /> },
    { title: '总容量', dataIndex: 'total_capacity' },
    { title: '已用', dataIndex: 'used_capacity' },
    { title: '最后心跳', dataIndex: 'last_heartbeat' },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <ClusterFormModal
        visible={!!modalState}
        initial={modalState?.cluster || null}
        onClose={() => setModalState(null)}
        onSaved={loadClusters}
      />

      {/* 页头 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>Doris 集群管理</Title>
          <Text type="secondary">MPP 数据库集群运维与监控</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} onClick={loadClusters} loading={loading}>刷新</Button>
          <Button type="primary" icon={<IconPlus />} onClick={() => setModalState({ cluster: null })}>
            注册集群
          </Button>
        </Space>
      </div>

      {/* 集群选择 */}
      {clusters.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
          <Space wrap>
            <Text type="secondary">选择集群：</Text>
            {clusters.map(c => (
              <Tag
                key={c.id}
                size="medium"
                color={currentId === c.id ? 'arcoblue' : undefined}
                checkable
                checked={currentId === c.id}
                onCheck={() => setCurrentId(c.id)}
                style={{ cursor: 'pointer', padding: '4px 12px' }}
              >
                <IconStorage style={{ marginRight: 4 }} />
                {c.name}
              </Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* 空状态 */}
      {clusters.length === 0 && !loading && (
        <Card>
          <Empty
            description="暂无集群，请注册 Doris FE 节点的连接信息"
          >
            <Button type="primary" icon={<IconPlus />} onClick={() => setModalState({ cluster: null })}>
              注册第一个集群
            </Button>
          </Empty>
        </Card>
      )}

      {currentCluster && (
        <>
          {/* 统计卡片 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card bodyStyle={{ padding: 20 }}>
                <Statistic title="集群名称" value={currentCluster.name} />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 20 }}>
                <Statistic
                  title="FE 地址"
                  value={currentCluster.fe_host}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>:{currentCluster.fe_query_port}</Text>}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 20 }}>
                <Statistic
                  title="连接状态"
                  value={statusLoading ? '检测中' : (status?.connected ? '已连接' : '未连接')}
                  valueStyle={{ color: status?.connected ? '#00b42a' : '#f53f3f' }}
                  prefix={status?.connected ? <IconCheckCircle /> : <IconCloseCircle />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card bodyStyle={{ padding: 20 }}>
                <Statistic
                  title="节点总数"
                  value={statusLoading ? 0 : feNodes.length + beNodes.length}
                  suffix={
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      FE {feNodes.length} / BE {beNodes.length}
                    </Text>
                  }
                />
              </Card>
            </Col>
          </Row>

          {/* Tab 区 */}
          <Card>
            <Tabs activeTab={activeTab} onChange={setActiveTab}>
              <TabPane key="overview" title="集群概览">
                {/* PRD 风格 hero：拓扑 + 健康评分 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20,
                }}>
                  <div className="prd-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--prd-ink)' }}>集群拓扑</div>
                        <div style={{ fontSize: 11, color: 'var(--prd-ink-3)', marginTop: 2 }}>
                          FE {feNodes.length} · BE {beNodes.length} · 实时心跳
                        </div>
                      </div>
                      {status?.connected
                        ? <PrdTag kind="ok" led>已连接</PrdTag>
                        : <PrdTag kind="bad" led>未连接</PrdTag>}
                    </div>
                    {(feNodes.length + beNodes.length) === 0 ? (
                      <Empty description={statusLoading ? '加载节点中...' : '暂无节点数据'} />
                    ) : (
                      <ClusterTopology
                        feNodes={feNodes.map((n, i) => ({
                          id: i, label: `FE-${i+1}`, status: n.alive ? 'ok' : 'dead', master: n.is_master,
                        }))}
                        beNodes={beNodes.map((n, i) => ({
                          id: i, label: `BE-${i+1}`, status: n.alive ? 'ok' : 'dead',
                        }))}
                      />
                    )}
                  </div>

                  <div className="prd-card" style={{ padding: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--prd-ink)', marginBottom: 12 }}>
                      集群健康评分
                    </div>
                    {(() => {
                      const totalNodes = feNodes.length + beNodes.length
                      const aliveNodes = feNodes.filter(n => n.alive).length + beNodes.filter(n => n.alive).length
                      const score = totalNodes > 0 ? Math.round((aliveNodes / totalNodes) * 100) : 0
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                            <HealthRing percent={score} />
                          </div>
                          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--prd-ink-3)' }}>
                            {totalNodes === 0 ? '等待连接' :
                              aliveNodes === totalNodes ? `${totalNodes} 个节点全部存活` :
                              `${aliveNodes} / ${totalNodes} 节点存活`}
                          </div>
                          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                            <div style={{ padding: '8px 10px', background: 'var(--prd-brand-soft)', borderRadius: 6, textAlign: 'center' }}>
                              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--prd-brand)' }}>{feNodes.length}</div>
                              <div style={{ fontSize: 10, color: 'var(--prd-ink-3)' }}>FE 节点</div>
                            </div>
                            <div style={{ padding: '8px 10px', background: '#E2F7F8', borderRadius: 6, textAlign: 'center' }}>
                              <div style={{ fontSize: 18, fontWeight: 700, color: '#00897B' }}>{beNodes.length}</div>
                              <div style={{ fontSize: 10, color: 'var(--prd-ink-3)' }}>BE 节点</div>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>
                </div>

                <Descriptions
                  column={2}
                  size="medium"
                  data={[
                    { label: '集群 ID', value: <Text code copyable>{currentCluster.id}</Text> },
                    { label: '集群名称', value: currentCluster.name },
                    { label: 'FE 主机', value: <Text code>{currentCluster.fe_host}</Text> },
                    { label: 'Query 端口', value: <Text code>{currentCluster.fe_query_port}</Text> },
                    { label: 'HTTP 端口', value: <Text code>{currentCluster.fe_http_port}</Text> },
                    { label: '用户名', value: currentCluster.username },
                    { label: '备注', value: currentCluster.description || <Text type="secondary">—</Text> },
                    { label: '注册时间', value: <Text type="secondary">{currentCluster.created_at || '—'}</Text> },
                  ]}
                  labelStyle={{ width: 110 }}
                />
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--color-border-2)' }}>
                  <Space>
                    <Button type="primary" icon={<IconCheckCircle />} onClick={handleTest}>测试连接</Button>
                    <Button icon={<IconSync />} onClick={() => loadStatus(currentCluster.id)} loading={statusLoading}>刷新状态</Button>
                    <Button icon={<IconEdit />} onClick={() => setModalState({ cluster: currentCluster })}>编辑</Button>
                    <Popconfirm
                      title={`确认删除集群「${currentCluster.name}」？`}
                      onOk={handleDelete}
                    >
                      <Button status="danger" icon={<IconDelete />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </div>
              </TabPane>

              <TabPane key="fe" title={`FE 节点 (${feNodes.length})`}>
                <Spin loading={statusLoading} style={{ display: 'block' }}>
                  <Table
                    columns={feColumns}
                    data={feNodes}
                    rowKey="host"
                    pagination={false}
                    border={false}
                    noDataElement={<Empty description={statusLoading ? '加载中...' : '暂无 FE 节点'} />}
                  />
                </Spin>
              </TabPane>

              <TabPane key="be" title={`BE 节点 (${beNodes.length})`}>
                <Spin loading={statusLoading} style={{ display: 'block' }}>
                  <Table
                    columns={beColumns}
                    data={beNodes}
                    rowKey="host"
                    pagination={false}
                    border={false}
                    noDataElement={<Empty description={statusLoading ? '加载中...' : '暂无 BE 节点'} />}
                  />
                </Spin>
              </TabPane>
            </Tabs>
          </Card>
        </>
      )}
    </div>
  )
}
