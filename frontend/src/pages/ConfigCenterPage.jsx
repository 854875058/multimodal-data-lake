import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Grid,
  Input,
  InputNumber,
  Message,
  Radio,
  Select,
  Spin,
  Tag,
  Typography,
} from '@arco-design/web-react'
import { IconRefresh, IconSettings } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatNumber } from '@/utils/format'

const { Row, Col } = Grid
const { Title, Text } = Typography
const Option = Select.Option

const defaultPlatformSettings = {
  gravitino_url: '', metalake: '', ray_dashboard_url: '',
  seaweedfs_master_url: '', seaweedfs_s3_url: '',
  doris_http_url: '', doris_mysql_host: '', doris_mysql_port: 9030,
  doris_database: 'default', doris_user: 'root', doris_password: '',
}

const defaultWorkbenchSettings = {
  source_type: 's3', endpoint_url: '', access_key_id: '', secret_access_key: '',
  bucket_name: '', prefix: '',
  sftp_host: '', sftp_port: 22, sftp_user: '', sftp_password: '', sftp_path: '/tmp',
  scan_limit: 200, max_files: 100, overwrite_existing: false,
  index_strategy: 'auto', index_type: 'IVF_PQ',
  build_text_index: true, build_image_index: true,
  num_partitions: '', num_sub_vectors: '',
}

const indexModeOptions = [
  { value: 'auto', label: '自动选择' },
  { value: 'none', label: '不构建索引' },
  { value: 'EMPTY', label: '留空（不指定）' },
  { value: 'IVF_FLAT', label: 'IVF_FLAT' },
  { value: 'IVF_SQ', label: 'IVF_SQ' },
  { value: 'IVF_PQ', label: 'IVF_PQ' },
  { value: 'IVF_RQ', label: 'IVF_RQ' },
  { value: 'IVF_HNSW_SQ', label: 'IVF_HNSW_SQ' },
  { value: 'IVF_HNSW_PQ', label: 'IVF_HNSW_PQ' },
]

function normalizeWorkbenchSettings(data = {}) {
  const sourceType = data?.source_type === 'sftp' ? 'sftp' : 's3'
  return {
    ...defaultWorkbenchSettings, ...data,
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
    num_sub_vectors: data?.num_sub_vectors ?? '',
  }
}

function getIndexModeValue(form) {
  if (form.index_strategy === 'none') return 'none'
  if (form.index_strategy === 'auto') return 'auto'
  return form.index_type || 'EMPTY'
}

function mapIndexModeToForm(modeValue, currentForm) {
  if (modeValue === 'auto') return { ...currentForm, index_strategy: 'auto' }
  if (modeValue === 'none') return { ...currentForm, index_strategy: 'none' }
  if (modeValue === 'EMPTY') return { ...currentForm, index_strategy: 'custom', index_type: '' }
  return { ...currentForm, index_strategy: 'custom', index_type: modeValue }
}

function buildWorkbenchPayload(form) {
  return {
    ...form,
    sftp_port: Number(form.sftp_port || 0) || defaultWorkbenchSettings.sftp_port,
    scan_limit: Number(form.scan_limit || 0) || defaultWorkbenchSettings.scan_limit,
    max_files: Number(form.max_files || 0) || defaultWorkbenchSettings.max_files,
    num_partitions: form.num_partitions === '' ? null : Number(form.num_partitions),
    num_sub_vectors: form.num_sub_vectors === '' ? null : Number(form.num_sub_vectors),
  }
}

export default function ConfigCenterPage() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState(defaultPlatformSettings)
  const [workbench, setWorkbench] = useState(defaultWorkbenchSettings)
  const [components, setComponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingPlatform, setSavingPlatform] = useState(false)
  const [savingWorkbench, setSavingWorkbench] = useState(false)
  const [testingDoris, setTestingDoris] = useState(false)

  const loadData = async () => {
    try {
      const [pRes, wRes, cRes] = await Promise.all([
        api.getPlatformSettings(), api.getWorkbenchSettings(), api.getPlatformComponentStatus(),
      ])
      setPlatform({ ...defaultPlatformSettings, ...(pRes?.data || {}) })
      setWorkbench(normalizeWorkbenchSettings(wRes?.data || {}))
      setComponents(Array.isArray(cRes?.items) ? cRes.items : [])
    } catch (e) {
      Message.error(getErrorMessage(e, '加载配置中心失败'))
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const updatePlatform = (key, value) => setPlatform((c) => ({ ...c, [key]: value }))
  const updateWorkbench = (key, value) => setWorkbench((c) => ({ ...c, [key]: value }))

  const handleSavePlatform = async () => {
    setSavingPlatform(true)
    try {
      const res = await api.savePlatformSettings(platform)
      setPlatform((c) => ({ ...c, ...(res?.data || {}) }))
      Message.success(res?.message || '平台配置已保存')
      const cRes = await api.getPlatformComponentStatus()
      setComponents(Array.isArray(cRes?.items) ? cRes.items : [])
    } catch (e) { Message.error(getErrorMessage(e, '保存平台配置失败')) }
    finally { setSavingPlatform(false) }
  }

  const handleSaveWorkbench = async () => {
    setSavingWorkbench(true)
    try {
      const res = await api.saveWorkbenchSettings(buildWorkbenchPayload(workbench))
      setWorkbench(normalizeWorkbenchSettings(res?.data || workbench))
      Message.success(res?.message || '默认来源模板已保存')
    } catch (e) { Message.error(getErrorMessage(e, '保存默认来源模板失败')) }
    finally { setSavingWorkbench(false) }
  }

  const handleTestDoris = async () => {
    setTestingDoris(true)
    try {
      const res = await api.testDorisConnection(platform)
      if (res?.connected) Message.success(res?.message || 'Doris 连接成功')
      else Message.warning(res?.message || 'Doris 连接测试完成')
      const cRes = await api.getPlatformComponentStatus('doris')
      const nextItem = Array.isArray(cRes?.items) ? cRes.items[0] : null
      if (nextItem) setComponents((c) => c.map((item) => (item.id === 'doris' ? nextItem : item)))
    } catch (e) { Message.error(getErrorMessage(e, '测试 Doris 连接失败')) }
    finally { setTestingDoris(false) }
  }

  if (loading) {
    return <div style={{ padding: 80, textAlign: 'center' }}><Spin tip="配置中心加载中..." /></div>
  }

  const defaultSourceLabel = workbench.source_type === 'sftp' ? 'SFTP' : 'S3 / SeaweedFS'
  const defaultSourceLocation = workbench.source_type === 'sftp'
    ? `${workbench.sftp_host || '--'} / ${workbench.sftp_path || '/'}`
    : `${workbench.bucket_name || '--'} / ${workbench.prefix || '/'}`
  const currentIndexModeLabel = indexModeOptions.find((o) => o.value === getIndexModeValue(workbench))?.label || getIndexModeValue(workbench)
  const onlineCount = components.filter((item) => item.online).length
  const indexMode = getIndexModeValue(workbench)

  return (
    <div style={{ padding: 20, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      {/* 页头 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>来源配置</Title>
          <Text type="secondary">统一维护平台连接和默认来源模板。接入与扫描、查询分析等页面只消费这里的保存结果。</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} onClick={loadData}>刷新配置</Button>
          <Button type="primary" onClick={() => navigate('/ingestion/source')}>前往接入与扫描</Button>
        </Space>
      </div>

      {/* 概览卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>默认来源</Text>
            <div style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 4px' }}>{defaultSourceLabel}</div>
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{defaultSourceLocation}</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>默认索引策略</Text>
            <div style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 4px' }}>{currentIndexModeLabel}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>文本 {workbench.build_text_index ? '开' : '关'} / 图像 {workbench.build_image_index ? '开' : '关'}</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>SeaweedFS S3</Text>
            <div style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 4px' }}>{platform.seaweedfs_s3_url ? '已配置' : '未配置'}</div>
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{platform.seaweedfs_s3_url || '--'}</Text>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ height: '100%' }} bodyStyle={{ padding: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>组件在线数</Text>
            <div style={{ fontSize: 18, fontWeight: 700, margin: '6px 0 4px' }}>{formatNumber(onlineCount)}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>共 {formatNumber(components.length)} 个组件</Text>
          </Card>
        </Col>
      </Row>

      {/* 配置表单 */}
      <Row gutter={16}>
        {/* 平台连接 */}
        <Col span={12}>
          <Card title="平台连接" style={{ height: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              统一管理 Gravitino、Ray、SeaweedFS 和 Doris 的地址与连接参数。
            </Text>
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Gravitino URL</Text>
                <Input value={platform.gravitino_url} onChange={(v) => updatePlatform('gravitino_url', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Metalake</Text>
                <Input value={platform.metalake} onChange={(v) => updatePlatform('metalake', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Ray Dashboard</Text>
                <Input value={platform.ray_dashboard_url} onChange={(v) => updatePlatform('ray_dashboard_url', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SeaweedFS Master</Text>
                <Input value={platform.seaweedfs_master_url} onChange={(v) => updatePlatform('seaweedfs_master_url', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SeaweedFS S3</Text>
                <Input value={platform.seaweedfs_s3_url} onChange={(v) => updatePlatform('seaweedfs_s3_url', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Doris HTTP</Text>
                <Input value={platform.doris_http_url} onChange={(v) => updatePlatform('doris_http_url', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Doris MySQL Host</Text>
                <Input value={platform.doris_mysql_host} onChange={(v) => updatePlatform('doris_mysql_host', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Doris MySQL Port</Text>
                <InputNumber value={platform.doris_mysql_port} onChange={(v) => updatePlatform('doris_mysql_port', v || 9030)} style={{ width: '100%' }} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Doris Database</Text>
                <Input value={platform.doris_database} onChange={(v) => updatePlatform('doris_database', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Doris User</Text>
                <Input value={platform.doris_user} onChange={(v) => updatePlatform('doris_user', v)} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Doris Password</Text>
                <Input.Password value={platform.doris_password} onChange={(v) => updatePlatform('doris_password', v)} />
              </Col>
            </Row>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <Button type="primary" loading={savingPlatform} onClick={handleSavePlatform}>保存平台配置</Button>
              <Button loading={testingDoris} onClick={handleTestDoris}>测试 Doris 连接</Button>
            </div>
          </Card>
        </Col>

        {/* 默认来源模板 */}
        <Col span={12}>
          <Card title="默认来源模板" style={{ height: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              统一管理接入与扫描页面默认来源、扫描和索引策略。
            </Text>

            {/* 来源类型切换 */}
            <Radio.Group
              type="button"
              value={workbench.source_type}
              onChange={(v) => updateWorkbench('source_type', v)}
              style={{ marginBottom: 16 }}
            >
              <Radio value="s3">S3 / SeaweedFS</Radio>
              <Radio value="sftp">SFTP</Radio>
            </Radio.Group>

            <Row gutter={[16, 12]}>
              {workbench.source_type === 's3' ? (
                <>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>S3 Endpoint</Text>
                    <Input value={workbench.endpoint_url} onChange={(v) => updateWorkbench('endpoint_url', v)} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Bucket</Text>
                    <Input value={workbench.bucket_name} onChange={(v) => updateWorkbench('bucket_name', v)} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Prefix</Text>
                    <Input value={workbench.prefix} onChange={(v) => updateWorkbench('prefix', v)} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Access Key</Text>
                    <Input value={workbench.access_key_id} onChange={(v) => updateWorkbench('access_key_id', v)} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Secret Key</Text>
                    <Input.Password value={workbench.secret_access_key} onChange={(v) => updateWorkbench('secret_access_key', v)} />
                  </Col>
                </>
              ) : (
                <>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SFTP Host</Text>
                    <Input value={workbench.sftp_host} onChange={(v) => updateWorkbench('sftp_host', v)} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SFTP Port</Text>
                    <InputNumber value={workbench.sftp_port} onChange={(v) => updateWorkbench('sftp_port', v)} style={{ width: '100%' }} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SFTP User</Text>
                    <Input value={workbench.sftp_user} onChange={(v) => updateWorkbench('sftp_user', v)} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SFTP Password</Text>
                    <Input.Password value={workbench.sftp_password} onChange={(v) => updateWorkbench('sftp_password', v)} />
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SFTP Path</Text>
                    <Input value={workbench.sftp_path} onChange={(v) => updateWorkbench('sftp_path', v)} />
                  </Col>
                </>
              )}

              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>扫描上限</Text>
                <InputNumber value={workbench.scan_limit} onChange={(v) => updateWorkbench('scan_limit', v)} style={{ width: '100%' }} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>导入文件数上限</Text>
                <InputNumber value={workbench.max_files} onChange={(v) => updateWorkbench('max_files', v)} style={{ width: '100%' }} />
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>索引模式</Text>
                <Select value={indexMode} onChange={(v) => setWorkbench((c) => mapIndexModeToForm(v, c))} style={{ width: '100%' }}>
                  {indexModeOptions.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </Col>
              {indexMode !== 'none' && indexMode !== 'EMPTY' && (
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>分区数</Text>
                  <InputNumber value={workbench.num_partitions} onChange={(v) => updateWorkbench('num_partitions', v)} style={{ width: '100%' }} />
                </Col>
              )}
              {['IVF_PQ', 'IVF_HNSW_PQ'].includes(indexMode) && (
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>PQ 子向量数</Text>
                  <InputNumber value={workbench.num_sub_vectors} onChange={(v) => updateWorkbench('num_sub_vectors', v)} style={{ width: '100%' }} />
                </Col>
              )}
            </Row>

            <div style={{ marginTop: 16, display: 'flex', gap: 16 }}>
              <Checkbox checked={workbench.overwrite_existing} onChange={(v) => updateWorkbench('overwrite_existing', v)}>覆盖已存在文件</Checkbox>
              <Checkbox checked={workbench.build_text_index} onChange={(v) => updateWorkbench('build_text_index', v)}>构建文本向量索引</Checkbox>
              <Checkbox checked={workbench.build_image_index} onChange={(v) => updateWorkbench('build_image_index', v)}>构建图像向量索引</Checkbox>
            </div>

            <div style={{ marginTop: 16 }}>
              <Button type="primary" loading={savingWorkbench} onClick={handleSaveWorkbench}>保存默认来源模板</Button>
            </div>
          </Card>
        </Col>
      </Row>

      <Alert
        type="info"
        style={{ marginTop: 16 }}
        content={<span>组件运行状态请前往「湖总览」查看，本页只负责配置参数维护。<a href="#/dashboard" style={{ marginLeft: 8 }}>查看运行状态</a></span>}
      />
    </div>
  )
}
