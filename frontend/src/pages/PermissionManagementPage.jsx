import { useEffect, useState } from 'react'
import {
  Card, Button, Space, Table, Tag, Modal, Form, Input, Message, Popconfirm,
  Typography, Empty, Grid, Statistic
} from '@arco-design/web-react'
import { IconPlus, IconRefresh, IconDelete } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'

const { Title, Text } = Typography
const { Row, Col } = Grid
const FormItem = Form.Item

export default function PermissionManagementPage() {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const loadRoles = async () => {
    setLoading(true)
    try {
      const data = await api.getRoles()
      setRoles(Array.isArray(data) ? data : [])
    } catch (e) {
      Message.error(getErrorMessage(e, '加载角色列表失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRoles() }, [])

  const handleCreate = async () => {
    try {
      const values = await form.validate()
      setSubmitting(true)
      const perms = (values.permissions || '').split(',').map(s => s.trim()).filter(Boolean)
      await api.createRole({ name: values.name, description: values.description, permissions: perms })
      Message.success('角色已创建')
      form.resetFields()
      setShowForm(false)
      loadRoles()
    } catch (e) {
      if (e?.response || e?.message) Message.error(getErrorMessage(e, '创建角色失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (roleId) => {
    try {
      await api.deleteRole(roleId)
      Message.success('角色已删除')
      loadRoles()
    } catch (e) {
      Message.error(getErrorMessage(e, '删除失败'))
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70, render: v => <Text code>{v}</Text> },
    { title: '角色名称', dataIndex: 'name', render: v => <Text bold>{v}</Text> },
    { title: '描述', dataIndex: 'description', render: v => v || <Text type="secondary">—</Text> },
    {
      title: '权限', dataIndex: 'permissions',
      render: (perms) => (
        <Space wrap size={4}>
          {(perms || []).length === 0
            ? <Text type="secondary">—</Text>
            : (perms || []).map((p, i) => <Tag key={i} color="arcoblue">{p}</Tag>)}
        </Space>
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 170, render: v => v || '—' },
    {
      title: '操作', width: 90, fixed: 'right',
      render: (_, role) => (
        <Popconfirm title="确认删除该角色？" onOk={() => handleDelete(role.id)}>
          <Button size="small" type="text" status="danger" icon={<IconDelete />}>删除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>权限管理</Title>
          <Text type="secondary">角色定义、权限策略与用户角色分配</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} onClick={loadRoles} loading={loading}>刷新</Button>
          <Button type="primary" icon={<IconPlus />} onClick={() => setShowForm(true)}>新增角色</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="角色总数" value={roles.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="资源域" value={3} suffix={<Text type="secondary" style={{ fontSize: 13 }}>湖管理/计算/配置</Text>} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="权限模型" value="RBAC" />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="目标状态" value="IAM" />
          </Card>
        </Col>
      </Row>

      <Card title="角色列表">
        <Table
          columns={columns}
          data={roles}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10, showTotal: true }}
          noDataElement={<Empty description="暂无角色" />}
        />
      </Card>

      <Modal
        title="新增角色"
        visible={showForm}
        onOk={handleCreate}
        onCancel={() => setShowForm(false)}
        confirmLoading={submitting}
        style={{ width: 480 }}
      >
        <Form form={form} layout="vertical">
          <FormItem label="角色名称" field="name" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="如：data_analyst" />
          </FormItem>
          <FormItem label="描述" field="description">
            <Input placeholder="角色描述" />
          </FormItem>
          <FormItem label="权限列表" field="permissions" extra="逗号分隔，如：read, write, upload">
            <Input placeholder="read, write, upload" />
          </FormItem>
        </Form>
      </Modal>
    </div>
  )
}
