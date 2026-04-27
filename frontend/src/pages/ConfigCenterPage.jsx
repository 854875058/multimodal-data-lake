import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import { formatDateTime, formatNumber } from '@/utils/format'

const defaultPlatformSettings = {
  gravitino_url: '',
  metalake: '',
  ray_dashboard_url: '',
  seaweedfs_master_url: '',
  seaweedfs_s3_url: '',
  doris_http_url: '',
  doris_mysql_host: '',
  doris_mysql_port: 9030,
  doris_database: 'default',
  doris_user: 'root',
  doris_password: ''
}

const defaultWorkbenchSettings = {
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

const sourceTypeOptions = [
  { value: 's3', label: 'S3 / SeaweedFS', hint: '作为平台主接入路径的默认配置' },
  { value: 'sftp', label: 'SFTP', hint: '作为补充来源的默认配置' }
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

function normalizeWorkbenchSettings(data = {}) {
  const sourceType = data?.source_type === 'sftp' ? 'sftp' : 's3'
  return {
    ...defaultWorkbenchSettings,
    ...data,
    source_type: sourceType,
    sftp_host: String(data?.sftp_host || ''),
    sftp_port: Number(data?.sftp_port ?? defaultWorkbenchSettings.sftp_port),
    sftp_user: String(data?.sftp_user || ''),
    sftp_password: String(data?.sftp_password || ''),
    sftp_path: String(data?.sftp_path || defaultWorkbenchSettings.sftp_path),
    scan_limit: Number(data?.scan_limit ?? defaultWorkbenchSettings.scan_limit),
    max_files: Number(data?.max_files ?? defaultWorkbenchSettings.max_files),
    overwrite_existing: Boolean(data?.overwrite_existing),
    index_strategy: data?.index_strategy || 'auto',
    index_type: data?.index_type ?? defaultWorkbenchSettings.index_type,
    build_text_index: data?.build_text_index ?? true,
    build_image_index: data?.build_image_index ?? true,
    num_partitions: data?.num_partitions ?? '',
    num_sub_vectors: data?.num_sub_vectors ?? ''
  }
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
    return { ...currentForm, index_strategy: 'auto' }
  }
  if (modeValue === 'none') {
    return { ...currentForm, index_strategy: 'none' }
  }
  if (modeValue === 'EMPTY') {
    return { ...currentForm, index_strategy: 'custom', index_type: '' }
  }
  return { ...currentForm, index_strategy: 'custom', index_type: modeValue }
}

function buildWorkbenchPayload(form) {
  return {
    ...form,
    sftp_port: Number(form.sftp_port || 0) || defaultWorkbenchSettings.sftp_port,
    scan_limit: Number(form.scan_limit || 0) || defaultWorkbenchSettings.scan_limit,
    max_files: Number(form.max_files || 0) || defaultWorkbenchSettings.max_files,
    num_partitions: form.num_partitions === '' ? null : Number(form.num_partitions),
    num_sub_vectors: form.num_sub_vectors === '' ? null : Number(form.num_sub_vectors)
  }
}

export default function ConfigCenterPage() {
  const navigate = useNavigate()
  const [platformSettings, setPlatformSettings] = useState(defaultPlatformSettings)
  const [workbenchSettings, setWorkbenchSettings] = useState(defaultWorkbenchSettings)
  const [componentStatus, setComponentStatus] = useState([])
  const [banner, setBanner] = useState({ type: '', message: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingPlatform, setSavingPlatform] = useState(false)
  const [savingWorkbench, setSavingWorkbench] = useState(false)
  const [testingDoris, setTestingDoris] = useState(false)

  const loadData = async () => {
    setError('')
    try {
      const [platformResponse, workbenchResponse, componentResponse] = await Promise.all([
        api.getPlatformSettings(),
        api.getWorkbenchSettings(),
        api.getPlatformComponentStatus()
      ])

      setPlatformSettings({ ...defaultPlatformSettings, ...(platformResponse?.data || {}) })
      setWorkbenchSettings(normalizeWorkbenchSettings(workbenchResponse?.data || {}))
      setComponentStatus(Array.isArray(componentResponse?.items) ? componentResponse.items : [])
    } catch (requestError) {
      setError(getErrorMessage(requestError, '加载配置中心失败。'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const updatePlatformField = (key, value) => {
    setPlatformSettings((current) => ({ ...current, [key]: value }))
  }

  const updateWorkbenchField = (key, value) => {
    setWorkbenchSettings((current) => ({ ...current, [key]: value }))
  }

  const handleWorkbenchInputChange = (event) => {
    const { name, value, type, checked } = event.target
    if (type === 'checkbox') {
      updateWorkbenchField(name, checked)
      return
    }

    if (name === 'index_mode') {
      setWorkbenchSettings((current) => mapIndexModeToForm(value, current))
      return
    }

    if (['sftp_port', 'scan_limit', 'max_files', 'num_partitions', 'num_sub_vectors'].includes(name)) {
      updateWorkbenchField(name, value === '' ? '' : Number(value))
      return
    }

    updateWorkbenchField(name, value)
  }

  const handleSavePlatform = async () => {
    setSavingPlatform(true)
    setError('')
    try {
      const response = await api.savePlatformSettings(platformSettings)
      setPlatformSettings((current) => ({ ...current, ...(response?.data || {}) }))
      setBanner({ type: 'success', message: response?.message || '平台配置已保存。' })
      const componentResponse = await api.getPlatformComponentStatus()
      setComponentStatus(Array.isArray(componentResponse?.items) ? componentResponse.items : [])
    } catch (requestError) {
      setError(getErrorMessage(requestError, '保存平台配置失败。'))
    } finally {
      setSavingPlatform(false)
    }
  }

  const handleSaveWorkbench = async () => {
    setSavingWorkbench(true)
    setError('')
    try {
      const response = await api.saveWorkbenchSettings(buildWorkbenchPayload(workbenchSettings))
      setWorkbenchSettings(normalizeWorkbenchSettings(response?.data || workbenchSettings))
      setBanner({ type: 'success', message: response?.message || '默认来源模板已保存。' })
    } catch (requestError) {
      setError(getErrorMessage(requestError, '保存默认来源模板失败。'))
    } finally {
      setSavingWorkbench(false)
    }
  }

  const handleTestDoris = async () => {
    setTestingDoris(true)
    setError('')
    try {
      const response = await api.testDorisConnection(platformSettings)
      setBanner({ type: response?.connected ? 'success' : 'warning', message: response?.message || 'Doris 连接测试完成。' })
      const componentResponse = await api.getPlatformComponentStatus('doris')
      const nextItem = Array.isArray(componentResponse?.items) ? componentResponse.items[0] : null
      if (nextItem) {
        setComponentStatus((current) => current.map((item) => (item.id === 'doris' ? nextItem : item)))
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, '测试 Doris 连接失败。'))
    } finally {
      setTestingDoris(false)
    }
  }

  if (loading) {
    return <div className="loading-state">配置中心加载中...</div>
  }

  const defaultSourceLabel = workbenchSettings.source_type === 'sftp' ? 'SFTP' : 'S3 / SeaweedFS'
  const defaultSourceLocation = workbenchSettings.source_type === 'sftp'
    ? `${workbenchSettings.sftp_host || '--'} / ${workbenchSettings.sftp_path || '/'}`
    : `${workbenchSettings.bucket_name || '--'} / ${workbenchSettings.prefix || '/'}`
  const currentIndexModeLabel = indexModeOptions.find((option) => option.value === getIndexModeValue(workbenchSettings))?.label || getIndexModeValue(workbenchSettings)
  const onlineCount = componentStatus.filter((item) => item.online).length

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">来源配置</h1>
          <p className="page-subtitle">统一维护平台连接和默认来源模板。接入与扫描、查询分析等页面只消费这里的保存结果，不再各自承担配置入口。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={loadData}>
            刷新配置
          </button>
          <button type="button" className="button button-primary" onClick={() => navigate('/workbench')}>
            前往接入与扫描
          </button>
        </div>
      </div>

      {banner.message ? <div className={`${banner.type}-banner`}>{banner.message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="glass-card workbench-console-panel">
        <div className="workbench-guide-strip">
          <span className="badge">Source Config</span>
          <span className="workbench-guide-copy">这里维护的是全局来源配置和平台连接，不直接执行扫描或导入任务。真正的扫描、筛选和批量入湖请去"接入与扫描"。</span>
        </div>

        <div className="workbench-summary-grid">
          <div className="workbench-summary-card">
            <div className="kpi-label">默认来源</div>
            <div className="workbench-summary-value">{defaultSourceLabel}</div>
            <div className="workbench-summary-note mono">{defaultSourceLocation}</div>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">默认索引策略</div>
            <div className="workbench-summary-value">{currentIndexModeLabel}</div>
            <div className="workbench-summary-note">文本索引 {workbenchSettings.build_text_index ? '开启' : '关闭'} / 图像索引 {workbenchSettings.build_image_index ? '开启' : '关闭'}</div>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">SeaweedFS S3</div>
            <div className="workbench-summary-value">{platformSettings.seaweedfs_s3_url ? '已配置' : '未配置'}</div>
            <div className="workbench-summary-note mono">{platformSettings.seaweedfs_s3_url || '--'}</div>
          </div>
          <div className="workbench-summary-card">
            <div className="kpi-label">组件在线数</div>
            <div className="workbench-summary-value">{formatNumber(onlineCount)}</div>
            <div className="workbench-summary-note">共 {formatNumber(componentStatus.length)} 个组件已纳入巡检视图</div>
          </div>
        </div>
      </section>

      <div className="query-top-grid">
        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>平台连接</h2>
              <p>统一管理 Gravitino、Ray、SeaweedFS 和 Doris 的地址与连接参数，避免散落在各个功能页里。</p>
            </div>
          </div>

          <div className="query-settings-grid">
            <div className="field">
              <label htmlFor="gravitino_url">Gravitino URL</label>
              <input id="gravitino_url" className="input" value={platformSettings.gravitino_url} onChange={(event) => updatePlatformField('gravitino_url', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="metalake">Metalake</label>
              <input id="metalake" className="input" value={platformSettings.metalake} onChange={(event) => updatePlatformField('metalake', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ray_dashboard_url">Ray Dashboard</label>
              <input id="ray_dashboard_url" className="input" value={platformSettings.ray_dashboard_url} onChange={(event) => updatePlatformField('ray_dashboard_url', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="seaweedfs_master_url">SeaweedFS Master</label>
              <input id="seaweedfs_master_url" className="input" value={platformSettings.seaweedfs_master_url} onChange={(event) => updatePlatformField('seaweedfs_master_url', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="seaweedfs_s3_url">SeaweedFS S3</label>
              <input id="seaweedfs_s3_url" className="input" value={platformSettings.seaweedfs_s3_url} onChange={(event) => updatePlatformField('seaweedfs_s3_url', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="doris_http_url">Doris HTTP</label>
              <input id="doris_http_url" className="input" value={platformSettings.doris_http_url} onChange={(event) => updatePlatformField('doris_http_url', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="doris_mysql_host">Doris MySQL Host</label>
              <input id="doris_mysql_host" className="input" value={platformSettings.doris_mysql_host} onChange={(event) => updatePlatformField('doris_mysql_host', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="doris_mysql_port">Doris MySQL Port</label>
              <input id="doris_mysql_port" className="input" type="number" value={platformSettings.doris_mysql_port} onChange={(event) => updatePlatformField('doris_mysql_port', Number(event.target.value || 9030))} />
            </div>
            <div className="field">
              <label htmlFor="doris_database">Doris Database</label>
              <input id="doris_database" className="input" value={platformSettings.doris_database} onChange={(event) => updatePlatformField('doris_database', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="doris_user">Doris User</label>
              <input id="doris_user" className="input" value={platformSettings.doris_user} onChange={(event) => updatePlatformField('doris_user', event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="doris_password">Doris Password</label>
              <input id="doris_password" className="input" type="password" value={platformSettings.doris_password} onChange={(event) => updatePlatformField('doris_password', event.target.value)} />
            </div>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-primary" onClick={handleSavePlatform} disabled={savingPlatform}>
              {savingPlatform ? '保存中...' : '保存平台配置'}
            </button>
            <button type="button" className="button button-secondary" onClick={handleTestDoris} disabled={testingDoris}>
              {testingDoris ? '测试中...' : '测试 Doris 连接'}
            </button>
          </div>
        </section>

        <section className="glass-card">
          <div className="card-header">
            <div>
              <h2>默认来源模板</h2>
              <p>统一管理接入与扫描页面默认来源、扫描和索引策略，避免每次进入工作台都手工重填。</p>
            </div>
          </div>

          <div className="workbench-source-toggle">
            {sourceTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`workbench-source-chip ${workbenchSettings.source_type === option.value ? 'is-active' : ''}`}
                onClick={() => setWorkbenchSettings((current) => ({ ...current, source_type: option.value }))}
              >
                <span className="workbench-source-chip-title">{option.label}</span>
                <span className="workbench-source-chip-hint">{option.hint}</span>
              </button>
            ))}
          </div>

          <div className="workbench-form-grid">
            {workbenchSettings.source_type === 's3' ? (
              <>
                <div className="field">
                  <label htmlFor="endpoint_url">S3 Endpoint</label>
                  <input id="endpoint_url" name="endpoint_url" className="input" value={workbenchSettings.endpoint_url} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="bucket_name">Bucket</label>
                  <input id="bucket_name" name="bucket_name" className="input" value={workbenchSettings.bucket_name} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="prefix">Prefix</label>
                  <input id="prefix" name="prefix" className="input" value={workbenchSettings.prefix} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="access_key_id">Access Key</label>
                  <input id="access_key_id" name="access_key_id" className="input" value={workbenchSettings.access_key_id} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="secret_access_key">Secret Key</label>
                  <input id="secret_access_key" name="secret_access_key" type="password" className="input" value={workbenchSettings.secret_access_key} onChange={handleWorkbenchInputChange} />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="sftp_host">SFTP Host</label>
                  <input id="sftp_host" name="sftp_host" className="input" value={workbenchSettings.sftp_host} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="sftp_port">SFTP Port</label>
                  <input id="sftp_port" name="sftp_port" type="number" className="input" value={workbenchSettings.sftp_port} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="sftp_user">SFTP User</label>
                  <input id="sftp_user" name="sftp_user" className="input" value={workbenchSettings.sftp_user} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="sftp_password">SFTP Password</label>
                  <input id="sftp_password" name="sftp_password" type="password" className="input" value={workbenchSettings.sftp_password} onChange={handleWorkbenchInputChange} />
                </div>
                <div className="field">
                  <label htmlFor="sftp_path">SFTP Path</label>
                  <input id="sftp_path" name="sftp_path" className="input" value={workbenchSettings.sftp_path} onChange={handleWorkbenchInputChange} />
                </div>
              </>
            )}

            <div className="field">
              <label htmlFor="scan_limit">扫描上限</label>
              <input id="scan_limit" name="scan_limit" type="number" className="input" value={workbenchSettings.scan_limit} onChange={handleWorkbenchInputChange} />
            </div>
            <div className="field">
              <label htmlFor="max_files">导入文件数上限</label>
              <input id="max_files" name="max_files" type="number" className="input" value={workbenchSettings.max_files} onChange={handleWorkbenchInputChange} />
            </div>
            <div className="field">
              <label htmlFor="index_mode">索引模式</label>
              <select id="index_mode" name="index_mode" className="select" value={getIndexModeValue(workbenchSettings)} onChange={handleWorkbenchInputChange}>
                {indexModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {showPartitionField(getIndexModeValue(workbenchSettings)) ? (
              <div className="field">
                <label htmlFor="num_partitions">分区数</label>
                <input id="num_partitions" name="num_partitions" type="number" className="input" value={workbenchSettings.num_partitions} onChange={handleWorkbenchInputChange} />
              </div>
            ) : null}
            {showSubVectorField(getIndexModeValue(workbenchSettings)) ? (
              <div className="field">
                <label htmlFor="num_sub_vectors">PQ 子向量数</label>
                <input id="num_sub_vectors" name="num_sub_vectors" type="number" className="input" value={workbenchSettings.num_sub_vectors} onChange={handleWorkbenchInputChange} />
              </div>
            ) : null}
          </div>

          <div className="workbench-switch-grid">
            <label className="checkbox-field">
              <input type="checkbox" name="overwrite_existing" checked={workbenchSettings.overwrite_existing} onChange={handleWorkbenchInputChange} />
              <span>覆盖已存在文件</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" name="build_text_index" checked={workbenchSettings.build_text_index} onChange={handleWorkbenchInputChange} />
              <span>构建文本向量索引</span>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" name="build_image_index" checked={workbenchSettings.build_image_index} onChange={handleWorkbenchInputChange} />
              <span>构建图像向量索引</span>
            </label>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-primary" onClick={handleSaveWorkbench} disabled={savingWorkbench}>
              {savingWorkbench ? '保存中...' : '保存默认来源模板'}
            </button>
          </div>
        </section>
      </div>

      <section className="glass-card">
        <div className="card-header">
          <div>
            <h2>组件状态总览</h2>
            <p>当前平台关键组件状态汇总，便于统一确认配置是否生效。</p>
          </div>
        </div>

        <div className="platform-service-grid dashboard-service-grid">
          {componentStatus.map((item) => (
            <div className="platform-service-card" key={item.id}>
              <div className="platform-service-head">
                <div className="platform-service-title">{item.title}</div>
                <span className={`badge ${item.online ? 'is-success' : 'is-warning'}`}>{item.status}</span>
              </div>
              <div className="platform-service-meta mono">{item.endpoint || '--'}</div>
              <div className="platform-service-note">{item.note}</div>
              <div className="platform-service-probe">最后探测：{item.probed_at ? formatDateTime(item.probed_at) : '--'}</div>
              <div className="toolbar-group" style={{ marginTop: 10 }}>
                <button type="button" className="button button-small button-ghost" onClick={() => navigate(item.action_route || '/dashboard')}>
                  去对应页面
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
