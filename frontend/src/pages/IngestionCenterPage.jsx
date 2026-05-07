import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Grid, Message, Space, Tabs, Typography } from '@arco-design/web-react'
import {
  IconCalendarClock,
  IconCloudDownload,
  IconCommand,
  IconRefresh,
  IconUpload,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatNumber } from '@/utils/format'
import IngestionWorkbenchPage from './IngestionWorkbenchPage.jsx'
import TaskCenterPage from './TaskCenterPage.jsx'
import UploadPage from './UploadPage.jsx'
import WorkflowCenterPage from './WorkflowCenterPage.jsx'

const { Row, Col } = Grid
const { Title, Text, Paragraph } = Typography
const TabPane = Tabs.TabPane

const TAB_MAP = {
  overview: '总览',
  source: '来源接入',
  upload: '本地上传',
  workflow: '工作流编排',
  tasks: '任务治理',
}

function StatCard({ title, value, note }) {
  return (
    <Card bodyStyle={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: 'var(--color-text-1)' }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.7 }}>{note}</div>
    </Card>
  )
}

function StepCard({ index, title, copy, active }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${active ? 'rgba(22, 93, 255, 0.22)' : 'var(--color-border-2)'}`,
        background: active ? 'rgba(22, 93, 255, 0.05)' : '#fff',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{index}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: 'var(--color-text-1)' }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{copy}</div>
    </div>
  )
}

function OverviewTab({ summary, onGoTab, refreshing, onRefresh }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>接入任务中心</Title>
          <Text type="secondary">
            将来源接入、本地上传、工作流编排和任务治理收口为一条完整链路，减少页面切换成本，便于演示和日常运维。
          </Text>
        </div>
        <div className="prd-page-actions">
          <Button icon={<IconRefresh />} loading={refreshing} onClick={onRefresh}>刷新概览</Button>
        </div>
      </div>

      <div className="prd-summary-band">
        <div className="prd-summary-item">
          <div className="k">默认来源</div>
          <div className="v">{summary.sourceLabel}</div>
          <div className="m">{summary.sourcePath}</div>
        </div>
        <div className="prd-summary-item">
          <div className="k">活动任务</div>
          <div className="v">{formatNumber(summary.activeJobs)} 个</div>
          <div className="m">正在执行、排队中或取消中的任务数量。</div>
        </div>
        <div className="prd-summary-item">
          <div className="k">纳入治理</div>
          <div className="v">{formatNumber(summary.totalJobs)} 批</div>
          <div className="m">任务中心当前可追踪的批量入湖任务总量。</div>
        </div>
        <div className="prd-summary-item">
          <div className="k">编排入口</div>
          <div className="v">{summary.rayDashboard}</div>
          <div className="m">统一承接 Ray / Daft 作业编排与资源调度。</div>
        </div>
      </div>

      <Row gutter={16}>
        <Col span={6}>
          <StatCard title="来源类型" value={summary.sourceType} note="对象存储与 SFTP 接入统一纳入同一治理链路。" />
        </Col>
        <Col span={6}>
          <StatCard title="活动任务" value={formatNumber(summary.activeJobs)} note="用于快速判断当前是否适合继续发起新的批量任务。" />
        </Col>
        <Col span={6}>
          <StatCard title="任务总量" value={formatNumber(summary.totalJobs)} note="将入湖执行和后续治理统一收口到任务视角。" />
        </Col>
        <Col span={6}>
          <StatCard title="工作流入口" value={summary.rayShort} note="复杂流程走编排中心，工作台聚焦来源接入和扫描。" />
        </Col>
      </Row>

      <Card title="推荐流程" bodyStyle={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <StepCard index="01" title="来源接入" copy="验证数据源、扫描对象并筛选待入湖数据。" active />
          <StepCard index="02" title="本地上传" copy="处理离线交付文件、压缩包和一次性批量资料。" active />
          <StepCard index="03" title="工作流编排" copy="复杂任务切入 Ray / Daft 统一编排执行。" active />
          <StepCard index="04" title="任务治理" copy="集中查看状态、结果摘要、参数复用和后续处理。" active />
        </div>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="快捷入口" bodyStyle={{ padding: 16 }}>
            <Paragraph style={{ marginTop: 0 }}>
              这里保留一条清晰的入湖主线，使用者无需先理解模块边界，就能顺着链路完成接入、编排与治理。
            </Paragraph>
            <Space wrap>
              <Button type="primary" icon={<IconCloudDownload />} onClick={() => onGoTab('source')}>来源接入</Button>
              <Button icon={<IconUpload />} onClick={() => onGoTab('upload')}>本地上传</Button>
              <Button icon={<IconCommand />} onClick={() => onGoTab('workflow')}>工作流编排</Button>
              <Button icon={<IconCalendarClock />} onClick={() => onGoTab('tasks')}>任务治理</Button>
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="当前建议" bodyStyle={{ padding: 16 }}>
            <Paragraph style={{ marginTop: 0, marginBottom: 0 }}>
              {summary.activeJobs > 0
                ? `当前有 ${formatNumber(summary.activeJobs)} 个活动任务，建议先进入任务治理观察执行态势，再决定是否继续发起新的入湖任务。`
                : '当前没有活动任务，可以直接从来源接入发起新一轮扫描导入，或通过本地上传处理离线文件。'}
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default function IngestionCenterPage() {
  const navigate = useNavigate()
  const { tab } = useParams()
  const activeTab = TAB_MAP[tab] ? tab : 'overview'
  const [refreshing, setRefreshing] = useState(false)
  const [summary, setSummary] = useState({
    sourceType: 'S3 / SeaweedFS',
    sourceLabel: '未配置来源',
    sourcePath: '/',
    activeJobs: 0,
    totalJobs: 0,
    rayDashboard: '--',
    rayShort: '--',
  })

  const loadSummary = async () => {
    setRefreshing(true)
    try {
      const [platformResponse, workbenchResponse, jobsResponse] = await Promise.all([
        api.getPlatformSettings(),
        api.getWorkbenchSettings(),
        api.getWorkbenchJobs(50),
      ])

      const platform = platformResponse?.data || {}
      const workbench = workbenchResponse?.data || {}
      const jobs = Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : []
      const activeJobs = jobs.filter((job) => ['pending', 'running', 'cancelling'].includes(job.status)).length
      const sourceType = workbench.source_type === 'sftp' ? 'SFTP' : 'S3 / SeaweedFS'
      const sourceLabel = workbench.source_type === 'sftp'
        ? (workbench.sftp_host || '未配置 SFTP 主机')
        : (workbench.bucket_name || '未配置 Bucket')
      const sourcePath = workbench.source_type === 'sftp'
        ? (workbench.sftp_path || '/')
        : (workbench.prefix || '/')
      const rayDashboard = platform.ray_dashboard_url || '--'
      let rayShort = '--'
      if (rayDashboard && rayDashboard !== '--') {
        try {
          rayShort = new URL(rayDashboard).host
        } catch {
          rayShort = rayDashboard
        }
      }

      setSummary({
        sourceType,
        sourceLabel,
        sourcePath,
        activeJobs,
        totalJobs: jobs.length,
        rayDashboard,
        rayShort,
      })
    } catch (error) {
      Message.error(getErrorMessage(error, '加载接入任务中心概览失败'))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [])

  const handleTabChange = (nextTab) => {
    navigate(nextTab === 'overview' ? '/ingestion' : `/ingestion/${nextTab}`)
  }

  const content = useMemo(() => {
    if (activeTab === 'overview') {
      return <OverviewTab summary={summary} onGoTab={handleTabChange} refreshing={refreshing} onRefresh={loadSummary} />
    }
    if (activeTab === 'source') return <IngestionWorkbenchPage />
    if (activeTab === 'upload') return <UploadPage />
    if (activeTab === 'workflow') return <WorkflowCenterPage />
    return <TaskCenterPage />
  }, [activeTab, refreshing, summary])

  if (tab && !TAB_MAP[tab]) {
    return <Navigate to="/ingestion" replace />
  }

  return (
    <div style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      <Card bodyStyle={{ padding: 0 }}>
        <Tabs activeTab={activeTab} onChange={handleTabChange} style={{ padding: '0 20px' }}>
          <TabPane key="overview" title="总览" />
          <TabPane key="source" title="来源接入" />
          <TabPane key="upload" title="本地上传" />
          <TabPane key="workflow" title="工作流编排" />
          <TabPane key="tasks" title="任务治理" />
        </Tabs>
      </Card>

      <div style={{ marginTop: 16 }}>
        {content}
      </div>
    </div>
  )
}
