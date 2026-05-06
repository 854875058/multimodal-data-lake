import { useState } from 'react'
import { Card, Tabs, Typography } from '@arco-design/web-react'
import { IconCloudDownload, IconRobot, IconBug } from '@arco-design/web-react/icon'
import TaskGovernancePage from './TaskGovernancePage.jsx'
import RayJobsPage from './RayJobsPage.jsx'
import InspectionPage from './mpp/InspectionPage.jsx'

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
        <Text type="secondary">批量入湖任务 · Ray 作业 · Doris 巡检 — 一站式查看与管理</Text>
      </div>

      <div style={{ background: 'var(--color-bg-2)', borderBottom: '1px solid var(--color-border-2)' }}>
        <Tabs
          activeTab={activeTab}
          onChange={setActiveTab}
          style={{ padding: '0 24px' }}
        >
          <TabPane key="ingestion" title={<span><IconCloudDownload /> 批量入湖任务</span>} />
          <TabPane key="ray" title={<span><IconRobot /> Ray 作业</span>} />
          <TabPane key="inspection" title={<span><IconBug /> Doris 巡检</span>} />
        </Tabs>
      </div>

      <div>
        {activeTab === 'ingestion' && <TaskGovernancePage />}
        {activeTab === 'ray' && <RayJobsPage />}
        {activeTab === 'inspection' && <InspectionPage />}
      </div>
    </div>
  )
}
