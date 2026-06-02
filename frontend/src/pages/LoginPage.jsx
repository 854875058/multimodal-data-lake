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
      height: '100vh', display: 'flex',
      background: 'var(--color-fill-1)',
    }}>
      {/* 左侧品牌区 */}
      <div style={{
        flex: 1, padding: '48px 64px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', color: 'var(--color-text-1)',
        background: 'linear-gradient(135deg, #E8F3FF 0%, #F5E8FF 50%, #E8FFFB 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* 装饰光斑 */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(22,93,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, left: '20%', width: 200, height: 200, borderRadius: '50%', background: 'rgba(114,46,209,0.05)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <img src={boncLogo} alt="BONC" style={{ width: 40, height: 40, borderRadius: 8 }} />
          <Text style={{ fontSize: 15, fontWeight: 600 }}>东方国信 · 多模态数据湖</Text>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Title heading={1} style={{ marginBottom: 12, fontSize: 40, lineHeight: 1.2 }}>
            多模态数据湖仓
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 16, marginBottom: 36 }}>
            AI 数据集管理与多模态检索一体化平台
          </Paragraph>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {FEATURES.map(f => (
              <Card key={f.title} hoverable style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)' }} bodyStyle={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: '#E8F3FF', color: '#165DFF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, flexShrink: 0,
                  }}>{f.icon}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{f.title}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>{f.desc}</Text>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <Space wrap style={{ position: 'relative', zIndex: 1 }}>
          {['Doris MPP', 'SeaweedFS', 'Lance', 'Ray', 'Gravitino'].map(t => (
            <Tag key={t} style={{ background: 'rgba(22,93,255,0.08)', color: '#165DFF', border: 'none' }}>{t}</Tag>
          ))}
        </Space>
      </div>

      {/* 右侧登录区 */}
      <div style={{
        width: 480, background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 60px',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
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
            <Button type="primary" size="large" long loading={submitting} onClick={handleSubmit} htmlType="submit">
              登录
            </Button>
          </Form>

          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 32, fontSize: 12 }}>
            © 2025 东方国信 BONC · 多模态数据湖仓平台
          </Text>
        </div>
      </div>
    </div>
  )
}
