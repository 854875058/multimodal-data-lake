import { useEffect, useMemo, useState } from 'react'
import api, { getErrorMessage } from '@/api'
import WorkbenchConsole from '@/components/WorkbenchConsole'
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
  const [sourceModalOpen, setSourceModalOpen] = useState(false)
  const [scanModalOpen, setScanModalOpen] = useState(false)
  const [indexModalOpen, setIndexModalOpen] = useState(false)
  const [startConfirmOpen, setStartConfirmOpen] = useState(false)

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
      return true
    } catch (requestError) {
      setError(getErrorMessage(requestError, '启动批量导入任务失败。'))
      return false
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

  const completedJobs = jobs.filter((job) => job.status === 'completed').length
  const failedJobs = jobs.filter((job) => job.status === 'failed').length
  const currentIndexMode = getIndexModeValue(form)
  const currentIndexModeLabel = indexModeOptions.find((option) => option.value === currentIndexMode)?.label || currentIndexMode
  const totalIndexCount = (indexStatus.text?.indices?.length || 0) + (indexStatus.image?.indices?.length || 0)
  const selectedJobProgress = jobDetail ? getJobProgress(jobDetail) : 0
  const sourceModeText = getSourceTypeText(form.source_type)
  const sourceLocationText = `${getSourcePrimaryValue(form)} / ${getSourceSecondaryValue(form)}`
  const scanStatusText = scanResult.objects.length
    ? `已返回 ${formatNumber(scanResult.returned_count)} 条，支持 ${formatNumber(scanResult.eligible_count)} 条`
    : '尚未生成扫描结果'
  const selectionStatusText = selectedScanKeys.length
    ? `当前已勾选 ${formatNumber(selectedScanKeys.length)} 条，启动任务时优先导入勾选项`
    : `当前未勾选对象，启动任务时按扫描结果与上限 ${formatNumber(form.max_files)} 自动选取`
  const handleConfirmStart = async () => {
    const success = await handleStartJob()
    if (success) {
      setStartConfirmOpen(false)
    }
  }

  const handleSelectJob = async (jobId) => {
    if (!jobId) {
      return
    }
    setSelectedJobId(jobId)
    await loadJobDetail(jobId, true)
  }

  if (loading) {
    return <div className="loading-state">工作台加载中...</div>
  }

  return (
    <WorkbenchConsole
      vm={{
        banner,
        error,
        form,
        scanResult,
        indexStatus,
        connectionData,
        filteredJobs,
        jobDetail,
        selectedJobId,
        selectedScanKeys,
        pagedScanObjects,
        filteredScanObjects,
        filteredSupportedScanObjects,
        scanPage,
        scanPageCount,
        scanPageSize,
        scanCategories,
        scanCategoryFilter,
        scanKeyword,
        scanSupportedOnly,
        jobStatusFilter,
        jobKeyword,
        jobSort,
        refreshing,
        saving,
        testing,
        scanning,
        starting,
        buildingIndex,
        sourceModalOpen,
        scanModalOpen,
        indexModalOpen,
        startConfirmOpen,
        jobModalOpen,
        activeJobs,
        completedJobs,
        failedJobs,
        currentIndexMode,
        currentIndexModeLabel,
        selectionStatusText,
        sourceModeText,
        sourceLocationText,
        scanStatusText,
        totalIndexCount,
        selectedJobProgress
      }}
      actions={{
        onNavigateUpload: () => navigate('/upload'),
        onRefresh: () => refreshAll(true),
        onOpenSourceModal: () => setSourceModalOpen(true),
        onCloseSourceModal: () => setSourceModalOpen(false),
        onOpenScanModal: () => setScanModalOpen(true),
        onCloseScanModal: () => setScanModalOpen(false),
        onOpenIndexModal: () => setIndexModalOpen(true),
        onCloseIndexModal: () => setIndexModalOpen(false),
        onOpenStartConfirm: () => setStartConfirmOpen(true),
        onCloseStartConfirm: () => setStartConfirmOpen(false),
        onCloseJobModal: closeJobModal,
        onInputChange: handleInputChange,
        onSourceTypeChange: handleSourceTypeChange,
        onSave: handleSave,
        onTestConnection: handleTestConnection,
        onScan: handleScan,
        onBuildIndex: handleBuildIndex,
        onConfirmStart: handleConfirmStart,
        onSelectAllScanObjects: selectAllScanObjects,
        onClearSelectedScanObjects: clearSelectedScanObjects,
        onToggleScanSelection: toggleScanSelection,
        onSetScanCategoryFilter: (value) => {
          setScanCategoryFilter(value)
          setScanPage(1)
        },
        onSetScanPageSize: (value) => {
          setScanPageSize(value)
          setScanPage(1)
        },
        onSetScanKeyword: (value) => {
          setScanKeyword(value)
          setScanPage(1)
        },
        onSetScanSupportedOnly: (value) => {
          setScanSupportedOnly(value)
          setScanPage(1)
        },
        onSetScanPage: setScanPage,
        onSetJobStatusFilter: setJobStatusFilter,
        onSetJobKeyword: setJobKeyword,
        onSetJobSort: setJobSort,
        onSelectJob: handleSelectJob,
        onOpenJobDetail: async (jobId) => {
          if (jobId) {
            await handleViewJobDetail(jobId)
            return
          }
          setJobModalOpen(true)
        },
        onReuseJobConfig: handleReuseJobConfig,
        onCancelJob: handleCancelJob,
        onCopyLogs: handleCopyLogs,
        onExportLogs: handleExportLogs
      }}
      helpers={{
        formatNumber,
        formatBytes,
        formatDateTime,
        getSourceTypeText,
        getSourcePrimaryLabel,
        getSourcePrimaryValue,
        getSourceSecondaryLabel,
        getSourceSecondaryValue,
        getJobBadgeClass,
        getJobStatusText,
        getJobCompactStats,
        getJobProgress,
        getJobResultSummary,
        getConnectionSummary,
        getIndicesText,
        sourceTypeOptions,
        indexModeOptions,
        showPartitionField,
        showSubVectorField,
        scanPageSizeOptions,
        jobStatusOptions,
        jobSortOptions
      }}
    />
  )
}
