import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Space, Typography, Grid, Statistic, Spin, Message, Tag } from '@arco-design/web-react'
import { IconLeft } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import WorkflowStudio from '@/components/WorkflowStudio.jsx'

const { Row, Col } = Grid
const { Title, Text, Paragraph } = Typography

export default function WorkflowCenterPage() {
  const navigate = useNavigate()
  const [platformSettings, setPlatformSettings] = useState(null)
  const [workbenchSettings, setWorkbenchSettings] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [p, w, j] = await Promise.all([
          api.getPlatformSettings(),
          api.getWorkbenchSettings(),
          api.getWorkbenchJobs(20),
        ])
        setPlatformSettings(p?.data || null)
        setWorkbenchSettings(w?.data || null)
        setJobs(Array.isArray(j?.jobs) ? j.jobs : [])
      } catch (e) {
        Message.error(getErrorMessage(e, '加载编排中心失败'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const activeJobs = jobs.filter(j => ['pending', 'running', 'cancelling'].includes(j.status)).length
  const sourceHint = workbenchSettings?.source_type === 'sftp'
    ? (workbenchSettings?.sftp_path || '/')
    : (workbenchSettings?.prefix || '/')

  if (loading) {
    return <div style={{ padding: 64, textAlign: 'center' }}><Spin size={32} /></div>
  }

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>编排中心</Title>
          <Text type="secondary">Daft ETL 工作流、Ray Job 资源约束和执行模板</Text>
        </div>
        <Button icon={<IconLeft />} onClick={() => navigate('/workbench')}>返回 AI 工作台</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="Ray Dashboard" value={platformSettings?.ray_dashboard_url || '—'} valueStyle={{ fontSize: 14, fontFamily: 'monospace' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="SeaweedFS / Lance" value={platformSettings?.seaweedfs_s3_url || '—'} valueStyle={{ fontSize: 14, fontFamily: 'monospace' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="当前来源" value={sourceHint} valueStyle={{ fontSize: 14, fontFamily: 'monospace' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic
              title="活动任务"
              value={activeJobs}
              valueStyle={{ color: activeJobs > 0 ? '#165dff' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="使用建议" style={{ marginBottom: 16 }}>
        <Row gutter={24}>
          <Col span={8}>
            <Tag color="arcoblue">先定模板</Tag>
            <Paragraph style={{ marginTop: 8 }}>优先从预设工作流开始，减少手拼节点。</Paragraph>
          </Col>
          <Col span={8}>
            <Tag color="green">职责分离</Tag>
            <Paragraph style={{ marginTop: 8 }}>编排负责定义，治理负责观测，不要混用。</Paragraph>
          </Col>
          <Col span={8}>
            <Tag color="orange">复用配置</Tag>
            <Paragraph style={{ marginTop: 8 }}>来源配置在 AI 工作台维护，这里直接读最近保存的范围。</Paragraph>
          </Col>
        </Row>
      </Card>

      <Card title="工作流编辑器" bodyStyle={{ padding: 16 }}>
        <WorkflowStudio
          sourceHint={sourceHint}
          onBanner={(type, message) => {
            if (type === 'error') Message.error(message)
            else if (type === 'success') Message.success(message)
            else Message.info(message)
          }}
        />
      </Card>
    </div>
  )
}
