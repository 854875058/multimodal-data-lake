import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Grid, Space, Spin, Table, Tabs, Tag, Typography } from '@arco-design/web-react'
import { IconCalendarClock, IconPlayArrow, IconRefresh, IconRobot } from '@arco-design/web-react/icon'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import { rayGet } from '@/api/ray'
import { formatDateTime, formatNumber } from '@/utils/format'

const { Row, Col } = Grid
const { Title, Text } = Typography
const TabPane = Tabs.TabPane

function normalizeJob(job) {
  const s = job && typeof job === 'object' ? job : {}
  return {
    ...s,
    payload: s.payload && typeof s.payload === 'object' ? s.payload : {},
    result: s.result && typeof s.result === 'object' ? s.result : {},
    message: typeof s.message === 'string' ? s.message : '',
  }
}

function getJobProgress(job) {
  const current = Number(job?.progress_current || 0)
  const total = Number(job?.progress_total || 0)
  if (total <= 0) return job?.status === 'completed' ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}

function getStatusColor(status) {
  const map = { running: 'arcoblue', pending: 'orange', completed: 'green', failed: 'red', cancelling: 'orange', cancelled: 'gray', SUCCEEDED: 'green', RUNNING: 'arcoblue', PENDING: 'orange', FAILED: 'red', STOPPED: 'gray' }
  return map[status] || 'gray'
}

function getStatusLabel(status) {
  const map = { running: '执行中', pending: '排队中', completed: '已完成', failed: '失败', cancelling: '取消中', cancelled: '已取消', SUCCEEDED: '已完成', RUNNING: '执行中', PENDING: '排队中', FAILED: '失败', STOPPED: '已停止' }
  return map[status] || status || '—'
}

export default function ComputeJobsOverviewPage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [rayJobs, setRayJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [wRes, rRes] = await Promise.all([
        api.getWorkbenchJobs(50).catch(() => ({ jobs: [] })),
        rayGet('/jobs').catch(() => ({ jobs: [] })),
      ])
      setJobs(Array.isArray(wRes?.jobs) ? wRes.jobs.map(normalizeJob) : [])
      setRayJobs(Array.isArray(rRes?.jobs) ? rRes.jobs : [])
    } catch (e) {
      console.error(getErrorMessage(e, '加载作业数据失败'))
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const activeJobs = useMemo(() => jobs.filter((j) => ['running', 'pending', 'cancelling'].includes(j.status)).length, [jobs])
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'completed').length, [jobs])
  const failedJobs = useMemo(() => jobs.filter((j) => j.status === 'failed').length, [jobs])
  const activeRayJobs = useMemo(() => rayJobs.filter((j) => j.status === 'RUNNING' || j.status === 'PENDING').length, [rayJobs])

  const summaryCards = [
    { label: '运行中实例', value: formatNumber(activeJobs + activeRayJobs), note: '工作流任务 + Ray 作业的合并视角。', color: '#165dff' },
    { label: '等待队列', value: formatNumber(jobs.filter((j) => j.status === 'pending').length), note: '排队中的批量任务。', color: '#ff7d00' },
    { label: '异常/失败', value: formatNumber(failedJobs + rayJobs.filter((j) => j.status === 'FAILED').length), note: '建议排查输入契约与资源配额。', color: '#f53f3f' },
    { label: '已完成', value: formatNumber(completedJobs + rayJobs.filter((j) => j.status === 'SUCCEEDED').length), note: '包含批量入湖与 Ray 计算任务。', color: '#00b42a' },
  ]

  const pipelineColumns = [
    { title: '任务 ID', width: 160, render: (_, job) => <Text code style={{ fontSize: 11 }}>{job.job_id}</Text> },
    { title: '来源类型', width: 120, render: (_, job) => job.payload?.source_type === 'sftp' ? 'SFTP' : 'S3 / SeaweedFS' },
    { title: '状态', width: 90, render: (_, job) => <Tag color={getStatusColor(job.status)} size="small">{getStatusLabel(job.status)}</Tag> },
    { title: '进度', width: 120, render: (_, job) => {
      const p = getJobProgress(job)
      return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1, height: 6, background: '#f2f3f5', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${p}%`, height: '100%', background: '#165dff', borderRadius: 3 }} /></div><Text style={{ fontSize: 11 }}>{p}%</Text></div>
    }},
    { title: '说明', ellipsis: true, render: (_, job) => <Text type="secondary" style={{ fontSize: 12 }}>{job.message || '--'}</Text> },
    { title: '更新时间', width: 160, render: (_, job) => <Text style={{ fontSize: 12 }}>{formatDateTime(job.updated_at)}</Text> },
  ]

  const rayColumns = [
    { title: 'Job ID', width: 160, render: (_, job) => <Text code style={{ fontSize: 11 }}>{job.job_id}</Text> },
    { title: '任务名称', width: 160, dataIndex: 'name' },
    { title: '入口命令', ellipsis: true, dataIndex: 'entrypoint' },
    { title: '状态', width: 100, render: (_, job) => <Tag color={getStatusColor(job.status)} size="small">{getStatusLabel(job.status)}</Tag> },
    { title: '配额', width: 140, render: (_, job) => `CPU ${job.num_cpus || 0} / GPU ${job.num_gpus || 0}` },
    { title: '开始时间', width: 160, render: (_, job) => <Text style={{ fontSize: 12 }}>{job.start_time ? formatDateTime(job.start_time) : '--'}</Text> },
  ]

  return (
    <div style={{ padding: 20, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>作业实例</Title>
          <Text type="secondary">按实例观察多模态处理链路，区分工作流执行态与底层 Ray 作业态。</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} loading={loading} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<IconPlayArrow />} onClick={() => navigate('/workflow')}>新建实例</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {summaryCards.map((item) => (
          <Col key={item.label} span={6}>
            <Card bodyStyle={{ padding: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: item.color, fontFeatureSettings: '"tnum"' }}>{item.value}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.note}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}><Spin size={32} /></div>
      ) : (
        <Card bodyStyle={{ padding: 0 }}>
          <Tabs defaultActiveTab="pipeline" style={{ padding: '0 20px' }}>
            <TabPane key="pipeline" title={<span><IconCalendarClock /> 工作流实例 ({formatNumber(jobs.length)})</span>}>
              {jobs.length ? (
                <Table rowKey="job_id" columns={pipelineColumns} data={jobs} pagination={{ pageSize: 10 }} size="small" />
              ) : (
                <div style={{ padding: 40 }}><Empty description="暂无工作流实例" /></div>
              )}
            </TabPane>
            <TabPane key="ray" title={<span><IconRobot /> Ray 作业 ({formatNumber(rayJobs.length)})</span>}>
              {rayJobs.length ? (
                <Table rowKey="job_id" columns={rayColumns} data={rayJobs} pagination={{ pageSize: 10 }} size="small" />
              ) : (
                <div style={{ padding: 40 }}><Empty description="暂无 Ray 作业" /></div>
              )}
            </TabPane>
          </Tabs>
        </Card>
      )}
    </div>
  )
}
