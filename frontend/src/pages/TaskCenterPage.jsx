import { useState } from 'react'
import { Card, Grid, Tabs, Typography } from '@arco-design/web-react'
import { IconCloudDownload, IconRobot } from '@arco-design/web-react/icon'
import TaskGovernancePage from './TaskGovernancePage.jsx'
import RayJobsPage from './RayJobsPage.jsx'

const { Row, Col } = Grid
const { Title, Text } = Typography
const TabPane = Tabs.TabPane

export default function TaskCenterPage() {
  const [activeTab, setActiveTab] = useState('ingestion')

  return (
    <div style={{ padding: 0, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{
        padding: '16px 24px',
        background: 'var(--color-bg-2)',
        borderBottom: '1px solid var(--color-border-2)',
      }}>
        <Title heading={5} style={{ margin: 0 }}>任务中心</Title>
        <Text type="secondary">统一观察工作流实例、批量处理任务和 Ray 作业，形成湖计算域的执行视角。</Text>
      </div>

      <div style={{ padding: '16px 24px', background: 'var(--color-bg-2)', borderBottom: '1px solid var(--color-border-2)' }}>
        <Row gutter={16}>
          <Col span={8}>
            <Card bodyStyle={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>任务治理</div>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>面向批次与流程</div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>聚焦批量任务的状态、结果摘要、日志和后续处理动作。</div>
            </Card>
          </Col>
          <Col span={8}>
            <Card bodyStyle={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Ray 作业</div>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>面向计算资源</div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>聚焦分布式执行、资源配额、日志明细和集群连接状态。</div>
            </Card>
          </Col>
          <Col span={8}>
            <Card bodyStyle={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>运维边界</div>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>与湖运维分离</div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>Doris 告警与自动巡检继续留在湖运维，任务中心只负责计算执行面。</div>
            </Card>
          </Col>
        </Row>
      </div>

      <div style={{ background: 'var(--color-bg-2)', borderBottom: '1px solid var(--color-border-2)' }}>
        <Tabs
          activeTab={activeTab}
          onChange={setActiveTab}
          style={{ padding: '0 24px' }}
        >
          <TabPane key="ingestion" title={<span><IconCloudDownload /> 任务治理</span>} />
          <TabPane key="ray" title={<span><IconRobot /> Ray 作业</span>} />
        </Tabs>
      </div>

      <div>
        {activeTab === 'ingestion' && <TaskGovernancePage />}
        {activeTab === 'ray' && <RayJobsPage />}
      </div>
    </div>
  )
}
