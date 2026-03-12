import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60000
})

function normalizeErrorPayload(value) {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object') {
          return item.msg || item.message || JSON.stringify(item)
        }
        return ''
      })
      .filter(Boolean)
    return parts.join('；') || '请求失败'
  }

  if (value && typeof value === 'object') {
    return value.msg || value.message || JSON.stringify(value)
  }

  return String(value || '').trim()
}

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const detail = error?.response?.data?.detail
    const rawMessage = error?.response?.data?.message || detail || error.message || '请求失败'
    error.message = normalizeErrorPayload(rawMessage) || '请求失败'
    return Promise.reject(error)
  }
)

function buildFileParams(page = 1, pageSize = 20, docType = 'all') {
  const params = {
    page,
    page_size: pageSize
  }

  if (docType && docType !== 'all') {
    params.doc_type = docType
  }

  return params
}

const api = {
  uploadFiles(files) {
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })
    return apiClient.post('/upload/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  search(query, mode = 'text', limit = 10) {
    return apiClient.post('/search/', { query, mode, limit })
  },

  getFiles(page = 1, pageSize = 20, docType = 'all') {
    return apiClient.get('/files/list', {
      params: buildFileParams(page, pageSize, docType)
    })
  },

  previewFile(fileHash) {
    return apiClient.get(`/files/preview/${encodeURIComponent(fileHash)}`)
  },

  getFileContentUrl(fileHash) {
    return `/api/files/content/${encodeURIComponent(fileHash)}`
  },

  deleteFile(fileHash) {
    return apiClient.delete(`/files/${encodeURIComponent(fileHash)}`)
  },

  getDashboardStats() {
    return apiClient.get('/dashboard/stats')
  },

  getTrend(days = 7) {
    return apiClient.get('/dashboard/trend', { params: { days } })
  },

  getFileTypes() {
    return apiClient.get('/dashboard/file-types')
  },

  getEntities(fileHash = null) {
    return apiClient.get('/dashboard/entities', {
      params: fileHash ? { file_hash: fileHash } : {}
    })
  },

  getKnowledgeGraph() {
    return apiClient.get('/dashboard/knowledge-graph')
  },

  getSystemResources() {
    return apiClient.get('/system/resources')
  },

  getSystemStatus() {
    return apiClient.get('/system/status')
  },

  getLogs(lines = 500) {
    return apiClient.get('/system/logs', { params: { lines } })
  },

  getWorkbenchSettings() {
    return apiClient.get('/workbench/settings')
  },

  saveWorkbenchSettings(payload) {
    return apiClient.post('/workbench/settings', payload)
  },

  testWorkbenchConnection(payload) {
    return apiClient.post('/workbench/test-connection', payload)
  },

  scanWorkbenchSource(payload) {
    return apiClient.post('/workbench/scan', payload)
  },

  startWorkbenchJob(payload) {
    return apiClient.post('/workbench/jobs', payload)
  },

  getWorkbenchJobs(limit = 20) {
    return apiClient.get('/workbench/jobs', { params: { limit } })
  },

  getWorkbenchJob(jobId) {
    return apiClient.get(`/workbench/jobs/${encodeURIComponent(jobId)}`)
  },

  cancelWorkbenchJob(jobId) {
    return apiClient.post(`/workbench/jobs/${encodeURIComponent(jobId)}/cancel`)
  },

  getWorkbenchIndexStatus() {
    return apiClient.get('/workbench/index-status')
  },

  buildWorkbenchIndex(payload) {
    return apiClient.post('/workbench/build-index', payload)
  },

  getPlatformSettings() {
    return apiClient.get('/platform/settings')
  },

  savePlatformSettings(payload) {
    return apiClient.post('/platform/settings', payload)
  },

  getAssetCatalogs() {
    return apiClient.get('/platform/assets/catalogs')
  },

  getAssetSchemas(catalog) {
    return apiClient.get('/platform/assets/schemas', { params: { catalog } })
  },

  getAssetTables(catalog, schema) {
    return apiClient.get('/platform/assets/tables', { params: { catalog, schema } })
  },

  getAssetDetail(catalog, schema, table, limit = 8) {
    return apiClient.get('/platform/assets/detail', { params: { catalog, schema, table, limit } })
  },

  getExternalTables() {
    return apiClient.get('/platform/doris/external-tables')
  },

  testDorisConnection(payload) {
    return apiClient.post('/platform/doris/test-connection', payload)
  },

  createExternalTable(payload) {
    return apiClient.post('/platform/doris/external-tables', payload)
  },

  executeDorisSql(payload) {
    return apiClient.post('/platform/doris/sql', payload)
  },

  convertNlToSql(payload) {
    return apiClient.post('/platform/doris/nl2sql', payload)
  },

  convertNlToVector(payload) {
    return apiClient.post('/platform/doris/nl2vector', payload)
  },

  getWorkflowPresets() {
    return apiClient.get('/platform/workflow/presets')
  },

  buildWorkflowJob(payload) {
    return apiClient.post('/platform/workflow/build-job', payload)
  }
}

export function getErrorMessage(error, fallback = '请求失败') {
  const message = normalizeErrorPayload(error?.message)
  return message || fallback
}

export default api
