import { useEffect, useState } from 'react'
import {
  Card, Button, Space, Table, Tag, Modal, Form, Input, Message, Popconfirm,
  Typography, Empty, Grid, Statistic
} from '@arco-design/web-react'
import { IconPlus, IconRefresh, IconDelete } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatDateTime } from '@/utils/format'

const { Title, Text } = Typography
const { Row, Col } = Grid
const FormItem = Form.Item

export default function UserManagementPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await api.getUsers()
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      Message.error(getErrorMessage(e, '加载用户列表失败'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleCreate = async () => {
    try {
      const values = await form.validate()
      setSubmitting(true)
      await api.createUser(values)
      Message.success('用户已创建')
      form.resetFields()
      setShowForm(false)
      loadUsers()
    } catch (e) {
      if (e?.response || e?.message) Message.error(getErrorMessage(e, '创建用户失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (userId) => {
    try {
      await api.deleteUser(userId)
      Message.success('用户已删除')
      loadUsers()
    } catch (e) {
      Message.error(getErrorMessage(e, '删除用户失败'))
    }
  }

  const handleToggle = async (user) => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active })
      Message.success('状态已更新')
      loadUsers()
    } catch (e) {
      Message.error(getErrorMessage(e, '更新失败'))
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70, render: v => <Text code>{v}</Text> },
    { title: '用户名', dataIndex: 'username', render: v => <Text bold>{v}</Text> },
    { title: '邮箱', dataIndex: 'email', render: v => <Text code>{v}</Text> },
    { title: '姓名', dataIndex: 'full_name', render: v => v || <Text type="secondary">—</Text> },
    {
      title: '状态', dataIndex: 'is_active', width: 90,
      render: v => v ? <Tag color="green">启用</Tag> : <Tag color="orange">禁用</Tag>,
    },
    {
      title: '角色', dataIndex: 'is_admin', width: 100,
      render: v => v ? <Tag color="arcoblue">管理员</Tag> : <Tag>普通用户</Tag>,
    },
    {
      title: '创建时间', dataIndex: 'created_at', width: 170,
      render: v => v ? formatDateTime(v) : '—',
    },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, user) => (
        <Space>
          <Button size="small" onClick={() => handleToggle(user)}>
            {user.is_active ? '禁用' : '启用'}
          </Button>
          <Popconfirm title="确认删除该用户？" onOk={() => handleDelete(user.id)}>
            <Button size="small" type="text" status="danger" icon={<IconDelete />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>用户管理</Title>
          <Text type="secondary">平台账号、角色绑定与状态控制</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} onClick={loadUsers} loading={loading}>刷新</Button>
          <Button type="primary" icon={<IconPlus />} onClick={() => setShowForm(true)}>新建用户</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="用户总数" value={users.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="已启用" value={users.filter(u => u.is_active).length} valueStyle={{ color: '#00b42a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="管理员" value={users.filter(u => u.is_admin).length} valueStyle={{ color: '#165dff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="权限模型" value="RBAC" />
          </Card>
        </Col>
      </Row>

      <Card title="账号列表">
        <Table
          columns={columns}
          data={users}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10, showTotal: true }}
          noDataElement={<Empty description="暂无用户" />}
        />
      </Card>

      <Modal
        title="新建用户"
        visible={showForm}
        onOk={handleCreate}
        onCancel={() => setShowForm(false)}
        confirmLoading={submitting}
        style={{ width: 480 }}
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <FormItem label="用户名" field="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="用户名" />
          </FormItem>
          <FormItem label="邮箱" field="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="user@example.com" />
          </FormItem>
          <FormItem label="密码" field="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="密码" />
          </FormItem>
          <FormItem label="姓名" field="full_name">
            <Input placeholder="可选" />
          </FormItem>
        </Form>
      </Modal>
    </div>
  )
}
