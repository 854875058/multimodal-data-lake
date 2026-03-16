import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import { formatDateTime, formatNumber } from '@/utils/format'

const jobStatusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '排队中' },
  { value: 'running', label: '执行中' },
  { value: 'cancelling', label: '取消中' },
  { value: 'cancelled', label: '已取消' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' }
]

const jobSortOptions = [
  { value: 'updated_desc', label: '按更新时间倒序' },
  { value: 'updated_asc', label: '按更新时间正序' },
  { value: 'created_desc', label: '按创建时间倒序' },
  { value: 'created_asc', label: '按创建时间正序' },
  { value: 'status', label: '按状态排序' },
  { value: 'progress_desc', label: '按进度倒序' }
]

const pageSizeOptions = [10, 20, 50]
const agentTaskStatusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待规划' },
  { value: 'in_progress', label: '规划中' },
  { value: 'ready', label: '待执行' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' }
]

function normalizeJob(job) {
  const source = job && typeof job === 'object' ? job : {}
  return {
    ...source,
    payload: source.payload && typeof source.payload === 'object' ? source.payload : {},
    result: source.result && typeof source.result === 'object' ? source.result : {},
    logs: typeof source.logs === 'string' ? source.logs : '',
    message: typeof source.message === 'string' ? source.message : ''
  }
}

function normalizeJobs(items) {
  return Array.isArray(items) ? items.map(normalizeJob) : []
}

function getSourceTypeText(value) {
  return value === 'sftp' ? 'SFTP' : 'S3 / SeaweedFS'
}

function getSourcePrimaryLabel(sourceType) {
  return sourceType === 'sftp' ? '来源主机' : '来源 Bucket'
}

function getSourcePrimaryValue(payload = {}) {
  return payload?.source_type === 'sftp' ? payload?.sftp_host || '--' : payload?.bucket_name || '--'
}

function getSourceSecondaryLabel(sourceType) {
  return sourceType === 'sftp' ? '远程路径' : '来源 Prefix'
}

function getSourceSecondaryValue(payload = {}) {
  return payload?.source_type === 'sftp' ? payload?.sftp_path || '/' : payload?.prefix || '/'
}

function getJobProgress(job) {
  const current = Number(job?.progress_current || 0)
  const total = Number(job?.progress_total || 0)
  if (total <= 0) {
    return job?.status === 'completed' ? 100 : 0
  }
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}

function getSortableTime(value) {
  const timestamp = new Date(value || '').getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getStatusRank(status) {
  switch (status) {
    case 'running':
      return 1
    case 'cancelling':
      return 2
    case 'pending':
      return 3
    case 'failed':
      return 4
    case 'cancelled':
      return 5
    case 'completed':
      return 6
    default:
      return 9
  }
}

function sortJobs(items, sortValue) {
  const nextItems = [...items]
  switch (sortValue) {
    case 'updated_asc':
      return nextItems.sort((left, right) => getSortableTime(left.updated_at) - getSortableTime(right.updated_at))
    case 'created_desc':
      return nextItems.sort((left, right) => getSortableTime(right.created_at) - getSortableTime(left.created_at))
    case 'created_asc':
      return nextItems.sort((left, right) => getSortableTime(left.created_at) - getSortableTime(right.created_at))
    case 'status':
      return nextItems.sort((left, right) => getStatusRank(left.status) - getStatusRank(right.status) || getSortableTime(right.updated_at) - getSortableTime(left.updated_at))
    case 'progress_desc':
      return nextItems.sort((left, right) => getJobProgress(right) - getJobProgress(left) || getSortableTime(right.updated_at) - getSortableTime(left.updated_at))
    case 'updated_desc':
    default:
      return nextItems.sort((left, right) => getSortableTime(right.updated_at) - getSortableTime(left.updated_at))
  }
}

function getJobStatusText(status) {
  switch (status) {
    case 'pending':
      return '排队中'
    case 'running':
      return '执行中'
    case 'cancelling':
      return '取消中'
    case 'cancelled':
      return '已取消'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return status || '未知'
  }
}

function getJobBadgeClass(status) {
  switch (status) {
    case 'completed':
      return 'is-success'
    case 'failed':
      return 'is-danger'
    case 'running':
    case 'cancelling':
      return 'is-warning'
    case 'cancelled':
      return 'is-muted'
    default:
      return 'is-muted'
  }
}

function normalizeAgentTask(task) {
  const source = task && typeof task === 'object' ? task : {}
  const planPayload = source.plan?.plan && typeof source.plan.plan === 'object'
    ? source.plan.plan
    : (source.plan && typeof source.plan === 'object' ? source.plan : {})
  return {
    ...source,
    details: source.details && typeof source.details === 'object' ? source.details : {},
    plan: planPayload,
  }
}

function normalizeAgentTasks(items) {
  return Array.isArray(items) ? items.map(normalizeAgentTask) : []
}

function getAgentTaskStatusText(status) {
  switch (status) {
    case 'pending':
      return '待规划'
    case 'in_progress':
      return '规划中'
    case 'ready':
      return '待执行'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    default:
      return status || '未知'
  }
}

function getAgentTaskBadgeClass(status) {
  switch (status) {
    case 'completed':
      return 'is-success'
    case 'ready':
      return 'is-warning'
    case 'in_progress':
      return 'is-warning'
    case 'failed':
      return 'is-danger'
    default:
      return 'is-muted'
  }
}

function getAgentModeText(mode) {
  switch (mode) {
    case 'execution':
      return '执行模式'
    case 'planning_only':
      return '规划模式'
    default:
      return mode || '未知'
  }
}

function getJobResultSummary(job) {
  const result = job?.result || {}
  if (!Object.keys(result).length) {
    return '暂无任务结果摘要。'
  }

  const importedFiles = Number(result.imported_files || 0)
  const skippedFiles = Number(result.skipped_files || 0)
  const errorFiles = Number(result.error_files || 0)
  const importedItems = Number(result.imported_items || 0)
  const builtCount = Array.isArray(result.built_indices) ? result.built_indices.length : 0

  return `成功 ${importedFiles} 个文件，跳过 ${skippedFiles} 个，失败 ${errorFiles} 个，新增片段 ${importedItems} 条，索引结果 ${builtCount} 项。`
}

function getJobCompactStats(job) {
  const result = job?.result || {}
  if (!Object.keys(result).length) {
    return '暂无结果统计'
  }

  const importedFiles = Number(result.imported_files || 0)
  const skippedFiles = Number(result.skipped_files || 0)
  const errorFiles = Number(result.error_files || 0)
  const selectedRequested = Number(result.selected_requested || 0)
  const selectedMatched = Number(result.selected_matched || 0)
  const selectionText = selectedRequested > 0 ? `勾选 ${selectedMatched}/${selectedRequested}` : null
  return [selectionText, `成功 ${importedFiles}`, `跳过 ${skippedFiles}`, `失败 ${errorFiles}`].filter(Boolean).join(' · ')
}

export default function TaskGovernancePage() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [jobDetail, setJobDetail] = useState(null)
  const [agentStatus, setAgentStatus] = useState(null)
  const [agentTasks, setAgentTasks] = useState([])
  const [selectedAgentTaskId, setSelectedAgentTaskId] = useState('')
  const [agentTaskDetail, setAgentTaskDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [jobStatusFilter, setJobStatusFilter] = useState('all')
  const [jobKeyword, setJobKeyword] = useState('')
  const [jobSort, setJobSort] = useState('updated_desc')
  const [agentTaskFilter, setAgentTaskFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [banner, setBanner] = useState({ type: '', message: '' })
  const [error, setError] = useState('')

  const activeJobs = useMemo(
    () => jobs.filter((job) => ['pending', 'running', 'cancelling'].includes(job.status)).length,
    [jobs]
  )

  const filteredJobs = useMemo(() => {
    const keyword = jobKeyword.trim().toLowerCase()
    const statusMatched = jobStatusFilter === 'all'
      ? jobs
      : jobs.filter((job) => job.status === jobStatusFilter)

    const keywordMatched = keyword
      ? statusMatched.filter((job) => {
          const haystack = [
            job.job_id,
            job.message,
            job.status,
            job.payload?.source_type,
            job.payload?.bucket_name,
            job.payload?.prefix,
            job.payload?.sftp_host,
            job.payload?.sftp_path
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return haystack.includes(keyword)
        })
      : statusMatched

    return sortJobs(keywordMatched, jobSort)
  }, [jobKeyword, jobSort, jobStatusFilter, jobs])

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(filteredJobs.length / Math.max(1, pageSize))),
    [filteredJobs.length, pageSize]
  )

  const pagedJobs = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), pageCount)
    const startIndex = (safePage - 1) * pageSize
    return filteredJobs.slice(startIndex, startIndex + pageSize)
  }, [filteredJobs, page, pageCount, pageSize])

  const completedCount = useMemo(
    () => jobs.filter((job) => job.status === 'completed').length,
    [jobs]
  )

  const failedCount = useMemo(
    () => jobs.filter((job) => job.status === 'failed').length,
    [jobs]
  )

  const filteredAgentTasks = useMemo(() => {
    const source = agentTaskFilter === 'all'
      ? agentTasks
      : agentTasks.filter((task) => task.status === agentTaskFilter)
    return source
      .slice()
      .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0) || Number(left.id || 0) - Number(right.id || 0))
  }, [agentTaskFilter, agentTasks])

  const agentCompletedCount = useMemo(
    () => agentTasks.filter((task) => task.status === 'completed').length,
    [agentTasks]
  )

  const agentReadyCount = useMemo(
    () => agentTasks.filter((task) => task.status === 'ready').length,
    [agentTasks]
  )

  const agentFailedCount = useMemo(
    () => agentTasks.filter((task) => task.status === 'failed').length,
    [agentTasks]
  )

  const loadJobs = async () => {
    const response = await api.getWorkbenchJobs(50)
    const nextJobs = normalizeJobs(response?.jobs)
    setJobs(nextJobs)
    setSelectedJobId((current) => current || nextJobs[0]?.job_id || '')
    return nextJobs
  }

  const loadJobDetail = async (jobId, silent = false) => {
    if (!jobId) {
      setJobDetail(null)
      return null
    }

    try {
      const response = await api.getWorkbenchJob(jobId)
      const nextDetail = normalizeJob(response?.data)
      setJobDetail(nextDetail)
      return nextDetail
    } catch (requestError) {
      if (!silent) {
        setError(getErrorMessage(requestError, '加载任务详情失败。'))
      }
      return null
    }
  }

  const loadAgentData = async () => {
    const [statusResponse, tasksResponse] = await Promise.all([
      api.getAgentStatus(),
      api.getAgentTasks()
    ])

    const nextStatus = statusResponse?.data || null
    const nextTasks = normalizeAgentTasks(tasksResponse?.tasks)
    setAgentStatus(nextStatus)
    setAgentTasks(nextTasks)
    setSelectedAgentTaskId((current) => current || String(nextTasks[0]?.id || ''))
    return { nextStatus, nextTasks }
  }

  const loadAgentTaskDetail = async (taskId) => {
    if (!taskId) {
      setAgentTaskDetail(null)
      return null
    }

    try {
      const response = await api.getAgentTask(taskId)
      const nextDetail = normalizeAgentTask(response?.data)
      setAgentTaskDetail(nextDetail)
      return nextDetail
    } catch (requestError) {
      setError(getErrorMessage(requestError, '加载 Agent 任务详情失败。'))
      return null
    }
  }

  const refreshAll = async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
      setError('')
    }

    try {
      await Promise.all([loadJobs(), loadAgentData()])
    } catch (requestError) {
      setError(getErrorMessage(requestError, '加载任务治理数据失败。'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refreshAll(false)
  }, [])

  useEffect(() => {
    if (selectedJobId) {
      loadJobDetail(selectedJobId, true)
    } else {
      setJobDetail(null)
    }
  }, [selectedJobId])

  useEffect(() => {
    if (selectedAgentTaskId) {
      loadAgentTaskDetail(selectedAgentTaskId)
    } else {
      setAgentTaskDetail(null)
    }
  }, [selectedAgentTaskId])

  useEffect(() => {
    const shouldPoll = activeJobs > 0
      || ['pending', 'running', 'cancelling'].includes(jobDetail?.status)
      || ['pending', 'in_progress', 'ready'].includes(agentTaskDetail?.status)
    if (!shouldPoll) {
      return undefined
    }

    const timer = window.setInterval(async () => {
      try {
        await Promise.all([
          loadJobs(),
          loadAgentData(),
          selectedJobId ? loadJobDetail(selectedJobId, true) : Promise.resolve(null),
          selectedAgentTaskId ? loadAgentTaskDetail(selectedAgentTaskId) : Promise.resolve(null)
        ])
      } catch {
        // polling errors stay silent
      }
    }, 3000)

    return () => window.clearInterval(timer)
  }, [activeJobs, jobDetail?.status, selectedJobId, selectedAgentTaskId, agentTaskDetail?.status])

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), pageCount))
  }, [pageCount])

  useEffect(() => {
    setPage(1)
  }, [jobStatusFilter, jobKeyword, jobSort, pageSize])

  const handleCancelJob = async (jobId) => {
    if (!jobId) {
      return
    }

    try {
      const response = await api.cancelWorkbenchJob(jobId)
      setBanner({ type: 'success', message: response?.message || '任务取消请求已提交。' })
      await loadJobs()
      if (selectedJobId === jobId) {
        await loadJobDetail(jobId, true)
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, '取消任务失败。'))
    }
  }

  const handleReuseJobConfig = (job) => {
    if (!job?.payload || typeof job.payload !== 'object') {
      return
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('workbench_reuse_payload', JSON.stringify(job.payload))
      window.sessionStorage.setItem('workbench_reuse_job_id', String(job.job_id || ''))
    }
    navigate('/workbench')
  }

  const handleExportLogs = (job) => {
    const content = String(job?.logs || '').trim()
    if (!content) {
      setBanner({ type: 'warning', message: '当前任务暂无可导出的日志。' })
      return
    }

    const jobId = job?.job_id || 'job'
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${jobId}-logs.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    setBanner({ type: 'success', message: '任务日志已导出。' })
  }

  const handleCopyLogs = async (logs) => {
    const content = String(logs || '').trim()
    if (!content) {
      setBanner({ type: 'warning', message: '当前任务暂无可复制日志。' })
      return
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content)
      }
      setBanner({ type: 'success', message: '任务日志已复制到剪贴板。' })
    } catch (copyError) {
      setError(getErrorMessage(copyError, '复制任务日志失败。'))
    }
  }

  if (loading) {
    return <div className="loading-state">任务治理中心加载中...</div>
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">任务治理中心</h1>
          <p className="page-subtitle">把批量导入任务、执行进度、日志和配置回填从 AI 工作台里独立出来，形成平台化运行控制面。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={() => refreshAll(true)} disabled={refreshing}>
            {refreshing ? '刷新中...' : '刷新任务'}
          </button>
        </div>
      </div>

      {banner.message ? <div className={`${banner.type}-banner`}>{banner.message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="governance-summary-grid">
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">活动任务</div>
          <div className="kpi-value">{formatNumber(activeJobs)}</div>
          <div className="kpi-sub">排队中、执行中与取消中的任务</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">已完成</div>
          <div className="kpi-value">{formatNumber(completedCount)}</div>
          <div className="kpi-sub">最近窗口内已完成任务</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">失败任务</div>
          <div className="kpi-value">{formatNumber(failedCount)}</div>
          <div className="kpi-sub">建议优先排障的任务数量</div>
        </div>
      </div>

      <div className="governance-summary-grid">
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">Agent 模式</div>
          <div className="kpi-value">{getAgentModeText(agentStatus?.mode)}</div>
          <div className="kpi-sub">{agentStatus?.mode_reason || '暂无 Agent 运行说明。'}</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">待执行任务</div>
          <div className="kpi-value">{formatNumber(agentReadyCount)}</div>
          <div className="kpi-sub">Agent 已规划完成，等待执行的任务</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">已完成治理</div>
          <div className="kpi-value">{formatNumber(agentCompletedCount)}</div>
          <div className="kpi-sub">Agent 已完成的仓库整治任务</div>
        </div>
      </div>

      <div className="governance-shell">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>Agent 执行队列</h2>
              <p>展示 Agent Team 的治理任务、执行状态和当前计划文件。</p>
            </div>
          </div>

          <div className="toolbar workbench-table-toolbar">
            <div className="toolbar-group">
              <div className="field compact-field">
                <label htmlFor="agent_task_filter">Agent 状态</label>
                <select
                  id="agent_task_filter"
                  className="select"
                  value={agentTaskFilter}
                  onChange={(event) => setAgentTaskFilter(event.target.value)}
                >
                  {agentTaskStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="workbench-help">
              Agent 任务 {formatNumber(agentTasks.length)} 条，失败 {formatNumber(agentFailedCount)} 条。
            </div>
          </div>

          {filteredAgentTasks.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>标题</th>
                    <th>状态</th>
                    <th>优先级</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgentTasks.map((task) => (
                    <tr key={task.id} className={String(task.id) === selectedAgentTaskId ? 'table-row-active' : ''}>
                      <td className="mono">{task.id}</td>
                      <td>
                        <div className="table-primary">{task.title}</div>
                        <div className="table-secondary">{task.description}</div>
                      </td>
                      <td>
                        <span className={`badge ${getAgentTaskBadgeClass(task.status)}`}>{getAgentTaskStatusText(task.status)}</span>
                      </td>
                      <td>{formatNumber(task.priority || 0)}</td>
                      <td>{formatDateTime(task.updated_at)}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="button button-small button-secondary" onClick={() => setSelectedAgentTaskId(String(task.id))}>
                            查看计划
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state small">当前筛选下暂无 Agent 任务。</div>
          )}
        </section>

        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>Agent 任务详情</h2>
              <p>查看 Agent 任务的计划摘要、目标文件、阻塞项和下一步动作。</p>
            </div>
          </div>

          {agentTaskDetail ? (
            <>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="kpi-label">任务状态</div>
                  <div className="detail-value">
                    <span className={`badge ${getAgentTaskBadgeClass(agentTaskDetail.status)}`}>{getAgentTaskStatusText(agentTaskDetail.status)}</span>
                  </div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">优先级</div>
                  <div className="detail-value">{formatNumber(agentTaskDetail.priority || 0)}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">计划摘要</div>
                  <div className="detail-value">{agentTaskDetail.plan?.summary || agentTaskDetail.details?.plan_summary || agentTaskDetail.description}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">计划文件</div>
                  <div className="detail-value mono">{agentTaskDetail.details?.plan_file || '--'}</div>
                </div>
              </div>

              <div className="detail-item">
                <div className="kpi-label">目标文件</div>
                  <div className="detail-value">
                  {(agentTaskDetail.details?.target_files || agentTaskDetail.plan?.target_files || []).length
                    ? (agentTaskDetail.details?.target_files || agentTaskDetail.plan?.target_files).map((item) => <div key={item} className="mono">{item}</div>)
                    : '暂无目标文件。'}
                </div>
              </div>

              <div className="detail-item">
                <div className="kpi-label">下一步动作</div>
                  <div className="detail-value">
                  {(agentTaskDetail.details?.next_actions || agentTaskDetail.plan?.next_actions || []).length
                    ? (agentTaskDetail.details?.next_actions || agentTaskDetail.plan?.next_actions).map((item) => <div key={item}>{item}</div>)
                    : '暂无下一步动作。'}
                </div>
              </div>

              <div className="detail-item">
                <div className="kpi-label">验证步骤</div>
                  <div className="detail-value">
                  {(agentTaskDetail.details?.validation_steps || agentTaskDetail.plan?.validation_steps || []).length
                    ? (agentTaskDetail.details?.validation_steps || agentTaskDetail.plan?.validation_steps).map((item) => <div key={item}>{item}</div>)
                    : '暂无验证步骤。'}
                </div>
              </div>

              <div className="detail-item">
                <div className="kpi-label">阻塞项</div>
                  <div className="detail-value">
                  {(agentTaskDetail.details?.blockers || agentTaskDetail.plan?.blockers || []).length
                    ? (agentTaskDetail.details?.blockers || agentTaskDetail.plan?.blockers).map((item) => <div key={item}>{item}</div>)
                    : '暂无阻塞项。'}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state small">请选择一条 Agent 任务查看详情。</div>
          )}
        </section>
      </div>

      <div className="governance-shell">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>任务列表</h2>
              <p>展示最近批量接入任务，可按状态筛选并快速回填配置。</p>
            </div>
          </div>

          <div className="toolbar workbench-table-toolbar">
            <div className="toolbar-group">
              <div className="field compact-field">
                <label htmlFor="job_status_filter">任务状态</label>
                <select
                  id="job_status_filter"
                  className="select"
                  value={jobStatusFilter}
                  onChange={(event) => setJobStatusFilter(event.target.value)}
                >
                  {jobStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field compact-field">
                <label htmlFor="job_sort">排序方式</label>
                <select
                  id="job_sort"
                  className="select"
                  value={jobSort}
                  onChange={(event) => setJobSort(event.target.value)}
                >
                  {jobSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field compact-field">
                <label htmlFor="job_page_size">每页条数</label>
                <select
                  id="job_page_size"
                  className="select"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field grow-field">
                <label htmlFor="job_keyword">任务搜索</label>
                <input
                  id="job_keyword"
                  className="input"
                  value={jobKeyword}
                  onChange={(event) => setJobKeyword(event.target.value)}
                  placeholder="搜索任务 ID、状态、Bucket、Prefix、Host 或 Path"
                />
              </div>
            </div>
            <div className="workbench-help">共 {formatNumber(jobs.length)} 条任务，当前显示 {formatNumber(filteredJobs.length)} 条。</div>
          </div>

          {filteredJobs.length ? (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>任务 ID</th>
                      <th>状态</th>
                      <th>进度</th>
                      <th>说明</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedJobs.map((job) => {
                      const progress = getJobProgress(job)
                      return (
                        <tr key={job.job_id} className={selectedJobId === job.job_id ? 'table-row-active' : ''}>
                          <td className="mono">{job.job_id}</td>
                          <td>
                            <span className={`badge ${getJobBadgeClass(job.status)}`}>{getJobStatusText(job.status)}</span>
                          </td>
                          <td>
                            <div className="job-progress-row">
                              <div className="job-progress-track">
                                <div className="job-progress-value" style={{ width: `${progress}%` }} />
                              </div>
                              <span>{progress}%</span>
                            </div>
                          </td>
                          <td>
                            <div className="table-secondary">{job.message || '--'}</div>
                            <div className="table-secondary">{getJobCompactStats(job)}</div>
                          </td>
                          <td>{formatDateTime(job.updated_at)}</td>
                          <td>
                            <div className="table-actions">
                              <button type="button" className="button button-small button-secondary" onClick={() => setSelectedJobId(job.job_id)}>
                                查看详情
                              </button>
                              <button type="button" className="button button-small button-ghost" onClick={() => handleReuseJobConfig(job)}>
                                回填到工作台
                              </button>
                              {['pending', 'running', 'cancelling'].includes(job.status) ? (
                                <button
                                  type="button"
                                  className="button button-small button-danger"
                                  onClick={() => handleCancelJob(job.job_id)}
                                  disabled={job.status === 'cancelling'}
                                >
                                  {job.status === 'cancelling' ? '取消中...' : '停止任务'}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <span className="pagination-meta">第 {formatNumber(page)} / {formatNumber(pageCount)} 页，共 {formatNumber(filteredJobs.length)} 条</span>
                <div className="toolbar-group">
                  <button type="button" className="button button-small button-secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                    上一页
                  </button>
                  <button type="button" className="button button-small button-secondary" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>
                    下一页
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state small">当前筛选下暂无任务。</div>
          )}
        </section>

        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>任务详情</h2>
              <p>查看当前任务结果摘要、来源参数和完整处理日志。</p>
            </div>
          </div>

          {jobDetail ? (
            <>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="kpi-label">任务状态</div>
                  <div className="detail-value">
                    <span className={`badge ${getJobBadgeClass(jobDetail.status)}`}>{getJobStatusText(jobDetail.status)}</span>
                  </div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">结果摘要</div>
                  <div className="detail-value">{getJobResultSummary(jobDetail)}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">来源类型</div>
                  <div className="detail-value">{getSourceTypeText(jobDetail.payload?.source_type)}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">{getSourcePrimaryLabel(jobDetail.payload?.source_type)}</div>
                  <div className="detail-value mono">{getSourcePrimaryValue(jobDetail.payload)}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">{getSourceSecondaryLabel(jobDetail.payload?.source_type)}</div>
                  <div className="detail-value mono">{getSourceSecondaryValue(jobDetail.payload)}</div>
                </div>
                <div className="detail-item">
                  <div className="kpi-label">更新时间</div>
                  <div className="detail-value">{formatDateTime(jobDetail.updated_at)}</div>
                </div>
              </div>

              <div className="toolbar workbench-table-toolbar">
                <div className="toolbar-group">
                  <button type="button" className="button button-small button-ghost" onClick={() => handleCopyLogs(jobDetail.logs)}>
                    复制日志
                  </button>
                  <button type="button" className="button button-small button-secondary" onClick={() => handleExportLogs(jobDetail)}>
                    导出日志
                  </button>
                  <button type="button" className="button button-small button-ghost" onClick={() => handleReuseJobConfig(jobDetail)}>
                    回填到工作台
                  </button>
                  {['pending', 'running', 'cancelling'].includes(jobDetail.status) ? (
                    <button type="button" className="button button-small button-danger" onClick={() => handleCancelJob(jobDetail.job_id)} disabled={jobDetail.status === 'cancelling'}>
                      {jobDetail.status === 'cancelling' ? '取消中...' : '停止任务'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="log-viewer">{jobDetail.logs || '暂无任务日志。'}</div>
            </>
          ) : (
            <div className="empty-state small">请选择一条任务查看详情。</div>
          )}
        </section>
      </div>
    </div>
  )
}
