import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Grid, Message, Space, Tabs, Typography } from '@arco-design/web-react'
import {
  IconCloudDownload,
  IconCommand,
  IconRefresh,
  IconUpload,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatNumber } from '@/utils/format'
import IngestionWorkbenchPage from './IngestionWorkbenchPage.jsx'
import UploadPage from './UploadPage.jsx'

const { Row, Col } = Grid
const { Title, Text, Paragraph } = Typography
const TabPane = Tabs.TabPane

const TAB_MAP = {
  overview: '总览',
  source: '来源接入',
  upload: '本地上传',
}

function StepCard({ index, title, copy, active, current }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${current ? 'rgba(22, 93, 255, 0.4)' : active ? 'rgba(22, 93, 255, 0.22)' : 'var(--color-border-2)'}`,
        background: current ? 'rgba(22, 93, 255, 0.08)' : active ? 'rgba(22, 93, 255, 0.05)' : '#fff',
      }}
    >
      <div style={{ fontSize: 12, color: current ? '#165dff' : 'var(--color-text-3)' }}>{index}{current ? ' ← 当前' : ''}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: 'var(--color-text-1)' }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{copy}</div>
    </div>
  )
}

function OverviewTab({ summary, onGoTab, onGoWorkflow, onGoTasks, refreshing, onRefresh }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>接入中心</Title>
          <Text type="secondary">
            聚焦数据如何进入湖存储，统一处理来源接入、本地上传和基础接入概览。
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
          <div className="m">当前可追踪的接入任务总量。</div>
        </div>
        <div className="prd-summary-item">
          <div className="k">计算入口</div>
          <div className="v">{summary.rayDashboard}</div>
          <div className="m">复杂处理链路已移交到湖计算域统一编排与调度。</div>
        </div>
      </div>

      <Card title="推荐流程" bodyStyle={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <StepCard index="01" title="来源接入" copy="验证数据源、扫描对象并筛选待入湖数据。" active current={summary.activeJobs === 0 && summary.totalJobs === 0} />
          <StepCard index="02" title="本地上传" copy="处理离线交付文件、压缩包和一次性批量资料。" active={summary.totalJobs > 0} current={summary.activeJobs === 0 && summary.totalJobs > 0} />
          <StepCard index="03" title="湖计算编排" copy="复杂任务切入湖计算域进行工作流编排与资源调度。" active={summary.activeJobs > 0} current={summary.activeJobs > 0} />
          <StepCard index="04" title="任务治理" copy="进入任务中心统一观察执行状态、结果摘要和异常定位。" active={summary.totalJobs > 0 && summary.activeJobs === 0} current={false} />
        </div>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="快捷入口" bodyStyle={{ padding: 16 }}>
            <Paragraph style={{ marginTop: 0 }}>
              接入中心保留清晰的入湖主线；复杂处理流程和执行观测已经独立到湖计算域，边界更清楚。
            </Paragraph>
            <Space wrap>
              <Button type="primary" icon={<IconCloudDownload />} onClick={() => onGoTab('source')}>来源接入</Button>
              <Button icon={<IconUpload />} onClick={() => onGoTab('upload')}>本地上传</Button>
              <Button icon={<IconCommand />} onClick={onGoWorkflow}>工作流编排</Button>
              <Button onClick={onGoTasks}>任务中心</Button>
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="当前建议" bodyStyle={{ padding: 16 }}>
            <Paragraph style={{ marginTop: 0, marginBottom: 0 }}>
              {summary.activeJobs > 0
                ? `当前有 ${formatNumber(summary.activeJobs)} 个活动任务，建议先到任务中心观察执行态势，再决定是否继续发起新的入湖任务。`
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
      Message.error(getErrorMessage(error, '加载接入中心概览失败'))
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
      return (
        <OverviewTab
          summary={summary}
          onGoTab={handleTabChange}
          onGoWorkflow={() => navigate('/workflow')}
          onGoTasks={() => navigate('/task-center')}
          refreshing={refreshing}
          onRefresh={loadSummary}
        />
      )
    }
    if (activeTab === 'source') return <IngestionWorkbenchPage />
    if (activeTab === 'upload') return <UploadPage />
    return <Navigate to="/ingestion" replace />
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
        </Tabs>
      </Card>

      <div style={{ marginTop: 16 }}>
        {content}
      </div>
    </div>
  )
}
