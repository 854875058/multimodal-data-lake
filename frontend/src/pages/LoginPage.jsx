import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, Message, Tag, Space } from '@arco-design/web-react'
import { IconUser, IconLock, IconStorage, IconSearch, IconRobot, IconSafe } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import boncLogo from '@/assets/bonc.jpg'

const { Title, Text, Paragraph } = Typography
const FormItem = Form.Item

function resolveRedirectTarget(location) {
  const candidate = location.state?.from
  if (typeof candidate !== 'string') return '/dashboard'
  if (!candidate.startsWith('/') || candidate.startsWith('/login')) return '/dashboard'
  return candidate
}

const FEATURES = [
  { icon: <IconStorage />, title: '多模态存储', desc: '图文音视频统一入湖' },
  { icon: <IconSearch />, title: '语义检索', desc: 'SQL + 向量双引擎' },
  { icon: <IconSafe />, title: '权限管控', desc: 'RBAC 细粒度授权' },
  { icon: <IconRobot />, title: '高性能计算', desc: 'Ray 分布式编排' },
]

export default function LoginPage({ onLoginSuccess }) {
  const location = useLocation()
  const navigate = useNavigate()
  const redirectTarget = resolveRedirectTarget(location)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validate()
      setSubmitting(true)
      const payload = await api.login(values.username.trim(), values.password)
      if (typeof onLoginSuccess === 'function') onLoginSuccess(payload)
      navigate(redirectTarget, { replace: true })
    } catch (e) {
      if (e?.response || e?.message) {
        Message.error(getErrorMessage(e, '登录失败，请检查用户名和密码'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      background: 'linear-gradient(135deg, #1d2129 0%, #2c3e50 100%)',
    }}>
      {/* 左侧品牌区 */}
      <div style={{
        flex: 1,
        padding: '64px 80px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#fff',
      }}>
        <Space size="medium" align="center">
          <img src={boncLogo} alt="BONC" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <Title heading={6} style={{ color: '#fff', margin: 0 }}>东方国信 · 多模态数据湖</Title>
        </Space>

        <div>
          <Title heading={1} style={{ color: '#fff', marginBottom: 16, fontSize: 44, lineHeight: 1.2 }}>
            多模态数据湖仓
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, marginBottom: 40 }}>
            AI 数据集管理与多模态检索一体化平台
          </Paragraph>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'rgba(22, 93, 255, 0.2)',
                  color: '#4080ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>{f.icon}</div>
                <div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>{f.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Space wrap>
          {['Doris MPP', 'SeaweedFS', 'Lance', 'Ray', 'Gravitino'].map(t => (
            <Tag key={t} color="gray" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none' }}>{t}</Tag>
          ))}
        </Space>
      </div>

      {/* 右侧登录区 */}
      <div style={{
        width: 480,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 60px',
      }}>
        <Card
          bordered={false}
          style={{ width: '100%', boxShadow: 'none' }}
          bodyStyle={{ padding: 0 }}
        >
          <Title heading={3} style={{ marginBottom: 8 }}>欢迎登录</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 32 }}>
            多模态数据湖管理平台
          </Text>

          {redirectTarget !== '/dashboard' && (
            <Message type="warning" content={`登录后将返回 ${redirectTarget}`} style={{ marginBottom: 16 }} />
          )}

          <Form form={form} layout="vertical" autoComplete="on" onSubmit={handleSubmit}>
            <FormItem label="用户名" field="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<IconUser />} placeholder="请输入用户名" size="large" autoComplete="username" />
            </FormItem>
            <FormItem label="密码" field="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<IconLock />} placeholder="请输入密码" size="large" autoComplete="current-password" />
            </FormItem>
            <Button
              type="primary"
              size="large"
              long
              loading={submitting}
              onClick={handleSubmit}
              htmlType="submit"
            >
              登录
            </Button>
          </Form>

          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 32, fontSize: 12 }}>
            © 2025 东方国信 BONC · 多模态数据湖仓平台
          </Text>
        </Card>
      </div>
    </div>
  )
}
