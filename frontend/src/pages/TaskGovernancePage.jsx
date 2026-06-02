import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  Grid,
  Input,
  Message,
  Progress,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { IconRefresh } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatDateTime, formatNumber } from '@/utils/format'

const { Row, Col } = Grid
const { Title, Text } = Typography
const Option = Select.Option

const jobStatusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '排队中' },
  { value: 'running', label: '执行中' },
  { value: 'cancelling', label: '取消中' },
  { value: 'cancelled', label: '已取消' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
]

const jobSortOptions = [
  { value: 'updated_desc', label: '按更新时间倒序' },
  { value: 'updated_asc', label: '按更新时间正序' },
  { value: 'created_desc', label: '按创建时间倒序' },
  { value: 'created_asc', label: '按创建时间正序' },
  { value: 'status', label: '按状态排序' },
  { value: 'progress_desc', label: '按进度倒序' },
]

function normalizeJob(job) {
  const s = job && typeof job === 'object' ? job : {}
  return {
    ...s,
    payload: s.payload && typeof s.payload === 'object' ? s.payload : {},
    result: s.result && typeof s.result === 'object' ? s.result : {},
    logs: typeof s.logs === 'string' ? s.logs : '',
    message: typeof s.message === 'string' ? s.message : '',
  }
}

function getJobProgress(job) {
  const current = Number(job?.progress_current || 0)
  const total = Number(job?.progress_total || 0)
  if (total <= 0) return job?.status === 'completed' ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}

function getSortableTime(value) {
  const t = new Date(value || '').getTime()
  return Number.isNaN(t) ? 0 : t
}

function getStatusRank(status) {
  const map = { running: 1, cancelling: 2, pending: 3, failed: 4, cancelled: 5, completed: 6 }
  return map[status] ?? 9
}

function sortJobs(items, sortValue) {
  const next = [...items]
  switch (sortValue) {
    case 'updated_asc': return next.sort((a, b) => getSortableTime(a.updated_at) - getSortableTime(b.updated_at))
    case 'created_desc': return next.sort((a, b) => getSortableTime(b.created_at) - getSortableTime(a.created_at))
    case 'created_asc': return next.sort((a, b) => getSortableTime(a.created_at) - getSortableTime(b.created_at))
    case 'status': return next.sort((a, b) => getStatusRank(a.status) - getStatusRank(b.status) || getSortableTime(b.updated_at) - getSortableTime(a.updated_at))
    case 'progress_desc': return next.sort((a, b) => getJobProgress(b) - getJobProgress(a) || getSortableTime(b.updated_at) - getSortableTime(a.updated_at))
    default: return next.sort((a, b) => getSortableTime(b.updated_at) - getSortableTime(a.updated_at))
  }
}

function getStatusTag(status) {
  const map = {
    completed: { color: 'green', text: '已完成' },
    failed: { color: 'red', text: '失败' },
    running: { color: 'blue', text: '执行中' },
    cancelling: { color: 'orange', text: '取消中' },
    cancelled: { color: 'gray', text: '已取消' },
    pending: { color: 'gray', text: '排队中' },
  }
  return map[status] || { color: 'gray', text: status || '未知' }
}

function getJobResultSummary(job) {
  const r = job?.result || {}
  if (!Object.keys(r).length) return '暂无任务结果摘要。'
  return `成功 ${r.imported_files || 0} 个文件，跳过 ${r.skipped_files || 0} 个，失败 ${r.error_files || 0} 个，新增片段 ${r.imported_items || 0} 条。`
}

function getJobCompactStats(job) {
  const r = job?.result || {}
  if (!Object.keys(r).length) return '暂无结果统计'
  const sel = Number(r.selected_requested || 0)
  const selM = Number(r.selected_matched || 0)
  const parts = []
  if (sel > 0) parts.push(`勾选 ${selM}/${sel}`)
  parts.push(`成功 ${r.imported_files || 0}`)
  parts.push(`跳过 ${r.skipped_files || 0}`)
  parts.push(`失败 ${r.error_files || 0}`)
  return parts.join(' · ')
}

export default function TaskGovernancePage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [jobDetail, setJobDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState('updated_desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const activeJobs = useMemo(() => jobs.filter((j) => ['pending', 'running', 'cancelling'].includes(j.status)).length, [jobs])
  const completedCount = useMemo(() => jobs.filter((j) => j.status === 'completed').length, [jobs])
  const failedCount = useMemo(() => jobs.filter((j) => j.status === 'failed').length, [jobs])

  const filteredJobs = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let matched = statusFilter === 'all' ? jobs : jobs.filter((j) => j.status === statusFilter)
    if (kw) {
      matched = matched.filter((j) => {
        const hay = [j.job_id, j.message, j.status, j.payload?.source_type, j.payload?.bucket_name, j.payload?.prefix, j.payload?.sftp_host, j.payload?.sftp_path].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(kw)
      })
    }
    return sortJobs(matched, sort)
  }, [keyword, sort, statusFilter, jobs])

  const pageCount = useMemo(() => Math.max(1, Math.ceil(filteredJobs.length / Math.max(1, pageSize))), [filteredJobs.length, pageSize])

  const pagedJobs = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), pageCount)
    const start = (safePage - 1) * pageSize
    return filteredJobs.slice(start, start + pageSize)
  }, [filteredJobs, page, pageCount, pageSize])

  const loadJobs = async () => {
    const res = await api.getWorkbenchJobs(50)
    const next = Array.isArray(res?.jobs) ? res.jobs.map(normalizeJob) : []
    setJobs(next)
    setSelectedJobId((c) => c || next[0]?.job_id || '')
    return next
  }

  const loadJobDetail = async (jobId, silent = false) => {
    if (!jobId) { setJobDetail(null); return null }
    try {
      const res = await api.getWorkbenchJob(jobId)
      const detail = normalizeJob(res?.data)
      setJobDetail(detail)
      return detail
    } catch (e) {
      if (!silent) Message.error(getErrorMessage(e, '加载任务详情失败'))
      return null
    }
  }

  const refreshAll = async (silent = false) => {
    if (!silent) setLoading(true)
    setRefreshing(true)
    try { await loadJobs() }
    catch (e) { Message.error(getErrorMessage(e, '加载任务治理数据失败')) }
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { refreshAll() }, [])
  useEffect(() => { if (selectedJobId) loadJobDetail(selectedJobId, true); else setJobDetail(null) }, [selectedJobId])

  useEffect(() => {
    const shouldPoll = activeJobs > 0 || ['pending', 'running', 'cancelling'].includes(jobDetail?.status)
    if (!shouldPoll) return
    const timer = setInterval(async () => {
      try { await Promise.all([loadJobs(), selectedJobId ? loadJobDetail(selectedJobId, true) : Promise.resolve()]) } catch {}
    }, 3000)
    return () => clearInterval(timer)
  }, [activeJobs, jobDetail?.status, selectedJobId])

  useEffect(() => { setPage((c) => Math.min(Math.max(1, c), pageCount)) }, [pageCount])
  useEffect(() => { setPage(1) }, [statusFilter, keyword, sort, pageSize])

  const handleCancelJob = async (jobId) => {
    if (!jobId) return
    try {
      const res = await api.cancelWorkbenchJob(jobId)
      Message.success(res?.message || '任务取消请求已提交')
      await loadJobs()
      if (selectedJobId === jobId) await loadJobDetail(jobId, true)
    } catch (e) { Message.error(getErrorMessage(e, '取消任务失败')) }
  }

  const handleReuseJobConfig = (job) => {
    if (!job?.payload) return
    window.sessionStorage.setItem('workbench_reuse_payload', JSON.stringify(job.payload))
    window.sessionStorage.setItem('workbench_reuse_job_id', String(job.job_id || ''))
    navigate('/ingestion/source')
  }

  const handleExportLogs = (job) => {
    const content = String(job?.logs || '').trim()
    if (!content) { Message.warning('当前任务暂无可导出的日志'); return }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `${job.job_id || 'job'}-logs.txt`
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    URL.revokeObjectURL(url)
    Message.success('任务日志已导出')
  }

  const handleCopyLogs = async (logs) => {
    const content = String(logs || '').trim()
    if (!content) { Message.warning('当前任务暂无可复制日志'); return }
    try { await navigator.clipboard.writeText(content); Message.success('已复制到剪贴板') }
    catch { Message.error('复制失败') }
  }

  if (loading) return <div style={{ padding: 80, textAlign: 'center' }}><Spin tip="任务治理中心加载中..." /></div>

  const statusTag = (status) => {
    const { color, text } = getStatusTag(status)
    return <Tag color={color} size="small">{text}</Tag>
  }

  const columns = [
    {
      title: '任务 ID', dataIndex: 'job_id', width: 160,
      render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v) => statusTag(v),
    },
    {
      title: '进度', width: 140,
      render: (_, job) => {
        const p = getJobProgress(job)
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Progress percent={p} showText={false} style={{ flex: 1 }} size="small" />
            <Text style={{ fontSize: 12, fontFeatureSettings: '"tnum"', minWidth: 32 }}>{p}%</Text>
          </div>
        )
      },
    },
    {
      title: '说明', dataIndex: 'message',
      render: (v, job) => (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>{v || '--'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{getJobCompactStats(job)}</Text>
        </div>
      ),
    },
    {
      title: '更新时间', dataIndex: 'updated_at', width: 160,
      render: (v) => <Text style={{ fontSize: 12 }}>{formatDateTime(v)}</Text>,
    },
    {
      title: '操作', width: 220,
      render: (_, job) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="mini" onClick={() => setSelectedJobId(job.job_id)}>详情</Button>
          <Button size="mini" onClick={() => handleReuseJobConfig(job)}>回填配置</Button>
          {['pending', 'running', 'cancelling'].includes(job.status) && (
            <Button size="mini" status="danger" disabled={job.status === 'cancelling'} onClick={() => handleCancelJob(job.job_id)}>
              {job.status === 'cancelling' ? '取消中' : '停止'}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: 20, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      {/* 页头 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>任务治理中心</Title>
          <Text type="secondary">批量导入任务、执行进度、日志和配置回填的统一控制面。</Text>
        </div>
        <Button icon={<IconRefresh />} loading={refreshing} onClick={() => refreshAll(true)}>刷新任务</Button>
      </div>

      {/* KPI */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card bodyStyle={{ padding: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>活动任务</Text>
            <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 4px' }}>{formatNumber(activeJobs)}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>排队中、执行中与取消中</Text>
          </Card>
        </Col>
        <Col span={8}>
          <Card bodyStyle={{ padding: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>已完成</Text>
            <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 4px' }}>{formatNumber(completedCount)}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>最近窗口内已完成任务</Text>
          </Card>
        </Col>
        <Col span={8}>
          <Card bodyStyle={{ padding: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>失败任务</Text>
            <div style={{ fontSize: 24, fontWeight: 700, margin: '6px 0 4px', color: failedCount > 0 ? '#F53F3F' : undefined }}>{formatNumber(failedCount)}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>建议优先排障</Text>
          </Card>
        </Col>
      </Row>

      {/* 任务列表 */}
      <Row gutter={16}>
        <Col span={16}>
          <Card title="任务列表">
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>状态</Text>
                <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 130 }} size="small">
                  {jobStatusOptions.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>排序</Text>
                <Select value={sort} onChange={setSort} style={{ width: 160 }} size="small">
                  {jobSortOptions.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>搜索</Text>
                <Input value={keyword} onChange={setKeyword} size="small" placeholder="搜索任务 ID、状态、Bucket、Host" />
              </div>
            </div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              共 {formatNumber(jobs.length)} 条，当前显示 {formatNumber(filteredJobs.length)} 条
            </Text>
            {filteredJobs.length ? (
              <>
                <Table columns={columns} data={pagedJobs} rowKey="job_id" pagination={false} size="small" scroll={{ x: 800 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>第 {page} / {pageCount} 页</Text>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="mini" disabled={page <= 1} onClick={() => setPage((c) => Math.max(1, c - 1))}>上一页</Button>
                    <Button size="mini" disabled={page >= pageCount} onClick={() => setPage((c) => Math.min(pageCount, c + 1))}>下一页</Button>
                  </div>
                </div>
              </>
            ) : (
              <Empty description="当前筛选下暂无任务" />
            )}
          </Card>
        </Col>

        {/* 任务详情 */}
        <Col span={8}>
          <Card title="任务详情">
            {jobDetail ? (
              <>
                <Row gutter={[12, 12]}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>任务状态</Text>
                    <div style={{ marginTop: 4 }}>{statusTag(jobDetail.status)}</div>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>来源类型</Text>
                    <div style={{ marginTop: 4 }}>{jobDetail.payload?.source_type === 'sftp' ? 'SFTP' : 'S3 / SeaweedFS'}</div>
                  </Col>
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>结果摘要</Text>
                    <div style={{ marginTop: 4 }}>{getJobResultSummary(jobDetail)}</div>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>来源 Bucket/Host</Text>
                    <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>
                      {jobDetail.payload?.source_type === 'sftp' ? jobDetail.payload?.sftp_host || '--' : jobDetail.payload?.bucket_name || '--'}
                    </div>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>路径/Prefix</Text>
                    <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>
                      {jobDetail.payload?.source_type === 'sftp' ? jobDetail.payload?.sftp_path || '/' : jobDetail.payload?.prefix || '/'}
                    </div>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>更新时间</Text>
                    <div style={{ marginTop: 4, fontSize: 12 }}>{formatDateTime(jobDetail.updated_at)}</div>
                  </Col>
                </Row>

                <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
                  <Button size="small" onClick={() => handleCopyLogs(jobDetail.logs)}>复制日志</Button>
                  <Button size="small" onClick={() => handleExportLogs(jobDetail)}>导出日志</Button>
                  <Button size="small" onClick={() => handleReuseJobConfig(jobDetail)}>回填配置</Button>
                  {['pending', 'running', 'cancelling'].includes(jobDetail.status) && (
                    <Button size="small" status="danger" disabled={jobDetail.status === 'cancelling'} onClick={() => handleCancelJob(jobDetail.job_id)}>
                      {jobDetail.status === 'cancelling' ? '取消中' : '停止任务'}
                    </Button>
                  )}
                </div>

                <div style={{
                  marginTop: 12, padding: 14, borderRadius: 8,
                  background: '#1d2129', color: '#f3ebde',
                  fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
                  maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap',
                }}>
                  {jobDetail.logs || '暂无任务日志。'}
                </div>
              </>
            ) : (
              <Empty description="请选择一条任务查看详情" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
