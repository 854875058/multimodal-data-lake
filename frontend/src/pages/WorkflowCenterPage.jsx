import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Card, Button, Space, Typography, Grid, Statistic, Spin, Message, Tag } from '@arco-design/web-react'
import { IconCalendarClock, IconFile } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import WorkflowStudio from '@/components/WorkflowStudio.jsx'

const { Row, Col } = Grid
const { Title, Text, Paragraph } = Typography

export default function WorkflowCenterPage() {
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
          <Title heading={5} style={{ margin: 0 }}>工作流编排</Title>
          <Text type="secondary">面向多模态处理链路的统一编排入口，承接算子组合、资源约束与执行模板。</Text>
        </div>
        <Space>
          <NavLink to="/compute/templates">
            <Button icon={<IconFile />}>查看模板库</Button>
          </NavLink>
          <NavLink to="/task-center">
            <Button type="primary" icon={<IconCalendarClock />}>进入任务中心</Button>
          </NavLink>
        </Space>
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
            <Paragraph style={{ marginTop: 8 }}>来源范围沿用接入配置，算子编排和资源调度在湖计算域统一维护。</Paragraph>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card bodyStyle={{ padding: 18 }}>
            <Space direction="vertical" size={4}>
              <Text bold>模板驱动</Text>
              <Text type="secondary">先从模板库选择标准链路，再按业务补充节点和参数。</Text>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card bodyStyle={{ padding: 18 }}>
            <Space direction="vertical" size={4}>
              <Text bold>算子复用</Text>
              <Text type="secondary">跨文本、图像、视频任务复用同一批算子，降低重复建设。</Text>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card bodyStyle={{ padding: 18 }}>
            <Space direction="vertical" size={4}>
              <Text bold>运行观测</Text>
              <Text type="secondary">执行态、日志和 Ray 资源占用统一回流到任务中心与作业实例。</Text>
            </Space>
          </Card>
        </Col>
      </Row>

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
