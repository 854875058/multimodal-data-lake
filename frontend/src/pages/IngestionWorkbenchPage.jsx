import { useEffect, useMemo, useState } from 'react'
import api, { getErrorMessage } from '@/api'
import { useNavigate } from 'react-router-dom'
import { formatBytes, formatDateTime, formatNumber } from '@/utils/format'

const defaultForm = {
  source_type: 's3',
  endpoint_url: '',
  access_key_id: '',
  secret_access_key: '',
  bucket_name: '',
  prefix: '',
  sftp_host: '',
  sftp_port: 22,
  sftp_user: '',
  sftp_password: '',
  sftp_path: '/tmp',
  scan_limit: 200,
  max_files: 100,
  overwrite_existing: false,
  index_strategy: 'auto',
  index_type: 'IVF_PQ',
  build_text_index: true,
  build_image_index: true,
  num_partitions: '',
  num_sub_vectors: ''
}

const emptyScan = {
  source_type: 's3',
  source_label: '',
  source_path: '',
  objects: [],
  returned_count: 0,
  eligible_count: 0,
  total_seen: 0,
  truncated: false
}

const emptyIndexStatus = {
  text: { row_count: 0, indices: [] },
  image: { row_count: 0, indices: [] }
}

const sourceTypeOptions = [
  { value: 's3', label: 'S3 / SeaweedFS', hint: '扫描对象存储中的 Key' },
  { value: 'sftp', label: 'SFTP', hint: '从远程目录抓取文件' }
]

const indexModeOptions = [
  { value: 'auto', label: '自动选择' },
  { value: 'none', label: '不构建索引' },
  { value: 'EMPTY', label: '留空（不指定）' },
  { value: 'IVF_FLAT', label: 'IVF_FLAT' },
  { value: 'IVF_SQ', label: 'IVF_SQ' },
  { value: 'IVF_PQ', label: 'IVF_PQ' },
  { value: 'IVF_RQ', label: 'IVF_RQ' },
  { value: 'IVF_HNSW_SQ', label: 'IVF_HNSW_SQ' },
  { value: 'IVF_HNSW_PQ', label: 'IVF_HNSW_PQ' }
]

const scanPageSizeOptions = [20, 50, 100, 200]

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

function normalizeForm(data = {}) {
  const sourceType = data?.source_type === 'sftp' ? 'sftp' : 's3'
  return {
    ...defaultForm,
    ...data,
    source_type: sourceType,
    sftp_host: String(data?.sftp_host || ''),
    sftp_port: Number(data?.sftp_port ?? defaultForm.sftp_port),
    sftp_user: String(data?.sftp_user || ''),
    sftp_password: String(data?.sftp_password || ''),
    sftp_path: String(data?.sftp_path || defaultForm.sftp_path),
    scan_limit: Number(data?.scan_limit ?? defaultForm.scan_limit),
    max_files: Number(data?.max_files ?? defaultForm.max_files),
    overwrite_existing: Boolean(data?.overwrite_existing),
    index_strategy: data?.index_strategy || 'auto',
    index_type: data?.index_type ?? defaultForm.index_type,
    build_text_index: data?.build_text_index ?? true,
    build_image_index: data?.build_image_index ?? true,
    num_partitions: data?.num_partitions ?? '',
    num_sub_vectors: data?.num_sub_vectors ?? ''
  }
}

function normalizeConnectionData(data) {
  if (!data || typeof data !== 'object') {
    return null
  }

  return {
    source_type: data.source_type === 'sftp' ? 'sftp' : 's3',
    success: Boolean(data.success),
    source_label: String(data.source_label || ''),
    source_path: String(data.source_path || ''),
    bucket_name: String(data.bucket_name || ''),
    prefix: String(data.prefix || ''),
    host: String(data.host || ''),
    path: String(data.path || ''),
    sample_count: Number(data.sample_count || 0),
    sample_objects: Array.isArray(data.sample_objects) ? data.sample_objects : []
  }
}

function normalizeScanResult(data) {
  const source = data && typeof data === 'object' ? data : {}
  return {
    ...emptyScan,
    ...source,
    source_type: source.source_type === 'sftp' ? 'sftp' : 's3',
    source_label: String(source.source_label || ''),
    source_path: String(source.source_path || ''),
    objects: Array.isArray(source.objects) ? source.objects : []
  }
}

function normalizeIndexBucket(data) {
  const source = data && typeof data === 'object' ? data : {}
  const rawIndices = source.indices
  return {
    row_count: Number(source.row_count || 0),
    indices: Array.isArray(rawIndices) ? rawIndices : rawIndices ? [rawIndices] : []
  }
}

function normalizeIndexStatus(data) {
  const source = data && typeof data === 'object' ? data : {}
  return {
    text: normalizeIndexBucket(source.text),
    image: normalizeIndexBucket(source.image)
  }
}

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

function getConnectionSummary(connectionData) {
  if (!connectionData) {
    return ''
  }

  if (connectionData.source_type === 'sftp') {
    return `连接成功：样本 ${formatNumber(connectionData.sample_count)} 个，Host ${connectionData.host || '--'}，Path ${connectionData.path || '/'}。`
  }

  return `连接成功：样本 ${formatNumber(connectionData.sample_count)} 个，Bucket ${connectionData.bucket_name || '--'}，Prefix ${connectionData.prefix || '/'}。`
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

function getIndexModeValue(form) {
  if (form.index_strategy === 'none') {
    return 'none'
  }
  if (form.index_strategy === 'auto') {
    return 'auto'
  }
  return form.index_type || 'EMPTY'
}


function showPartitionField(indexModeValue) {
  return indexModeValue !== 'none' && indexModeValue !== 'EMPTY'
}

function showSubVectorField(indexModeValue) {
  return ['IVF_PQ', 'IVF_HNSW_PQ'].includes(indexModeValue)
}

function mapIndexModeToForm(modeValue, currentForm) {
  if (modeValue === 'auto') {
    return {
      ...currentForm,
      index_strategy: 'auto'
    }
  }

  if (modeValue === 'none') {
    return {
      ...currentForm,
      index_strategy: 'none'
    }
  }

  if (modeValue === 'EMPTY') {
    return {
      ...currentForm,
      index_strategy: 'custom',
      index_type: ''
    }
  }

  return {
    ...currentForm,
    index_strategy: 'custom',
    index_type: modeValue
  }
}


function buildWorkbenchPayload(form, extra = {}) {
  return {
    ...form,
    ...extra,
    sftp_port: Number(form.sftp_port || 0) || defaultForm.sftp_port,
    scan_limit: Number(form.scan_limit || 0) || defaultForm.scan_limit,
    max_files: Number(form.max_files || 0) || defaultForm.max_files,
    num_partitions: form.num_partitions === '' ? null : Number(form.num_partitions),
    num_sub_vectors: form.num_sub_vectors === '' ? null : Number(form.num_sub_vectors)
  }
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

function getIndicesText(indices) {
  if (!Array.isArray(indices) || !indices.length) {
    return '未构建'
  }

  return indices
    .map((item, index) => {
      if (typeof item === 'string') {
        return item
      }
      if (item && typeof item === 'object') {
        return item.name || item.index_name || item.uuid || item.type || `索引 ${index + 1}`
      }
      return `索引 ${index + 1}`
    })
    .join('、')
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

export default function IngestionWorkbenchPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(defaultForm)
  const [scanResult, setScanResult] = useState(emptyScan)
  const [indexStatus, setIndexStatus] = useState(emptyIndexStatus)
  const [platformSettings, setPlatformSettings] = useState(null)
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState('overview')
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [jobDetail, setJobDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [buildingIndex, setBuildingIndex] = useState(false)
  const [banner, setBanner] = useState({ type: '', message: '' })
  const [error, setError] = useState('')
  const [connectionData, setConnectionData] = useState(null)
  const [jobModalOpen, setJobModalOpen] = useState(false)
  const [jobStatusFilter, setJobStatusFilter] = useState('all')
  const [jobKeyword, setJobKeyword] = useState('')
  const [jobSort, setJobSort] = useState('updated_desc')
  const [selectedScanKeys, setSelectedScanKeys] = useState([])
  const [scanKeyword, setScanKeyword] = useState('')
  const [scanCategoryFilter, setScanCategoryFilter] = useState('all')
  const [scanSupportedOnly, setScanSupportedOnly] = useState(false)
  const [scanPage, setScanPage] = useState(1)
  const [scanPageSize, setScanPageSize] = useState(20)

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


  const supportedScanObjects = useMemo(
    () => (Array.isArray(scanResult.objects) ? scanResult.objects.filter((item) => item.supported) : []),
    [scanResult.objects]
  )

  const scanCategories = useMemo(() => {
    const categories = Array.isArray(scanResult.objects)
      ? Array.from(new Set(scanResult.objects.map((item) => item.category || 'other').filter(Boolean)))
      : []
    return ['all', ...categories]
  }, [scanResult.objects])

  const filteredScanObjects = useMemo(() => {
    const items = Array.isArray(scanResult.objects) ? scanResult.objects : []
    const keyword = scanKeyword.trim().toLowerCase()

    return items.filter((item) => {
      if (scanCategoryFilter !== 'all' && (item.category || 'other') !== scanCategoryFilter) {
        return false
      }
      if (scanSupportedOnly && !item.supported) {
        return false
      }
      if (!keyword) {
        return true
      }

      const haystack = [item.name, item.key, item.ext, item.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [scanCategoryFilter, scanKeyword, scanResult.objects, scanSupportedOnly])

  const filteredSupportedScanObjects = useMemo(
    () => filteredScanObjects.filter((item) => item.supported),
    [filteredScanObjects]
  )

  const scanPageCount = useMemo(
    () => Math.max(1, Math.ceil(filteredScanObjects.length / Math.max(1, scanPageSize))),
    [filteredScanObjects.length, scanPageSize]
  )

  const pagedScanObjects = useMemo(() => {
    const safePage = Math.min(Math.max(1, scanPage), scanPageCount)
    const startIndex = (safePage - 1) * scanPageSize
    return filteredScanObjects.slice(startIndex, startIndex + scanPageSize)
  }, [filteredScanObjects, scanPage, scanPageCount, scanPageSize])

  const selectedScanObjects = useMemo(() => {
    const selectedSet = new Set(selectedScanKeys)
    return supportedScanObjects.filter((item) => selectedSet.has(item.key))
  }, [selectedScanKeys, supportedScanObjects])

  const sourceSummaryTitle = form.source_type === 's3'
    ? (form.bucket_name || '未设置 Bucket')
    : (form.sftp_host || '未设置 SFTP 主机')
  const sourceSummaryPath = form.source_type === 's3'
    ? (form.prefix || '/')
    : (form.sftp_path || '/')
  const sourceSummaryMeta = form.source_type === 's3'
    ? (form.endpoint_url || '未设置 Endpoint')
    : `${form.sftp_user || '未设置用户'} @ ${form.sftp_port || 22}`
  const readinessBadge = connectionData
    ? '连接已验证'
    : scanResult.objects.length
      ? '已完成扫描'
      : '待建立连接'
  const orchestrationHint = selectedScanKeys.length
    ? `本次已手动勾选 ${formatNumber(selectedScanKeys.length)} 个对象，启动任务时将优先导入这些对象。`
    : `当前未启用勾选导入，启动任务时会按扫描结果和上限 ${formatNumber(form.max_files)} 自动选取。`
  const taskPressureText = activeJobs
    ? `当前有 ${formatNumber(activeJobs)} 个活动任务，建议优先查看任务详情和索引状态。`
    : '当前没有活动任务，可以直接执行一次来源测试、扫描或批量导入。'
  const platformServiceCards = [
    {
      title: 'Gravitino',
      value: platformSettings?.gravitino_url || '--',
      note: platformSettings?.metalake ? `Metalake: ${platformSettings.metalake}` : '目录治理与资产注册'
    },
    {
      title: 'SeaweedFS S3',
      value: form.source_type === 's3' ? (form.endpoint_url || platformSettings?.seaweedfs_s3_url || '--') : (platformSettings?.seaweedfs_s3_url || '--'),
      note: '对象存储入口与 Lance 数据承载'
    },
    {
      title: 'Ray Dashboard',
      value: platformSettings?.ray_dashboard_url || '--',
      note: '工作流编排与批量任务执行入口'
    },
    {
      title: 'Doris',
      value: platformSettings?.doris_mysql_host ? `${platformSettings.doris_mysql_host}:${platformSettings.doris_mysql_port}` : '--',
      note: '联邦查询与结果消费层'
    }
  ]
  const governanceCards = [
    {
      title: '来源合同',
      copy: form.source_type === 's3'
        ? '统一描述 SeaweedFS / S3 来源、扫描范围和可复用配置，降低接入过程中的解释成本。'
        : '保留 SFTP 作为补充接入路径，但整体展示仍以对象存储和 Lance 为主线。'
    },
    {
      title: '编排标准',
      copy: '通过 Daft ETL 工作流和 Ray Job 预览，把接入、清洗、向量化、回写这些动作组织成平台流程，而不是脚本堆叠。'
    },
    {
      title: '执行治理',
      copy: '优先展示任务状态、索引结果和日志闭环，保证工作台更像商业平台控制面，而不是单次操作面板。'
    }
  ]
  const workspaceSections = [
    { id: 'overview', label: '总控', hint: '平台视角' },
    { id: 'source', label: '来源配置', hint: '接入与扫描' },
    { id: 'index', label: '索引资产', hint: '索引与容量' }
  ]

  const loadSettings = async () => {
    const response = await api.getWorkbenchSettings()
    setForm(normalizeForm(response?.data || {}))
  }

  const loadIndexStatus = async () => {
    const response = await api.getWorkbenchIndexStatus()
    setIndexStatus(normalizeIndexStatus(response?.data))
  }

  const loadPlatformSettings = async () => {
    const response = await api.getPlatformSettings()
    setPlatformSettings(response?.data || null)
  }

  const loadJobs = async () => {
    const response = await api.getWorkbenchJobs(20)
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

  const refreshAll = async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
      setError('')
    }

    try {
      await Promise.all([loadSettings(), loadIndexStatus(), loadJobs(), loadPlatformSettings()])
    } catch (requestError) {
      setError(getErrorMessage(requestError, '加载工作台数据失败。'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refreshAll(false)
  }, [])

  useEffect(() => {
    if (loading) {
      return
    }

    const payloadText = typeof window !== 'undefined' ? window.sessionStorage.getItem('workbench_reuse_payload') : ''
    if (!payloadText) {
      return
    }

    try {
      const payload = JSON.parse(payloadText)
      const nextForm = normalizeForm(payload)
      setForm(nextForm)
      setConnectionData(null)
      setScanResult({ ...emptyScan, source_type: nextForm.source_type })
      setSelectedScanKeys([])
      setScanPage(1)
      setActiveWorkspaceSection('source')
      const sourceJobId = window.sessionStorage.getItem('workbench_reuse_job_id')
      showBanner('success', sourceJobId ? `已从任务 ${sourceJobId} 回填配置。` : '已回填任务配置。')
      window.sessionStorage.removeItem('workbench_reuse_payload')
      window.sessionStorage.removeItem('workbench_reuse_job_id')
    } catch {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('workbench_reuse_payload')
        window.sessionStorage.removeItem('workbench_reuse_job_id')
      }
    }
  }, [loading])

  useEffect(() => {
    if (selectedJobId) {
      loadJobDetail(selectedJobId, true)
    } else {
      setJobDetail(null)
    }
  }, [selectedJobId])

  useEffect(() => {
    setScanPage((current) => Math.min(Math.max(1, current), scanPageCount))
  }, [scanPageCount])

  useEffect(() => {
    const supportedKeySet = new Set(supportedScanObjects.map((item) => item.key))
    setSelectedScanKeys((current) => current.filter((key) => supportedKeySet.has(key)))
  }, [supportedScanObjects])

  useEffect(() => {
    if (!scanResult.objects.length && scanResult.source_type !== form.source_type) {
      setScanResult((current) => ({ ...current, source_type: form.source_type }))
    }
  }, [form.source_type, scanResult.objects.length, scanResult.source_type])

  useEffect(() => {
    const shouldPoll = activeJobs > 0 || ['pending', 'running', 'cancelling'].includes(jobDetail?.status)
    if (!shouldPoll) {
      return undefined
    }

    const timer = window.setInterval(async () => {
      try {
        await Promise.all([
          loadJobs(),
          loadIndexStatus(),
          selectedJobId ? loadJobDetail(selectedJobId, true) : Promise.resolve(null)
        ])
      } catch {
        // 轮询时静默失败，避免打断页面使用
      }
    }, 3000)

    return () => window.clearInterval(timer)
  }, [activeJobs, jobDetail?.status, selectedJobId])

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target
    if (type === 'checkbox') {
      updateField(name, checked)
      return
    }

    if (name === 'index_mode') {
      setForm((current) => mapIndexModeToForm(value, current))
      return
    }

    if (['sftp_port', 'scan_limit', 'max_files', 'num_partitions', 'num_sub_vectors'].includes(name)) {
      updateField(name, value === '' ? '' : Number(value))
      return
    }

    updateField(name, value)
  }

  const handleSourceTypeChange = (sourceType) => {
    setForm((current) => ({ ...current, source_type: sourceType }))
    setConnectionData(null)
    setScanResult({ ...emptyScan, source_type: sourceType })
    setSelectedScanKeys([])
    setScanPage(1)
    setBanner({ type: '', message: '' })
    setError('')
  }

  const showBanner = (type, message) => {
    setBanner({ type, message })
  }


  const toggleScanSelection = (key) => {
    setSelectedScanKeys((current) => {
      const exists = current.includes(key)
      if (exists) {
        return current.filter((item) => item !== key)
      }
      return [...current, key]
    })
  }

  const selectAllScanObjects = () => {
    setSelectedScanKeys((current) => Array.from(new Set([...current, ...filteredSupportedScanObjects.map((item) => item.key)])))
  }

  const clearSelectedScanObjects = () => {
    setSelectedScanKeys([])
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      const response = await api.saveWorkbenchSettings(buildWorkbenchPayload(form))
      setForm(normalizeForm(response?.data || form))
      showBanner('success', response?.message || '配置已保存。')
    } catch (requestError) {
      setError(getErrorMessage(requestError, '保存配置失败。'))
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setError('')

    try {
      const response = await api.testWorkbenchConnection(buildWorkbenchPayload(form))
      setConnectionData(normalizeConnectionData(response?.data))
      showBanner('success', response?.message || '连接测试成功。')
    } catch (requestError) {
      setConnectionData(null)
      setError(getErrorMessage(requestError, '测试连接失败。'))
    } finally {
      setTesting(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setError('')

    try {
      const response = await api.scanWorkbenchSource(buildWorkbenchPayload(form))
      setScanResult(normalizeScanResult(response?.data))
      setSelectedScanKeys([])
      setScanPage(1)
      showBanner('success', response?.message || '扫描完成。')
    } catch (requestError) {
      setScanResult({ ...emptyScan, source_type: form.source_type })
      setError(getErrorMessage(requestError, '扫描来源目录失败。'))
    } finally {
      setScanning(false)
    }
  }

  const handleStartJob = async () => {
    setStarting(true)
    setError('')

    try {
      const response = await api.startWorkbenchJob(buildWorkbenchPayload(form, { selected_keys: selectedScanKeys }))
      const job = response?.job || null
      showBanner('success', response?.message || '批量导入任务已启动。')
      await loadJobs()
      if (job?.job_id) {
        setSelectedJobId(job.job_id)
        await loadJobDetail(job.job_id, true)
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, '启动批量导入任务失败。'))
    } finally {
      setStarting(false)
    }
  }

  const handleBuildIndex = async () => {
    setBuildingIndex(true)
    setError('')

    try {
      const response = await api.buildWorkbenchIndex(buildWorkbenchPayload(form))
      await loadIndexStatus()
      showBanner('success', response?.message || '索引构建完成。')
    } catch (requestError) {
      setError(getErrorMessage(requestError, '构建索引失败。'))
    } finally {
      setBuildingIndex(false)
    }
  }


  const handleViewJobDetail = async (jobId) => {
    if (!jobId) {
      return
    }

    setSelectedJobId(jobId)
    await loadJobDetail(jobId)
    setJobModalOpen(true)
  }

  const handleCancelJob = async (jobId) => {
    if (!jobId) {
      return
    }

    try {
      const response = await api.cancelWorkbenchJob(jobId)
      showBanner('success', response?.message || '任务取消请求已提交。')
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

    const nextForm = normalizeForm(job.payload)
    setForm(nextForm)
    setConnectionData(null)
    setScanResult({ ...emptyScan, source_type: nextForm.source_type })
    setSelectedScanKeys([])
    setScanPage(1)
    showBanner('success', `已回填任务 ${job.job_id} 的配置，可直接再次扫描或启动任务。`)
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const closeJobModal = () => {
    setJobModalOpen(false)
  }

  const handleExportLogs = (job) => {
    const content = String(job?.logs || '').trim()
    if (!content) {
      showBanner('warning', '当前任务暂无可导出的日志。')
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
    showBanner('success', '任务日志已导出。')
  }

  const handleCopyLogs = async (logs) => {
    const content = String(logs || '').trim()
    if (!content) {
      showBanner('warning', '当前任务暂无可复制日志。')
      return
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = content
        textarea.setAttribute('readonly', 'true')
        textarea.style.position = 'fixed'
        textarea.style.top = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      showBanner('success', '任务日志已复制到剪贴板。')
    } catch (copyError) {
      setError(getErrorMessage(copyError, '复制任务日志失败。'))
    }
  }

  if (loading) {
    return <div className="loading-state">工作台加载中...</div>
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI 工作台</h1>
          <p className="page-subtitle">
            配置 SeaweedFS / S3 或 SFTP 来源，扫描待处理文件，并围绕 Lance 向量化与批量任务执行组织接入流程。
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={() => refreshAll(true)} disabled={loading || refreshing}>
            {refreshing ? '刷新中...' : '刷新状态'}
          </button>
        </div>
      </div>

      {banner.message ? <div className={`${banner.type}-banner`}>{banner.message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="workspace-switcher glass-card">
        <div className="workspace-switcher-head">
          <div>
            <div className="section-title">工作区视图</div>
            <div className="workbench-help">用分段工作区代替长滚动页面，降低信息堆叠感。</div>
          </div>
        </div>
        <div className="workspace-segmented">
          {workspaceSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`workspace-segment${activeWorkspaceSection === section.id ? ' is-active' : ''}`}
              onClick={() => setActiveWorkspaceSection(section.id)}
            >
              <span className="workspace-segment-label">{section.label}</span>
              <span className="workspace-segment-hint">{section.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {activeWorkspaceSection === 'overview' ? (
        <>
          <div className="workbench-strategy-grid">
            <section className="glass-card workbench-platform-card">
              <div className="card-header">
                <div>
                  <h2>平台依赖矩阵</h2>
                  <p>用平台服务视角描述当前工作台，而不是只看表单字段和按钮。</p>
                </div>
                <span className="badge">Control Plane</span>
              </div>

              <div className="platform-service-grid compact-grid">
                {platformServiceCards.map((item) => (
                  <div className="platform-service-card compact-card" key={item.title}>
                    <div className="platform-service-head">
                      <div className="platform-service-title">{item.title}</div>
                    </div>
                    <div className="platform-service-meta mono">{item.value}</div>
                    <div className="platform-service-note">{item.note}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-card workbench-playbook-card">
              <div className="card-header">
                <div>
                  <h2>执行准则</h2>
                  <p>让工作台更像商业平台控制台，而不是临时操作页。</p>
                </div>
              </div>

              <div className="platform-roadmap-list">
                {governanceCards.map((item) => (
                  <div className="platform-roadmap-item" key={item.title}>
                    <div className="platform-roadmap-title">{item.title}</div>
                    <div className="platform-roadmap-copy">{item.copy}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="workbench-command-deck">
            <section className="glass-card workbench-command-card">
              <div className="card-header">
                <div>
                  <h2>执行概览</h2>
                  <p>先确认来源、连接和扫描状态，再进入批量导入、索引构建和任务追踪。</p>
                </div>
                <span className="badge">{readinessBadge}</span>
              </div>

              <div className="workflow-strip">
                <div className="workflow-step is-active">
                  <span className="workflow-step-index">01</span>
                  <div>
                    <div className="workflow-step-title">配置来源</div>
                    <div className="workflow-step-copy">{form.source_type === 's3' ? 'SeaweedFS / S3 兼容对象存储' : '远程 SFTP 目录'}</div>
                  </div>
                </div>
                <div className={`workflow-step ${connectionData ? 'is-active' : ''}`}>
                  <span className="workflow-step-index">02</span>
                  <div>
                    <div className="workflow-step-title">验证连接</div>
                    <div className="workflow-step-copy">{connectionData ? '已拿到样本结果' : '建议先做连通性测试'}</div>
                  </div>
                </div>
                <div className={`workflow-step ${scanResult.objects.length ? 'is-active' : ''}`}>
                  <span className="workflow-step-index">03</span>
                  <div>
                    <div className="workflow-step-title">扫描筛选</div>
                    <div className="workflow-step-copy">{scanResult.objects.length ? `已返回 ${formatNumber(scanResult.returned_count)} 个对象` : '还未生成预览清单'}</div>
                  </div>
                </div>
                <div className={`workflow-step ${activeJobs ? 'is-active' : ''}`}>
                  <span className="workflow-step-index">04</span>
                  <div>
                    <div className="workflow-step-title">任务执行</div>
                    <div className="workflow-step-copy">{activeJobs ? `${formatNumber(activeJobs)} 个任务执行中` : '等待启动导入任务'}</div>
                  </div>
                </div>
              </div>

              <div className="workbench-brief-copy">
                <p>{orchestrationHint}</p>
                <p>{taskPressureText}</p>
              </div>
            </section>

            <section className="glass-card workbench-source-brief">
              <div className="kpi-label">当前来源</div>
              <div className="workbench-source-brief-title">{sourceSummaryTitle}</div>
              <div className="workbench-source-brief-path mono">{sourceSummaryPath}</div>
              <div className="workbench-source-brief-meta">{sourceSummaryMeta}</div>

              <div className="workbench-brief-stats">
                <div className="workbench-brief-stat">
                  <div className="kpi-label">活动任务</div>
                  <div className="workbench-brief-value">{formatNumber(activeJobs)}</div>
                </div>
                <div className="workbench-brief-stat">
                  <div className="kpi-label">扫描对象</div>
                  <div className="workbench-brief-value">{formatNumber(scanResult.returned_count)}</div>
                </div>
                <div className="workbench-brief-stat">
                  <div className="kpi-label">已勾选</div>
                  <div className="workbench-brief-value">{formatNumber(selectedScanKeys.length)}</div>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {activeWorkspaceSection === 'overview' ? (
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>编排入口</h2>
              <p>Daft ETL 工作流和 Ray Job 资源控制已经独立到编排中心，让 AI 工作台保持控制面属性。</p>
            </div>
            <span className="badge">Workflow</span>
          </div>

          <div className="platform-capability-grid">
            <div className="platform-capability-card">
              <div className="platform-capability-title">模板化编排</div>
              <div className="platform-capability-copy">使用预设模板与节点库组合 Daft ETL 工作流，避免把复杂流程塞回工作台首页。</div>
            </div>
            <div className="platform-capability-card">
              <div className="platform-capability-title">资源控制</div>
              <div className="platform-capability-copy">在编排中心统一设置 CPU、GPU 和内存，使来源配置和执行模板解耦。</div>
            </div>
            <div className="platform-capability-card">
              <div className="platform-capability-title">运行治理分离</div>
              <div className="platform-capability-copy">任务列表、日志与取消动作已迁到任务治理中心，避免工作台承担运行明细页角色。</div>
            </div>
            <div className="platform-capability-card">
              <div className="platform-capability-title">进入编排中心</div>
              <div className="platform-capability-copy">对复杂 Ray Job、Daft ETL 模板和执行摘要做独立编排，而不是继续依赖单页切换。</div>
              <div className="toolbar-group" style={{ marginTop: 10 }}>
                <button type="button" className="button button-small button-primary" onClick={() => navigate('/workflow')}>
                  打开编排中心
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeWorkspaceSection === 'source' ? (
        <>
      <section className="glass-card workbench-config-card">
          <div className="card-header">
            <div>
              <h2>来源配置</h2>
              <p>填写数据源连接信息、扫描范围和索引模式，后续可直接复用到 Ray 批量任务。</p>
            </div>
            <span className="badge">{getSourceTypeText(form.source_type)}</span>
          </div>

        <div className="workbench-source-toggle">
          {sourceTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`workbench-source-chip ${form.source_type === option.value ? 'is-active' : ''}`}
              onClick={() => handleSourceTypeChange(option.value)}
            >
              <span className="workbench-source-chip-title">{option.label}</span>
              <span className="workbench-source-chip-hint">{option.hint}</span>
            </button>
          ))}
        </div>

        <div className="workbench-form-grid">
          {form.source_type === 's3' ? (
            <>
              <div className="field">
                <label htmlFor="endpoint_url">S3 Endpoint</label>
                <input id="endpoint_url" name="endpoint_url" className="input" value={form.endpoint_url} onChange={handleInputChange} placeholder="http://127.0.0.1:8333" />
              </div>

              <div className="field">
                <label htmlFor="bucket_name">Bucket</label>
                <input id="bucket_name" name="bucket_name" className="input" value={form.bucket_name} onChange={handleInputChange} placeholder="multimodal-lake-bucket" />
              </div>

              <div className="field">
                <label htmlFor="prefix">目录前缀</label>
                <input id="prefix" name="prefix" className="input" value={form.prefix} onChange={handleInputChange} placeholder="raw/docs/2026" />
              </div>

              <div className="field">
                <label htmlFor="access_key_id">Access Key</label>
                <input id="access_key_id" name="access_key_id" className="input" value={form.access_key_id} onChange={handleInputChange} placeholder="mykey" />
              </div>

              <div className="field">
                <label htmlFor="secret_access_key">Secret Key</label>
                <input id="secret_access_key" name="secret_access_key" type="password" className="input" value={form.secret_access_key} onChange={handleInputChange} placeholder="请输入密钥" />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="sftp_host">SFTP 主机</label>
                <input id="sftp_host" name="sftp_host" className="input" value={form.sftp_host} onChange={handleInputChange} placeholder="192.168.20.10" />
              </div>

              <div className="field">
                <label htmlFor="sftp_port">SFTP 端口</label>
                <input id="sftp_port" name="sftp_port" type="number" min="1" max="65535" className="input" value={form.sftp_port} onChange={handleInputChange} placeholder="22" />
              </div>

              <div className="field">
                <label htmlFor="sftp_user">用户名</label>
                <input id="sftp_user" name="sftp_user" className="input" value={form.sftp_user} onChange={handleInputChange} placeholder="root" />
              </div>

              <div className="field">
                <label htmlFor="sftp_password">密码</label>
                <input id="sftp_password" name="sftp_password" type="password" className="input" value={form.sftp_password} onChange={handleInputChange} placeholder="请输入密码" />
              </div>

              <div className="field">
                <label htmlFor="sftp_path">远程路径</label>
                <input id="sftp_path" name="sftp_path" className="input" value={form.sftp_path} onChange={handleInputChange} placeholder="/tmp" />
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="scan_limit">扫描上限</label>
            <input id="scan_limit" name="scan_limit" type="number" min="1" max="2000" className="input" value={form.scan_limit} onChange={handleInputChange} />
          </div>

          <div className="field">
            <label htmlFor="max_files">导入文件数上限</label>
            <input id="max_files" name="max_files" type="number" min="1" max="5000" className="input" value={form.max_files} onChange={handleInputChange} />
          </div>

          <div className="field">
            <label htmlFor="index_mode">索引模式</label>
            <select id="index_mode" name="index_mode" className="select" value={getIndexModeValue(form)} onChange={handleInputChange}>
              {indexModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {showPartitionField(getIndexModeValue(form)) ? (
            <div className="field">
              <label htmlFor="num_partitions">分区数</label>
              <input id="num_partitions" name="num_partitions" type="number" min="1" className="input" value={form.num_partitions} onChange={handleInputChange} placeholder="自动" />
            </div>
          ) : null}

          {showSubVectorField(getIndexModeValue(form)) ? (
            <div className="field">
              <label htmlFor="num_sub_vectors">PQ 子向量数</label>
              <input id="num_sub_vectors" name="num_sub_vectors" type="number" min="1" className="input" value={form.num_sub_vectors} onChange={handleInputChange} placeholder="IVF_PQ / IVF_HNSW_PQ 时生效" />
            </div>
          ) : null}
        </div>

        <div className="workbench-switch-grid">
          <label className="checkbox-field">
            <input type="checkbox" name="overwrite_existing" checked={form.overwrite_existing} onChange={handleInputChange} />
            <span>覆盖已存在文件</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" name="build_text_index" checked={form.build_text_index} onChange={handleInputChange} />
            <span>构建文本向量索引</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" name="build_image_index" checked={form.build_image_index} onChange={handleInputChange} />
            <span>构建图像向量索引</span>
          </label>
        </div>

        <div className="toolbar workbench-toolbar">
          <div className="toolbar-group">
            <button type="button" className="button button-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </button>
            <button type="button" className="button button-secondary" onClick={handleTestConnection} disabled={testing}>
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button type="button" className="button button-secondary" onClick={handleScan} disabled={scanning}>
              {scanning ? '扫描中...' : '扫描预览'}
            </button>
            <button type="button" className="button button-primary" onClick={handleStartJob} disabled={starting}>
              {starting ? '启动中...' : selectedScanKeys.length ? `导入已勾选（${selectedScanKeys.length}）` : '启动批量导入'}
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={handleBuildIndex}
              disabled={buildingIndex || form.index_strategy === 'none' || (form.index_strategy === 'custom' && !form.index_type)}
            >
              {buildingIndex ? '构建中...' : '手动构建索引'}
            </button>
          </div>
          <div className="workbench-help mono">
            {form.source_type === 's3'
              ? '当前模式：S3 / SeaweedFS 扫描对象 Key；目标原始文件与 LanceDB 仍沿用系统当前存储配置。'
              : '当前模式：SFTP 扫描远程目录中的直接子文件；目标原始文件与 LanceDB 仍沿用系统当前存储配置。'}
          </div>
        </div>
      </section>
      </>
      ) : null}

      {activeWorkspaceSection === 'overview' || activeWorkspaceSection === 'index' ? <div className="section-title">执行态势</div> : null}
      {activeWorkspaceSection === 'overview' || activeWorkspaceSection === 'index' ? (
      <div className="mini-kpi-grid">
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">扫描返回对象</div>
          <div className="kpi-value">{formatNumber(scanResult.returned_count)}</div>
          <div className="kpi-sub">本次预览返回的对象数量</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">可处理文件</div>
          <div className="kpi-value">{formatNumber(scanResult.eligible_count)}</div>
          <div className="kpi-sub">扩展名命中当前入湖能力</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">当前活动任务</div>
          <div className="kpi-value">{formatNumber(activeJobs)}</div>
          <div className="kpi-sub">排队中或执行中的批量任务</div>
        </div>
        <div className="glass-card mini-kpi-card">
          <div className="kpi-label">已勾选文件</div>
          <div className="kpi-value">{formatNumber(selectedScanKeys.length)}</div>
          <div className="kpi-sub">本次准备定向导入的扫描对象</div>
        </div>
      </div>
      ) : null}

      {activeWorkspaceSection === 'source' ? (
      <div className="workbench-grid">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>扫描预览</h2>
              <p>先看待处理对象，再决定一次导入多少文件。</p>
            </div>
            <span className="badge">{scanResult.truncated ? '结果已截断' : '完整结果'}</span>
          </div>

          <div className="toolbar workbench-table-toolbar">
            <div className="toolbar-group">
              <div className="field compact-field">
                <label htmlFor="scan_category_filter">类型筛选</label>
                <select
                  id="scan_category_filter"
                  className="select"
                  value={scanCategoryFilter}
                  onChange={(event) => {
                    setScanCategoryFilter(event.target.value)
                    setScanPage(1)
                  }}
                >
                  {scanCategories.map((option) => (
                    <option key={option} value={option}>
                      {option === 'all' ? '全部类型' : option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field compact-field">
                <label htmlFor="scan_page_size">每页条数</label>
                <select
                  id="scan_page_size"
                  className="select"
                  value={scanPageSize}
                  onChange={(event) => {
                    setScanPageSize(Number(event.target.value))
                    setScanPage(1)
                  }}
                >
                  {scanPageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field grow-field">
                <label htmlFor="scan_keyword">扫描搜索</label>
                <input
                  id="scan_keyword"
                  className="input"
                  value={scanKeyword}
                  onChange={(event) => {
                    setScanKeyword(event.target.value)
                    setScanPage(1)
                  }}
                  placeholder="搜索文件名、对象 Key、扩展名或类型"
                />
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={scanSupportedOnly}
                  onChange={(event) => {
                    setScanSupportedOnly(event.target.checked)
                    setScanPage(1)
                  }}
                />
                <span>仅看支持项</span>
              </label>
              <button type="button" className="button button-small button-secondary" onClick={selectAllScanObjects} disabled={!filteredSupportedScanObjects.length}>
                全选当前筛选
              </button>
              <button type="button" className="button button-small button-ghost" onClick={clearSelectedScanObjects} disabled={!selectedScanKeys.length}>
                清空勾选
              </button>
            </div>
            <div className="workbench-help">支持对象 {formatNumber(supportedScanObjects.length)} 个，当前筛选 {formatNumber(filteredScanObjects.length)} 个，当前勾选 {formatNumber(selectedScanKeys.length)} 个；启动任务时若存在勾选，将优先只导入勾选对象。</div>
          </div>

          {connectionData ? <div className="success-banner workbench-inline-banner">{getConnectionSummary(connectionData)}</div> : null}

          {scanResult.objects.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>选择</th>
                    <th>文件名</th>
                    <th>对象 Key</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>最后修改</th>
                    <th>可处理</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedScanObjects.map((item) => (
                    <tr key={item.key}>
                      <td>
                        {item.supported ? (
                          <input
                            type="checkbox"
                            className="table-checkbox"
                            checked={selectedScanKeys.includes(item.key)}
                            onChange={() => toggleScanSelection(item.key)}
                          />
                        ) : null}
                      </td>
                      <td>
                        <div className="table-primary">{item.name || '-'}</div>
                        <div className="table-secondary">扩展名：{item.ext || '-'}</div>
                      </td>
                      <td className="table-secondary mono">{item.key}</td>
                      <td>{item.category || 'other'}</td>
                      <td>{formatBytes(item.size)}</td>
                      <td>{item.last_modified ? formatDateTime(item.last_modified) : '--'}</td>
                      <td>
                        <span className={`badge ${item.supported ? 'is-success' : 'is-muted'}`}>
                          {item.supported ? '支持' : '跳过'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state small">
              {form.source_type === 's3' ? '先测试连接或扫描 Bucket，这里会展示待处理对象清单。' : '先测试连接或扫描远程目录，这里会展示待处理文件清单。'}
            </div>
          )}

          {filteredScanObjects.length ? (
            <div className="pagination">
              <span className="pagination-meta">第 {formatNumber(scanPage)} / {formatNumber(scanPageCount)} 页，共 {formatNumber(filteredScanObjects.length)} 条</span>
              <div className="toolbar-group">
                <button type="button" className="button button-small button-secondary" onClick={() => setScanPage((current) => Math.max(1, current - 1))} disabled={scanPage <= 1}>
                  上一页
                </button>
                <button type="button" className="button button-small button-secondary" onClick={() => setScanPage((current) => Math.min(scanPageCount, current + 1))} disabled={scanPage >= scanPageCount}>
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      ) : null}

      {activeWorkspaceSection === 'index' ? (
      <div className="workbench-grid">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>索引状态</h2>
              <p>支持自动或手动构建全表向量索引，便于后续检索加速。</p>
            </div>
          </div>

          <div className="index-status-list">
            {['text', 'image'].map((name) => {
              const item = indexStatus?.[name] || { row_count: 0, indices: [] }
              return (
                <div className="index-status-card" key={name}>
                  <div className="index-status-head">
                    <div className="table-primary">{name === 'text' ? '文本表' : '图像表'}</div>
                    <span className={`badge ${item.indices?.length ? 'is-success' : 'is-muted'}`}>
                      {item.indices?.length ? `${item.indices.length} 个索引` : '未建索引'}
                    </span>
                  </div>
                  <div className="kpi-value index-status-value">{formatNumber(item.row_count)}</div>
                  <div className="kpi-sub">当前表行数</div>
                  <div className="table-secondary">索引明细：{getIndicesText(item.indices)}</div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      ) : null}

    </div>
  )
}
