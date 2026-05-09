import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Empty,
  Grid,
  Input,
  InputNumber,
  Message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tree,
  Typography,
} from '@arco-design/web-react'
import {
  IconCommand,
  IconCopy,
  IconDelete,
  IconHistory,
  IconImage,
  IconPlayArrow,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconStorage,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { truncateText } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Col, Row } = Grid
const TabPane = Tabs.TabPane
const Option = Select.Option

const DORIS_BASE = '/api/doris'

const PAGE_MAP = {
  sql: 'SQL 查询工作台',
  retrieval: '统一检索工作台',
  copilot: 'AI 数据副驾驶',
  annotation: '自动化标注工作台',
  vector: '统一检索工作台',
  multimodal: '统一检索工作台',
  hybrid: '统一检索工作台',
  nl2sql: 'SQL 查询工作台',
}

const RETRIEVAL_PRESET_MAP = {
  retrieval: 'semantic',
  vector: 'semantic',
  multimodal: 'visual',
  hybrid: 'hybrid',
}

const COPILOT_EXAMPLES = [
  '最近 7 天有哪些车辆闯入监控告警，给我相关样本',
  '上个月导入最多的图片资产类型是什么，顺便给我相关图片',
  '找出与设备异常外观相关的样本，并按告警等级汇总',
]

const COPILOT_SEED_SESSIONS = [
  { id: 's-1', title: '告警样本分析', updatedAt: '今天 14:32', messages: [] },
  { id: 's-2', title: '相似图片检索', updatedAt: '今天 10:18', messages: [] },
]

const COPILOT_FILTER_DEFAULTS = {
  event_type: '',
  alarm_level: '',
  order_status: '',
  city_name: '',
  county_name: '',
  town_name: '',
  device_name: '',
  algorithm_name: '',
  confidence_min: undefined,
  confidence_max: undefined,
  lat: undefined,
  lon: undefined,
  radius_km: 5,
}

const FILTER_LABELS = {
  event_type: '事件类型',
  alarm_level: '告警等级',
  order_status: '工单状态',
  city_name: '城市',
  county_name: '区县',
  town_name: '街道',
  device_name: '设备名称',
  algorithm_name: '算法名称',
  confidence_min: '置信度下限',
  confidence_max: '置信度上限',
  lat: '纬度',
  lon: '经度',
  radius_km: '半径(km)',
}

async function dorisGet(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  const response = await fetch(url.toString(), { credentials: 'include' })
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  return response.json()
}

async function dorisPost(path, body = {}) {
  const response = await fetch(DORIS_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  return response.json()
}

async function dorisDelete(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  const response = await fetch(url.toString(), {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  return response.json()
}

function buildTableColumns(columns = []) {
  return columns.map((column) => ({
    title: column,
    dataIndex: column,
    ellipsis: true,
    render: (value) => (value == null ? <Text type="secondary">NULL</Text> : <Text code>{String(value)}</Text>),
  }))
}

function ResultSummary({ result }) {
  if (!result) return null

  return (
    <Space style={{ marginBottom: 10 }} size="large" wrap>
      {result.elapsed != null ? (
        <Text type="secondary">
          耗时 <Text code>{result.elapsed}s</Text>
        </Text>
      ) : null}
      {result.affectedRows != null ? (
        <Text type="secondary">
          影响 <Text code>{result.affectedRows}</Text> 行
        </Text>
      ) : null}
      {Array.isArray(result.rows) && Array.isArray(result.columns) && result.columns.length > 0 ? (
        <Text type="secondary">
          返回 <Text code>{result.rows.length}</Text> 行
        </Text>
      ) : null}
      {result.hasMore ? <Tag color="orange">结果已截断</Tag> : null}
      {result.message ? <Text type="secondary">{result.message}</Text> : null}
    </Space>
  )
}

function QueryPageFrame({ title, subtitle, summaryItems, children, actions = null }) {
  return (
    <div className="prd-page">
      <div className="prd-page-head">
        <div className="prd-page-head-copy">
          <Title heading={5} style={{ margin: 0 }}>{title}</Title>
          <Text type="secondary">{subtitle}</Text>
        </div>
        {actions ? <div className="prd-page-actions">{actions}</div> : null}
      </div>

      {summaryItems?.length ? (
        <div className="prd-summary-band">
          {summaryItems.map((item) => (
            <div key={item.key} className="prd-summary-item">
              <div className="k">{item.label}</div>
              <div className="v">{item.value}</div>
              <div className="m">{item.meta}</div>
            </div>
          ))}
        </div>
      ) : null}

      {children}
    </div>
  )
}

function DetailField({ label, value, copyable = false }) {
  if (!value) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '76px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
      <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
      <Text
        style={{ fontSize: 12, lineHeight: 1.6, wordBreak: 'break-all' }}
        copyable={copyable ? { text: String(value) } : false}
      >
        {String(value)}
      </Text>
    </div>
  )
}

function getFirstMediaPath(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) || ''
}

function openMultimodalMedia(path, kind = 'image') {
  const mediaPath = getFirstMediaPath(path)
  if (!mediaPath) return
  window.open(api.getMultimodalMediaUrl(mediaPath, kind), '_blank', 'noopener,noreferrer')
}

function MediaThumb({ path, alt = 'preview', kind = 'image', width = 84, height = 64 }) {
  const mediaPath = getFirstMediaPath(path)
  if (!mediaPath) return null

  return (
    <img
      src={api.getMultimodalMediaUrl(mediaPath, kind)}
      alt={alt}
      onClick={() => openMultimodalMedia(mediaPath, kind)}
      style={{
        width,
        height,
        objectFit: 'cover',
        borderRadius: 8,
        border: '1px solid var(--color-border-2)',
        cursor: 'pointer',
        background: 'var(--color-bg-2)',
        display: 'block',
      }}
    />
  )
}

function SearchResultCard({ item, index }) {
  const [detailVisible, setDetailVisible] = useState(false)
  const isMultimodalCard = Boolean(
    item.event_type || item.alarm_time || item.address || item.device_name || item.img_src_path || item.video_path
  )
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'image'].includes(String(item.doc_type || '').toLowerCase()) || isMultimodalCard
  const imagePath = getFirstMediaPath(item.img_src_path || item.source_uri)
  const iconPath = getFirstMediaPath(item.img_icon_path)
  const videoPath = getFirstMediaPath(item.video_path)
  const relatedImages = Array.isArray(item.related_image_paths) ? item.related_image_paths.filter(Boolean) : []
  const thumbnailUrl = isMultimodalCard
    ? (imagePath ? api.getMultimodalMediaUrl(imagePath, 'image') : '')
    : (item.file_hash && isImage ? api.getFileContentUrl(item.file_hash) : '')
  const previewText = item.summary || item.description || item.text || '当前结果暂无文本摘要。'

  return (
    <Card bodyStyle={{ padding: 14 }} hoverable>
      <div style={{ display: 'grid', gridTemplateColumns: isImage ? '104px minmax(0, 1fr)' : '1fr', gap: 14 }}>
        {isImage ? (
          <div
            style={{
              width: 104,
              height: 84,
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--color-fill-1)',
              border: '1px solid var(--color-border-2)',
            }}
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={item.doc_name || 'preview'}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-3)',
                  background: 'linear-gradient(135deg, rgba(22,93,255,0.08), rgba(54,207,201,0.12))',
                }}
              >
                <IconImage style={{ fontSize: 24 }} />
              </div>
            )}
          </div>
        ) : null}

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <Title heading={6} style={{ margin: 0 }}>
                {item.doc_name || '未命名资产'}
              </Title>
              <Space size="small" style={{ marginTop: 6 }} wrap>
                <Tag color="arcoblue">{item.doc_type || 'unknown'}</Tag>
                {item.event_type ? <Tag color="orangered">{item.event_type}</Tag> : null}
                {item.alarm_level ? <Tag color="gold">等级 {item.alarm_level}</Tag> : null}
                {item.order_status ? <Tag color="purple">工单 {item.order_status}</Tag> : null}
                {item.score != null ? (
                  <Tag color="purple">RRF {Number(item.score).toFixed(4)}</Tag>
                ) : (
                  <Tag color="green">距离 {Number(item.distance ?? 0).toFixed(4)}</Tag>
                )}
              </Space>
            </div>
            <Tag>#{index + 1}</Tag>
          </div>

          <Paragraph type="secondary" style={{ margin: '10px 0 8px' }}>
            {truncateText(previewText, isMultimodalCard ? 160 : 220)}
          </Paragraph>

          {isMultimodalCard ? (
            <div
              style={{
                display: 'grid',
                gap: 8,
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                background: 'var(--color-fill-1)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <DetailField label="告警时间" value={item.alarm_time} />
              <DetailField label="采集时间" value={item.captured_at} />
              <DetailField label="设备点位" value={item.device_name} />
              <DetailField label="告警地址" value={item.address} />
              <DetailField label="算法" value={item.algorithm_name} />
              <DetailField label="原图路径" value={item.img_src_path || item.source_uri} copyable />
              <DetailField label="标注路径" value={item.img_icon_path} copyable />
              <DetailField label="视频路径" value={item.video_path} copyable />
              <Space size="small" wrap>
                {imagePath ? (
                  <Button size="small" icon={<IconImage />} onClick={() => openMultimodalMedia(imagePath, 'image')}>
                    查看图片
                  </Button>
                ) : null}
                {iconPath ? (
                  <Button size="small" onClick={() => openMultimodalMedia(iconPath, 'image')}>
                    查看标注图
                  </Button>
                ) : null}
                {videoPath ? (
                  <Button size="small" icon={<IconPlayArrow />} onClick={() => openMultimodalMedia(videoPath, 'video')}>
                    播放视频
                  </Button>
                ) : null}
                {(imagePath || iconPath || videoPath || relatedImages.length) ? (
                  <Button size="small" type="outline" onClick={() => setDetailVisible((value) => !value)}>
                    {detailVisible ? '收起详情' : '展开详情'}
                  </Button>
                ) : null}
              </Space>
              {relatedImages.length ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>同源关联图</Text>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {relatedImages.slice(0, 6).map((path) => (
                      <MediaThumb key={path} path={path} alt="related" width={56} height={42} />
                    ))}
                  </div>
                </div>
              ) : null}
              {detailVisible ? (
                <div
                  style={{
                    marginTop: 4,
                    borderRadius: 10,
                    overflow: 'hidden',
                    background: '#fff',
                    border: '1px solid var(--color-border-2)',
                  }}
                >
                  <Tabs
                    type="rounded"
                    defaultActiveTab={imagePath ? 'origin' : iconPath ? 'icon' : videoPath ? 'video' : 'related'}
                    size="small"
                    style={{ padding: 10 }}
                  >
                    {imagePath ? (
                      <TabPane key="origin" title="原图">
                        <div style={{ display: 'grid', gap: 10 }}>
                          <img
                            src={api.getMultimodalMediaUrl(imagePath, 'image')}
                            alt="origin"
                            style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, background: '#00000008' }}
                          />
                          <Button size="small" icon={<IconImage />} style={{ width: 'fit-content' }} onClick={() => openMultimodalMedia(imagePath, 'image')}>
                            打开原图
                          </Button>
                        </div>
                      </TabPane>
                    ) : null}
                    {iconPath ? (
                      <TabPane key="icon" title="标注图">
                        <div style={{ display: 'grid', gap: 10 }}>
                          <img
                            src={api.getMultimodalMediaUrl(iconPath, 'image')}
                            alt="annotation"
                            style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, background: '#00000008' }}
                          />
                          <Button size="small" style={{ width: 'fit-content' }} onClick={() => openMultimodalMedia(iconPath, 'image')}>
                            打开标注图
                          </Button>
                        </div>
                      </TabPane>
                    ) : null}
                    {videoPath ? (
                      <TabPane key="video" title="视频">
                        <div style={{ display: 'grid', gap: 10 }}>
                          <video
                            src={api.getMultimodalMediaUrl(videoPath, 'video')}
                            controls
                            style={{ width: '100%', maxHeight: 260, borderRadius: 8, background: '#000' }}
                          />
                          <Button size="small" icon={<IconPlayArrow />} style={{ width: 'fit-content' }} onClick={() => openMultimodalMedia(videoPath, 'video')}>
                            打开视频
                          </Button>
                        </div>
                      </TabPane>
                    ) : null}
                    {relatedImages.length ? (
                      <TabPane key="related" title={`关联图 (${relatedImages.length})`}>
                        <div style={{ display: 'grid', gap: 10 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            同源视频关联样本
                          </Text>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {relatedImages.slice(0, 12).map((path) => (
                              <MediaThumb key={path} path={path} alt="related" width={88} height={66} />
                            ))}
                          </div>
                        </div>
                      </TabPane>
                    ) : null}
                  </Tabs>
                </div>
              ) : null}
            </div>
          ) : null}
          <Text type="secondary" style={{ fontSize: 11, marginTop: 10, display: 'block' }}>
            来源：{item.source_uri || '本地入库'}
          </Text>
        </div>
      </div>
    </Card>
  )
}

function SearchResultList({ results, searched, emptyText = '没有匹配结果' }) {
  if (!searched) return <Empty description="输入检索内容后开始查询" />
  if (!results.length) return <Empty description={emptyText} />

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {results.map((item, index) => (
        <SearchResultCard key={`${item.file_hash || item.id || index}-${index}`} item={item} index={index} />
      ))}
    </div>
  )
}

function JourneyStep({ title, status, detail, time }) {
  const colorMap = {
    done: '#1B9E5C',
    running: '#165dff',
    error: '#D63B3B',
    pending: '#86909c',
  }
  const bgMap = {
    done: 'rgba(27, 158, 92, 0.08)',
    running: 'rgba(22, 93, 255, 0.08)',
    error: 'rgba(214, 59, 59, 0.08)',
    pending: 'rgba(134, 144, 156, 0.08)',
  }
  const textMap = {
    done: '完成',
    running: '执行中',
    error: '失败',
    pending: '待执行',
  }
  const statusColor = colorMap[status] || colorMap.pending
  const statusBg = bgMap[status] || bgMap.pending

  return (
    <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${statusBg}`, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>{title}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {time ? <Text type="secondary" style={{ fontSize: 11 }}>{time}</Text> : null}
          <Tag color={statusColor} style={{ background: statusBg, border: 'none' }}>
            {textMap[status] || textMap.pending}
          </Tag>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{detail}</div>
    </div>
  )
}

function compactFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  )
}

function formatFilters(filters = {}) {
  const entries = Object.entries(compactFilters(filters))
  if (!entries.length) return '未启用高级筛选'
  return entries.map(([key, value]) => `${FILTER_LABELS[key] || key}: ${value}`).join(' / ')
}

function SqlWorkspaceTab() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [databases, setDatabases] = useState([])
  const [tablesByDb, setTablesByDb] = useState({})
  const [expandedKeys, setExpandedKeys] = useState([])
  const [subTab, setSubTab] = useState('editor')
  const [sql, setSql] = useState('SELECT file_hash, doc_name, doc_type, source_uri FROM files LIMIT 20;')
  const [result, setResult] = useState(null)
  const [executing, setExecuting] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产，并按 doc_type 分组统计')
  const [generatedSql, setGeneratedSql] = useState('')
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    dorisGet('/clusters')
      .then((data) => {
        const list = data.clusters || []
        setClusters(list)
        if (list.length > 0) setClusterId(list[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!clusterId) return
    setDatabases([])
    setTablesByDb({})
    setExpandedKeys([])
    dorisGet('/sql/databases', { cluster_id: clusterId })
      .then((data) => setDatabases(data.databases || []))
      .catch(() => {})
  }, [clusterId])

  useEffect(() => {
    if (subTab === 'history') {
      loadHistory()
    }
  }, [clusterId, subTab])

  const loadTables = async (db) => {
    if (tablesByDb[db]) return
    try {
      const data = await dorisGet('/sql/tables', { cluster_id: clusterId, database: db })
      setTablesByDb((current) => ({ ...current, [db]: data.tables || [] }))
    } catch {
      // ignore
    }
  }

  const loadHistory = async () => {
    if (!clusterId) return
    setHistoryLoading(true)
    try {
      const data = await dorisGet('/sql/history', { cluster_id: clusterId, limit: 50 })
      setHistory(data.history || [])
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!sql.trim()) {
      Message.warning('请输入 SQL')
      return
    }
    if (!clusterId) {
      Message.warning('请先选择集群')
      return
    }
    setExecuting(true)
    setResult(null)
    try {
      const data = await dorisPost('/sql/execute', { cluster_id: clusterId, sql: sql.trim(), limit: 500 })
      if (!data.success) {
        Message.error(data.detail || '执行失败')
        return
      }
      setResult({
        columns: data.columns || [],
        rows: data.rows || [],
        affectedRows: data.affected_rows,
        elapsed: data.elapsed,
        hasMore: data.has_more,
        message: data.message,
      })
      if (subTab === 'history') {
        loadHistory()
      }
    } catch (error) {
      Message.error(`执行失败: ${error.message}`)
    } finally {
      setExecuting(false)
    }
  }

  const handleGenerateSql = async () => {
    if (!nlPrompt.trim()) {
      Message.warning('请输入自然语言问题')
      return
    }
    setConverting(true)
    try {
      const data = await api.convertNlToSql({ prompt: nlPrompt.trim(), top_k: 10 })
      setGeneratedSql(data?.sql || '')
      if (data?.sql) {
        setSql(data.sql)
        setSubTab('editor')
      }
      Message.success(data?.reasoning || '已生成 SQL 草案')
    } catch (error) {
      Message.error(getErrorMessage(error, 'SQL 生成失败'))
    } finally {
      setConverting(false)
    }
  }

  const applyGeneratedSql = async () => {
    if (!generatedSql) return
    setSql(generatedSql)
    setSubTab('editor')
    try {
      await navigator.clipboard?.writeText(generatedSql)
    } catch {
      // ignore
    }
    Message.success('SQL 已写入编辑器并复制到剪贴板')
  }

  const insertTable = (db, tableName) => {
    setSql(`SELECT * FROM \`${db}\`.\`${tableName}\` LIMIT 100;`)
    setSubTab('editor')
  }

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      handleExecute()
    }
  }

  const treeData = databases.map((db) => ({
    key: `db:${db}`,
    title: (
      <span>
        <IconStorage style={{ marginRight: 6, color: 'var(--color-text-3)' }} />
        {db}
      </span>
    ),
    children: (tablesByDb[db] || []).map((tableName) => ({
      key: `tbl:${db}:${tableName}`,
      title: (
        <span style={{ cursor: 'pointer' }} onClick={() => insertTable(db, tableName)}>
          <IconCommand style={{ marginRight: 6, color: 'var(--color-text-3)' }} />
          {tableName}
        </span>
      ),
      isLeaf: true,
    })),
  }))

  const historyColumns = [
    { title: '时间', dataIndex: 'created_at', width: 170 },
    {
      title: '状态',
      dataIndex: 'success',
      width: 90,
      render: (value) => (value ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>),
    },
    {
      title: '耗时(s)',
      dataIndex: 'elapsed',
      width: 90,
      render: (value) => <Text code>{value ?? '--'}</Text>,
    },
    {
      title: '返回行',
      width: 90,
      render: (_, row) => <Text code>{row.rows_returned || row.affected_rows || 0}</Text>,
    },
    {
      title: 'SQL',
      dataIndex: 'sql',
      ellipsis: true,
      render: (value) => <Text code style={{ fontSize: 12 }}>{value}</Text>,
    },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_, row) => (
        <Button
          type="text"
          size="small"
          onClick={() => {
            setSql(row.sql || '')
            setSubTab('editor')
          }}
        >
          回填
        </Button>
      ),
    },
  ]

  const summaryItems = [
    {
      key: 'cluster',
      label: '当前集群',
      value: clusters.find((item) => item.id === clusterId)?.name || '未选择集群',
      meta: '编辑器、对象树和 SQL 历史都绑定在当前集群下。',
    },
    {
      key: 'mode',
      label: '查询方式',
      value: '自然语言 + SQL',
      meta: '先生成草案，再继续编辑执行，适合分析师和数据人员协同验证。',
    },
    {
      key: 'editor',
      label: '快捷执行',
      value: 'Ctrl + Enter',
      meta: '支持从历史记录和对象树快速回填 SQL。',
    },
    {
      key: 'history',
      label: '执行历史',
      value: `${history.length} 条`,
      meta: '保留执行轨迹，方便复用和回看。',
    },
  ]

  return (
    <QueryPageFrame
      title="SQL 查询工作台"
      subtitle="统一承接 NL2SQL、编辑执行与历史回放，用来做结构化分析、结果校验和汇报取数。"
      summaryItems={summaryItems}
      actions={(
        <>
          <Text type="secondary">集群</Text>
          <Select placeholder="选择集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 220 }}>
            {clusters.map((cluster) => (
              <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>
            ))}
          </Select>
          <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>
            刷新历史
          </Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={<Space><IconCommand />自然语言转 SQL</Space>} bodyStyle={{ padding: 16 }}>
            <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0 }}>
              输入业务问题，系统先给出 SQL 草案，再写入右侧编辑器，便于继续调优和执行。
            </Paragraph>
            <TextArea
              value={nlPrompt}
              onChange={setNlPrompt}
              autoSize={{ minRows: 5, maxRows: 8 }}
              placeholder="例如：查询最近 7 天导入的图片资产，并按 doc_type 分组统计"
            />
            <Space style={{ marginTop: 12 }} wrap>
              <Button type="primary" icon={<IconCommand />} onClick={handleGenerateSql} loading={converting}>
                生成 SQL
              </Button>
              <Button icon={<IconCopy />} onClick={applyGeneratedSql} disabled={!generatedSql}>
                写入编辑器
              </Button>
            </Space>
            {generatedSql ? (
              <Card size="small" style={{ marginTop: 12, background: 'var(--color-fill-1)' }}>
                <Text code copyable style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{generatedSql}</Text>
              </Card>
            ) : null}
          </Card>

          <Card
            title={<Space><IconStorage />数据库对象</Space>}
            extra={(
              <Select size="small" placeholder="集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 140 }}>
                {clusters.map((cluster) => (
                  <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>
                ))}
              </Select>
            )}
            bodyStyle={{ padding: 8, maxHeight: 560, overflow: 'auto' }}
          >
            {clusters.length === 0 ? (
              <Empty description="请先在运维模块配置集群" />
            ) : databases.length === 0 ? (
              <Empty description="暂无数据库对象" />
            ) : (
              <Tree
                treeData={treeData}
                expandedKeys={expandedKeys}
                blockNode
                onExpand={(keys, { node }) => {
                  setExpandedKeys(keys)
                  if (String(node._key || '').startsWith('db:')) {
                    loadTables(String(node._key).slice(3))
                  }
                }}
              />
            )}
          </Card>
        </div>

        <Card bodyStyle={{ padding: 0 }}>
          <Tabs activeTab={subTab} onChange={setSubTab} style={{ padding: '0 16px' }}>
            <TabPane key="editor" title={<span><IconCommand /> SQL 编辑器</span>} />
            <TabPane key="history" title={<span><IconHistory /> 执行历史</span>} />
          </Tabs>

          {subTab === 'editor' ? (
            <div style={{ padding: 16 }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button type="primary" icon={<IconPlayArrow />} onClick={handleExecute} loading={executing} disabled={!clusterId}>
                  执行 SQL
                </Button>
                <Text type="secondary">快捷键 Ctrl + Enter</Text>
              </Space>
              <TextArea
                value={sql}
                onChange={setSql}
                onKeyDown={handleKeyDown}
                placeholder="输入 SQL，或先用左侧自然语言生成"
                style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }}
                autoSize={{ minRows: 10, maxRows: 18 }}
              />

              {result ? (
                <div style={{ marginTop: 16 }}>
                  <ResultSummary result={result} />
                  {result.columns.length > 0 ? (
                    <Table
                      columns={buildTableColumns(result.columns)}
                      data={result.rows}
                      rowKey={(_, index) => index}
                      pagination={{ pageSize: 20 }}
                      scroll={{ x: 'max-content' }}
                      size="small"
                      border
                    />
                  ) : (
                    <Empty description="无结果集" />
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ padding: 16 }}>
              <Space style={{ marginBottom: 12 }} wrap>
                <Button icon={<IconRefresh />} onClick={loadHistory} loading={historyLoading} disabled={!clusterId}>
                  刷新
                </Button>
                <Popconfirm
                  title="确认清空当前集群的 SQL 执行历史？"
                  onOk={async () => {
                    await dorisDelete('/sql/history', { cluster_id: clusterId })
                    Message.success('历史已清空')
                    loadHistory()
                  }}
                >
                  <Button status="danger" icon={<IconDelete />} disabled={!clusterId}>
                    清空历史
                  </Button>
                </Popconfirm>
              </Space>
              <Table
                columns={historyColumns}
                data={history}
                loading={historyLoading}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 960 }}
                border
              />
            </div>
          )}
        </Card>
      </div>
    </QueryPageFrame>
  )
}

function RetrievalWorkspaceTab({ initialStrategy = 'semantic' }) {
  const [strategy, setStrategy] = useState(initialStrategy)
  const [query, setQuery] = useState(
    initialStrategy === 'visual' ? '查找设备异常外观相关的图片样本' : '夜间巡检异常样本'
  )
  const [limit, setLimit] = useState(12)
  const [rrfK, setRrfK] = useState(60)
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [routeText, setRouteText] = useState('等待执行')
  const [routeMeta, setRouteMeta] = useState('系统会根据当前策略生成检索路径。')
  const [messageText, setMessageText] = useState('')

  useEffect(() => {
    setStrategy(initialStrategy)
  }, [initialStrategy])

  useEffect(() => {
    if (initialStrategy === 'visual') {
      setQuery('查找设备异常外观相关的图片样本')
    } else if (initialStrategy === 'hybrid') {
      setQuery('查询最近导入的异常图片，并补充相似外观样本')
    } else {
      setQuery('夜间巡检异常样本')
    }
  }, [initialStrategy])

  const summaryItems = [
    {
      key: 'strategy',
      label: '当前策略',
      value: strategy === 'semantic' ? '语义检索' : strategy === 'visual' ? '文搜图' : '混合检索',
      meta: strategy === 'hybrid'
        ? '同时利用关键词和向量召回，适合复杂业务问题。'
        : '统一在一个工作台内切换，不再拆成多个页面。',
    },
    {
      key: 'limit',
      label: '结果规模',
      value: `${limit} 条`,
      meta: '适合演示召回效果，也方便快速抽样查看命中分布。',
    },
    {
      key: 'route',
      label: '检索路径',
      value: routeText,
      meta: routeMeta,
    },
    {
      key: 'count',
      label: '当前命中',
      value: searched ? `${results.length} 条` : '--',
      meta: messageText || '执行后会展示召回资产与检索说明。',
    },
  ]

  const run = async () => {
    if (!query.trim()) {
      Message.warning('请输入检索内容')
      return
    }

    setSearching(true)
    setResults([])
    setMessageText('')
    try {
      if (strategy === 'hybrid') {
        const response = await api.search(query.trim(), 'hybrid', { limit, rrf_k: rrfK })
        if (!response.success) throw new Error(response.message || '检索失败')
        setResults(Array.isArray(response.results) ? response.results : [])
        setMessageText(response.message || '')
        setRouteText('自然语言 -> 关键词检索 + 向量召回 -> RRF 融合')
        setRouteMeta(`RRF k=${rrfK}，适合需要结构化条件和语义相似度同时生效的场景。`)
      } else {
        const vectorGuide = await api.convertNlToVector({ prompt: query.trim(), top_k: limit })
        const guide = vectorGuide?.data || {}
        const mode = strategy === 'visual' ? 'image' : (guide.mode || 'text')
        const response = await api.search(query.trim(), mode, limit)
        if (!response.success) throw new Error(response.message || '检索失败')
        setResults(Array.isArray(response.results) ? response.results : [])
        setMessageText(guide.command_text || '')
        setRouteText(mode === 'image' ? '自然语言 -> 图像向量检索' : '自然语言 -> 文本语义检索')
        setRouteMeta(guide.command_text || '已根据当前问题生成可追溯的检索指令。')
      }
      setSearched(true)
    } catch (error) {
      setResults([])
      setSearched(true)
      Message.error(getErrorMessage(error, '检索失败'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <QueryPageFrame
      title="统一检索工作台"
      subtitle="把语义检索、文搜图和混合检索合并到同一入口，按任务切换策略，不按底层实现拆页。"
      summaryItems={summaryItems}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title={<Space><IconSearch />检索输入</Space>} bodyStyle={{ padding: 16 }}>
            <div>
              <Text type="secondary">检索策略</Text>
              <Select value={strategy} onChange={setStrategy} style={{ width: '100%', marginTop: 6 }}>
                <Option value="semantic">语义检索</Option>
                <Option value="visual">文搜图</Option>
                <Option value="hybrid">混合检索</Option>
              </Select>
            </div>

            <div style={{ marginTop: 12 }}>
              <Text type="secondary">检索内容</Text>
              <TextArea
                value={query}
                onChange={setQuery}
                autoSize={{ minRows: 5, maxRows: 9 }}
                style={{ marginTop: 6 }}
                placeholder={
                  strategy === 'visual'
                    ? '例如：查找红色告警标识、设备机柜外壳破损或夜间低照度场景'
                    : strategy === 'hybrid'
                      ? '例如：查询最近导入的异常图片，并补充相似外观样本'
                      : '例如：夜间巡检异常样本、PDF 质检报告摘要、相似文本片段'
                }
              />
            </div>

            <Row gutter={12} style={{ marginTop: 4 }}>
              <Col span={12}>
                <Text type="secondary">Top K</Text>
                <InputNumber value={limit} onChange={setLimit} min={1} max={100} style={{ width: '100%', marginTop: 6 }} />
              </Col>
              <Col span={12}>
                <Text type="secondary">RRF K</Text>
                <InputNumber value={rrfK} onChange={setRrfK} min={10} max={200} disabled={strategy !== 'hybrid'} style={{ width: '100%', marginTop: 6 }} />
              </Col>
            </Row>

            <Button
              type="primary"
              icon={strategy === 'visual' ? <IconImage /> : <IconSearch />}
              onClick={run}
              loading={searching}
              style={{ marginTop: 16, width: '100%' }}
            >
              开始检索
            </Button>
          </Card>

          <Card title="策略说明" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <JourneyStep
                title="语义检索"
                status={strategy === 'semantic' ? 'running' : 'pending'}
                detail="适合文本语义、摘要内容和相似描述，优先走文本向量召回。"
              />
              <JourneyStep
                title="文搜图"
                status={strategy === 'visual' ? 'running' : 'pending'}
                detail="适合查相似图片、异常外观和跨模态样本，优先走图像向量召回。"
              />
              <JourneyStep
                title="混合检索"
                status={strategy === 'hybrid' ? 'running' : 'pending'}
                detail="适合同时需要关键词过滤和语义理解的复杂问题，结果会做融合重排。"
              />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messageText ? <div className="prd-code-block">{messageText}</div> : null}

          <Card title="检索结果" bodyStyle={{ padding: 16 }}>
            <SearchResultList
              results={results}
              searched={searched}
              emptyText={strategy === 'hybrid' ? '当前问题下没有可融合结果' : '当前描述下没有找到相关资产'}
            />
          </Card>
        </div>
      </div>
    </QueryPageFrame>
  )
}

function AnnotationWorkbenchTab() {
  const [datasetName, setDatasetName] = useState('tower_eye')
  const [scopeType, setScopeType] = useState('dataset')
  const [sampleLimit, setSampleLimit] = useState(50)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewManifest, setReviewManifest] = useState('')
  const [reviewStats, setReviewStats] = useState(null)
  const [reviewer, setReviewer] = useState('reviewer')
  const [reviewOrigin, setReviewOrigin] = useState('review')
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    api.getMultimodalSummary(datasetName)
      .then((response) => setSummary(response?.data || null))
      .catch(() => setSummary(null))
  }, [datasetName])

  const exportReviewManifest = async () => {
    setReviewBusy(true)
    try {
      const response = await api.exportMultimodalReview({ dataset_name: datasetName, limit: sampleLimit })
      const payload = response?.data || {}
      const records = Array.isArray(payload.records) ? payload.records : []
      setReviewManifest(JSON.stringify(records, null, 2))
      setReviewStats({ count: payload.count || records.length, mode: 'export' })
      Message.success(`已导出 ${payload.count || records.length} 条标注样本`)
    } catch (error) {
      Message.error(getErrorMessage(error, '导出标注样本失败'))
    } finally {
      setReviewBusy(false)
    }
  }

  const importReviewManifest = async () => {
    let records = []
    try {
      records = JSON.parse(reviewManifest || '[]')
    } catch {
      Message.error('标注清单 JSON 格式不正确')
      return
    }

    setReviewBusy(true)
    try {
      const response = await api.importMultimodalReview({
        dataset_name: datasetName,
        reviewer,
        origin: reviewOrigin,
        records,
      })
      const payload = response?.data || {}
      setReviewStats({ count: payload.annotations || 0, mode: 'import' })
      Message.success(`已导入 ${payload.annotations || 0} 条人工标注`)
    } catch (error) {
      Message.error(getErrorMessage(error, '导入标注清单失败'))
    } finally {
      setReviewBusy(false)
    }
  }

  const summaryItems = [
    {
      key: 'target',
      label: '当前对象',
      value: scopeType === 'dataset' ? '数据集级' : '资产级',
      meta: '自动化标注不再和副驾驶混在一起，单独按对象范围组织。',
    },
    {
      key: 'dataset',
      label: '数据集',
      value: datasetName,
      meta: '当前默认接入 Lance 中的多模态检测数据集。',
    },
    {
      key: 'sample',
      label: '导出规模',
      value: `${sampleLimit} 条`,
      meta: '用于演示预标、复核和标注回流链路。',
    },
    {
      key: 'stats',
      label: '资产总量',
      value: summary?.asset_count ?? '--',
      meta: summary?.overview_text || '优先把标注链路做成可演示、可回流、可继续增强的章节。',
    },
  ]

  return (
    <QueryPageFrame
      title="自动化标注工作台"
      subtitle="面向数据集和资产做标注样本导出、人工复核回流和后续自动化标注扩展，不再塞进副驾驶页面。"
      summaryItems={summaryItems}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="任务配置" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <Text type="secondary">对象范围</Text>
                <Select value={scopeType} onChange={setScopeType} style={{ width: '100%', marginTop: 6 }}>
                  <Option value="dataset">数据集级标注</Option>
                  <Option value="asset">资产级标注</Option>
                </Select>
              </div>
              <div>
                <Text type="secondary">数据集名称</Text>
                <Input value={datasetName} onChange={setDatasetName} style={{ marginTop: 6 }} placeholder="tower_eye" />
              </div>
              <div>
                <Text type="secondary">导出样本数</Text>
                <InputNumber value={sampleLimit} onChange={setSampleLimit} min={1} max={500} style={{ width: '100%', marginTop: 6 }} />
              </div>
              <div>
                <Text type="secondary">标注人</Text>
                <Input value={reviewer} onChange={setReviewer} style={{ marginTop: 6 }} placeholder="reviewer" />
              </div>
              <div>
                <Text type="secondary">回流来源</Text>
                <Input value={reviewOrigin} onChange={setReviewOrigin} style={{ marginTop: 6 }} placeholder="review" />
              </div>
            </div>

            <Space wrap style={{ marginTop: 16 }}>
              <Button loading={reviewBusy} onClick={exportReviewManifest}>导出标注样本</Button>
              <Button type="primary" loading={reviewBusy} onClick={importReviewManifest}>导入人工标注</Button>
              <Button icon={<IconCopy />} disabled={!reviewManifest} onClick={() => navigator.clipboard?.writeText(reviewManifest)}>
                复制 JSON
              </Button>
            </Space>
          </Card>

          <Card title="能力拆分" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <JourneyStep title="样本导出" status="done" detail="从 Lance 表中抽取待标注或待复核样本，用于演示数据集级、资产级标注入口。" />
              <JourneyStep title="人工复核" status="done" detail="导出的清单可直接补齐框选、标签和备注，再通过回流接口写回标注表。" />
              <JourneyStep title="自动化增强" status="pending" detail="下一步把预标模型、批量任务和结果质检继续独立做进这一章，不和副驾驶混排。" />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reviewStats ? (
            <Card bodyStyle={{ padding: 14 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {reviewStats.mode === 'import'
                  ? `本次已写入 ${reviewStats.count} 条标注`
                  : `本次已导出 ${reviewStats.count} 条样本`}
              </Text>
            </Card>
          ) : null}

          <Card title="标注清单 JSON" bodyStyle={{ padding: 16 }}>
            <Paragraph style={{ marginTop: 0 }}>
              当前先把数据集 / 资产的标注入口独立出来。这里承接样本导出、人工补标和回流写入，后续自动预标任务继续往这里扩。
            </Paragraph>
            <TextArea
              value={reviewManifest}
              onChange={setReviewManifest}
              autoSize={{ minRows: 18, maxRows: 30 }}
              placeholder='[{ "asset_id": "...", "annotations": [{ "label": "车辆", "bbox": [0.1, 0.2, 0.3, 0.4] }] }]'
            />
          </Card>
        </div>
      </div>
    </QueryPageFrame>
  )
}

function CopilotTab() {
  const [sessions, setSessions] = useState(COPILOT_SEED_SESSIONS)
  const [activeSessionId, setActiveSessionId] = useState(COPILOT_SEED_SESSIONS[0].id)
  const [question, setQuestion] = useState('上个月导入最多的图片资产类型是什么，顺便给我相关样本')
  const [running, setRunning] = useState(false)
  const [latestRoute, setLatestRoute] = useState('等待提问')
  const [latestToolSummary, setLatestToolSummary] = useState('副驾驶会在提问后展示本次使用的工具与数据资源。')
  const [filters, setFilters] = useState(COPILOT_FILTER_DEFAULTS)
  const [traceLoading, setTraceLoading] = useState(false)
  const [traceItems, setTraceItems] = useState([])
  const [traceStats, setTraceStats] = useState(null)
  const [selectedTraceId, setSelectedTraceId] = useState('')
  const [traceDetail, setTraceDetail] = useState(null)

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || sessions[0],
    [activeSessionId, sessions]
  )

  const patchAssistant = (sessionId, patch) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        messages: session.messages.map((message, index) => {
          if (index !== session.messages.length - 1 || message.role !== 'assistant') return message
          return { ...message, ...patch }
        }),
      }
    }))
  }

  const patchStep = (sessionId, key, patch) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        messages: session.messages.map((message, index) => {
          if (index !== session.messages.length - 1 || message.role !== 'assistant') return message
          return {
            ...message,
            steps: message.steps.map((step) => (step.key === key ? { ...step, ...patch } : step)),
          }
        }),
      }
    }))
  }

  const createEmptyAssistantBlock = (currentQuestion) => ({
    traceId: '',
    intent: 'pending',
    route: '等待决策',
    filters: compactFilters(filters),
    context: {},
    sql: '',
    sqlResult: null,
    searchResults: [],
    summary: '',
    followups: [],
    steps: [
      { key: 'intent', title: '理解问题', status: 'running', detail: `正在解析“${currentQuestion}”中的对象、时间范围与结果诉求。`, time: '识别中' },
      { key: 'plan', title: '路由决策', status: 'pending', detail: '等待确定走统计、列表、检索或双路融合。', time: '' },
      { key: 'draft', title: '生成查询', status: 'pending', detail: '等待生成 SQL 草案或检索指令。', time: '' },
      { key: 'execute', title: '执行验证', status: 'pending', detail: '等待执行并返回结果。', time: '' },
      { key: 'summary', title: '整理结论', status: 'pending', detail: '等待组织结论、追问建议和结果摘要。', time: '' },
    ],
  })

  const loadTraces = async (sessionId = activeSessionId, keepSelected = true) => {
    setTraceLoading(true)
    try {
      const [listResponse, statsResponse] = await Promise.all([
        api.listMultimodalTraces({ session_id: sessionId, limit: 20 }),
        api.getMultimodalTraceStats(),
      ])
      const items = Array.isArray(listResponse?.data?.items) ? listResponse.data.items : []
      setTraceItems(items)
      setTraceStats(statsResponse?.data || null)
      if (!keepSelected && items.length) {
        setSelectedTraceId(items[0].trace_id)
      }
    } catch (error) {
      Message.error(getErrorMessage(error, '加载查询轨迹失败'))
    } finally {
      setTraceLoading(false)
    }
  }

  const loadTraceDetail = async (traceId) => {
    if (!traceId) {
      setTraceDetail(null)
      return
    }
    try {
      const response = await api.getMultimodalTraceDetail(traceId)
      setTraceDetail(response?.data || null)
      setSelectedTraceId(traceId)
    } catch (error) {
      Message.error(getErrorMessage(error, '加载轨迹详情失败'))
    }
  }

  useEffect(() => {
    loadTraces(activeSessionId, false)
  }, [activeSessionId])

  const createSession = () => {
    const nextId = `s-${Date.now()}`
    const session = {
      id: nextId,
      title: '新会话',
      updatedAt: '刚刚',
      messages: [],
    }
    setSessions((current) => [session, ...current])
    setActiveSessionId(nextId)
    setSelectedTraceId('')
    setTraceDetail(null)
  }

  const clearSession = () => {
    setSessions((current) => current.map((session) => (
      session.id === activeSessionId ? { ...session, messages: [], title: '新会话', updatedAt: '刚刚' } : session
    )))
    setSelectedTraceId('')
    setTraceDetail(null)
  }

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const resetFilters = () => {
    setFilters(COPILOT_FILTER_DEFAULTS)
  }

  const sendQuestion = async (presetQuestion = '') => {
    const currentQuestion = (presetQuestion || question).trim()
    if (!currentQuestion) {
      Message.warning('请输入问题')
      return
    }

    const sessionId = activeSessionId
    const displayTitle = truncateText(currentQuestion, 14)
    const assistantSeed = createEmptyAssistantBlock(currentQuestion)
    const compactedFilters = compactFilters(filters)

    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session
      return {
        ...session,
        title: displayTitle,
        updatedAt: '刚刚',
        messages: [
          ...session.messages,
          { role: 'user', question: currentQuestion, createdAt: '刚刚', filters: compactedFilters },
          { role: 'assistant', createdAt: '处理中', ...assistantSeed },
        ],
      }
    }))

    setQuestion('')
    setRunning(true)
    setLatestRoute('正在分析')
    setLatestToolSummary('正在调用多模态查询链路，准备执行过滤、联查和结果组织。')

    try {
      const response = await api.queryMultimodalAgent({
        question: currentQuestion,
        dataset_name: 'tower_eye',
        limit: 8,
        session_id: sessionId,
        filters: compactedFilters,
      })
      const data = response?.data || {}
      const routeLabel = data.route || '多模态检测副驾驶'
      const sqlResult = data.sql_result || null
      const searchResults = Array.isArray(data.search_results) ? data.search_results : []
      const summary = data.summary || ''
      const followups = Array.isArray(data.followups) ? data.followups : []
      const steps = Array.isArray(data.steps) ? data.steps : assistantSeed.steps

      patchAssistant(sessionId, {
        createdAt: '刚刚',
        traceId: data.trace_id || '',
        intent: data.intent || '',
        route: routeLabel,
        steps,
        sql: data.sql || '',
        sqlResult,
        searchResults,
        summary,
        followups,
        filters: data.filters || compactedFilters,
        context: data.context || {},
      })

      setLatestRoute(routeLabel)
      setLatestToolSummary(data.tool_summary || '已切换到真实多模态检测数据查询链路。')
      await loadTraces(sessionId, false)
      if (data.trace_id) {
        await loadTraceDetail(data.trace_id)
      }
    } catch (error) {
      patchStep(sessionId, 'execute', {
        status: 'error',
        detail: getErrorMessage(error, '执行失败'),
        time: '失败',
      })
      patchStep(sessionId, 'summary', {
        status: 'error',
        detail: '本轮未形成可展示结果，建议补充对象类型、时间范围或更明确的业务条件。',
        time: '',
      })
      patchAssistant(sessionId, {
        createdAt: '失败',
        summary: '当前问题未命中可展示结果，建议缩小范围后重试。',
        followups: ['限定最近 7 天后重试', '明确资产类型后重试'],
      })
      Message.error(getErrorMessage(error, '副驾驶执行失败'))
    } finally {
      setRunning(false)
    }
  }

  const summaryItems = [
    { key: 'entry', label: '主入口形态', value: '多轮对话', meta: '围绕当前会话持续追加条件、复用上下文和轨迹。' },
    { key: 'route', label: '最近一次路径', value: latestRoute, meta: '每次问答都会明确显示当前走的是统计、列表还是检索路径。' },
    { key: 'session', label: '当前会话', value: activeSession?.title || '未选择', meta: `${activeSession?.messages?.length || 0} 条消息，已接入会话级 trace 归档。` },
    { key: 'tools', label: '执行说明', value: running ? '执行中' : '已就绪', meta: latestToolSummary },
  ]

  return (
    <QueryPageFrame
      title="AI 数据副驾驶"
      subtitle="把 Tower-Eye 的多模态检测问答、筛选、媒体详情和查询轨迹并到当前湖仓里。"
      summaryItems={summaryItems}
      actions={(
        <>
          <Button onClick={createSession}>新建会话</Button>
          <Button status="danger" onClick={clearSession}>清空当前会话</Button>
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 340px', gap: 16 }}>
        <Card title="会话列表" bodyStyle={{ padding: 12 }}>
          <Button type="primary" style={{ width: '100%', marginBottom: 12 }} onClick={createSession}>新建会话</Button>
          <div style={{ display: 'grid', gap: 8 }}>
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveSessionId(session.id)}
                style={{
                  textAlign: 'left',
                  padding: 12,
                  borderRadius: 10,
                  border: session.id === activeSessionId ? '1px solid rgba(22, 93, 255, 0.35)' : '1px solid var(--color-border-2)',
                  background: session.id === activeSessionId ? 'rgba(22, 93, 255, 0.06)' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-1)' }}>{session.title}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-3)' }}>{session.updatedAt}</div>
              </button>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="高级筛选" bodyStyle={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <Input size="small" value={filters.event_type} onChange={(value) => updateFilter('event_type', value)} placeholder="事件类型" />
              <Select size="small" value={filters.alarm_level} onChange={(value) => updateFilter('alarm_level', value)} allowClear placeholder="告警等级">
                <Option value="01">等级 01</Option>
                <Option value="02">等级 02</Option>
                <Option value="03">等级 03</Option>
              </Select>
              <Select size="small" value={filters.order_status} onChange={(value) => updateFilter('order_status', value)} allowClear placeholder="工单状态">
                <Option value="1">待处理</Option>
                <Option value="2">处理中</Option>
                <Option value="4">已完成</Option>
                <Option value="6">已关闭</Option>
              </Select>
              <Input size="small" value={filters.city_name} onChange={(value) => updateFilter('city_name', value)} placeholder="城市" />
              <Input size="small" value={filters.county_name} onChange={(value) => updateFilter('county_name', value)} placeholder="区县" />
              <Input size="small" value={filters.town_name} onChange={(value) => updateFilter('town_name', value)} placeholder="街道/乡镇" />
              <Input size="small" value={filters.device_name} onChange={(value) => updateFilter('device_name', value)} placeholder="设备名称模糊匹配" />
              <Input size="small" value={filters.algorithm_name} onChange={(value) => updateFilter('algorithm_name', value)} placeholder="算法名称模糊匹配" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <InputNumber size="small" min={0} max={1} step={0.05} value={filters.confidence_min} onChange={(value) => updateFilter('confidence_min', value)} placeholder="置信度下限" />
                <InputNumber size="small" min={0} max={1} step={0.05} value={filters.confidence_max} onChange={(value) => updateFilter('confidence_max', value)} placeholder="置信度上限" />
              </div>
              <InputNumber size="small" value={filters.lat} onChange={(value) => updateFilter('lat', value)} placeholder="纬度" />
              <InputNumber size="small" value={filters.lon} onChange={(value) => updateFilter('lon', value)} placeholder="经度" />
              <InputNumber size="small" min={1} max={100} value={filters.radius_km} onChange={(value) => updateFilter('radius_km', value)} placeholder="半径(km)" />
            </div>
            <Space wrap style={{ marginTop: 12 }}>
              <Button size="small" icon={<IconRefresh />} onClick={resetFilters}>重置筛选</Button>
              <Tag color="arcoblue">{formatFilters(filters)}</Tag>
            </Space>
          </Card>

          <Card title="对话线程" bodyStyle={{ padding: 16 }}>
            {activeSession?.messages?.length ? (
              <div style={{ display: 'grid', gap: 16 }}>
                {activeSession.messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} style={{ display: 'grid', gap: 10 }}>
                    {message.role === 'user' ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ maxWidth: '78%', padding: 14, borderRadius: 14, background: 'rgba(22, 93, 255, 0.08)', border: '1px solid rgba(22, 93, 255, 0.16)' }}>
                          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 6 }}>提问 · {message.createdAt}</div>
                          <div style={{ fontSize: 14, color: 'var(--color-text-1)', lineHeight: 1.7 }}>{message.question}</div>
                          {message.filters && Object.keys(message.filters).length ? (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-3)' }}>{formatFilters(message.filters)}</div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ padding: 16, borderRadius: 16, background: '#fff', border: '1px solid var(--color-border-2)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>AI 数据副驾驶</div>
                              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-3)' }}>
                                {message.route} {message.traceId ? `· Trace ${message.traceId.slice(0, 8)}` : ''}
                              </div>
                            </div>
                            <Tag color={running && index === activeSession.messages.length - 1 ? 'arcoblue' : 'green'}>{message.createdAt}</Tag>
                          </div>

                          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {message.intent ? <Tag>意图 {message.intent}</Tag> : null}
                            {message.filters && Object.keys(compactFilters(message.filters)).length ? <Tag color="arcoblue">{formatFilters(message.filters)}</Tag> : null}
                            {message.context?.time_range ? <Tag color="purple">{message.context.time_range}</Tag> : null}
                          </div>

                          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                            {(message.steps || []).map((step) => (
                              <JourneyStep key={step.key} title={step.title} status={step.status} detail={step.detail} time={step.time} />
                            ))}
                          </div>

                          {message.sql ? (
                            <Card size="small" title="生成 SQL" style={{ marginTop: 14, background: 'var(--color-fill-1)' }}>
                              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Text type="secondary">同一条轨迹里的 SQL 草案，可直接复制到 SQL 工作台继续修改。</Text>
                                <Button size="small" icon={<IconCopy />} onClick={() => navigator.clipboard?.writeText(message.sql)}>复制 SQL</Button>
                              </Space>
                              <Text code copyable style={{ display: 'block', whiteSpace: 'pre-wrap', marginTop: 10 }}>{message.sql}</Text>
                            </Card>
                          ) : null}

                          {message.summary ? (
                            <Card size="small" title="结论摘要" style={{ marginTop: 14 }}>
                              <Paragraph style={{ margin: 0 }}>{message.summary}</Paragraph>
                            </Card>
                          ) : null}

                          {message.sqlResult?.columns?.length ? (
                            <Card size="small" title="结构化结果" style={{ marginTop: 14 }}>
                              <ResultSummary result={message.sqlResult} />
                              <Table columns={buildTableColumns(message.sqlResult.columns)} data={message.sqlResult.rows} rowKey={(_, rowIndex) => rowIndex} pagination={{ pageSize: 5 }} size="small" scroll={{ x: 'max-content' }} border />
                            </Card>
                          ) : null}

                          <div style={{ marginTop: 14 }}>
                            <SearchResultList results={message.searchResults || []} searched emptyText="本轮没有补充相关资产" />
                          </div>

                          {message.followups?.length ? (
                            <div style={{ marginTop: 14 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>继续追问</Text>
                              <Space wrap style={{ marginTop: 8 }}>
                                {message.followups.map((item) => (
                                  <Button key={item} size="small" onClick={() => setQuestion(item)}>{item}</Button>
                                ))}
                              </Space>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="当前会话还没有问题，直接输入业务问题开始。" />
            )}
          </Card>

          <Card title="发起提问" bodyStyle={{ padding: 16 }}>
            <TextArea value={question} onChange={setQuestion} autoSize={{ minRows: 4, maxRows: 8 }} placeholder="例如：最近 7 天有哪些车辆闯入监控告警，限定某个城市并给我样本" />
            <Space wrap style={{ marginTop: 12 }}>
              <Button type="primary" icon={<IconRobot />} onClick={() => sendQuestion()} loading={running}>开始分析</Button>
              {COPILOT_EXAMPLES.map((item) => (
                <Button key={item} onClick={() => setQuestion(item)}>{item}</Button>
              ))}
            </Space>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="查询轨迹" bodyStyle={{ padding: 16 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text type="secondary">当前会话的查询回放</Text>
              <Button size="small" icon={<IconRefresh />} loading={traceLoading} onClick={() => loadTraces(activeSessionId, true)}>刷新</Button>
            </Space>

            {traceStats ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>总查询</div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{traceStats.total_queries || 0}</div>
                </div>
                <div style={{ padding: 10, borderRadius: 10, background: 'var(--color-fill-1)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>成功数</div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{traceStats.success_count || 0}</div>
                </div>
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {traceItems.map((item) => (
                <button
                  key={item.trace_id}
                  type="button"
                  onClick={() => loadTraceDetail(item.trace_id)}
                  style={{
                    textAlign: 'left',
                    padding: 10,
                    borderRadius: 10,
                    border: item.trace_id === selectedTraceId ? '1px solid rgba(22, 93, 255, 0.35)' : '1px solid var(--color-border-2)',
                    background: item.trace_id === selectedTraceId ? 'rgba(22, 93, 255, 0.06)' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-1)' }}>{truncateText(item.question || '未命名查询', 28)}</div>
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-3)' }}>{item.route || '未命名路径'} · {item.created_at || ''}</div>
                </button>
              ))}
            </div>

            {traceDetail ? (
              <div style={{ display: 'grid', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border-2)' }}>
                <div>
                  <Text type="secondary">轨迹详情</Text>
                  <Paragraph style={{ marginTop: 6, marginBottom: 0 }}>{traceDetail.question}</Paragraph>
                </div>
                <Tag color="arcoblue">{traceDetail.route}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{formatFilters(traceDetail.filters || {})}</Text>
                {traceDetail.sql ? <Text code copyable style={{ whiteSpace: 'pre-wrap' }}>{traceDetail.sql}</Text> : null}
                {(traceDetail.steps || []).map((step) => (
                  <JourneyStep key={step.key} title={step.title} status={step.status} detail={step.detail} time={step.time} />
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </QueryPageFrame>
  )
}

export default function LakeQueryPage() {
  const { tab } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (!tab) {
      navigate('/lake-query/sql', { replace: true })
      return
    }

    if (!PAGE_MAP[tab]) {
      navigate('/lake-query/sql', { replace: true })
      return
    }

    if (tab === 'nl2sql') {
      navigate('/lake-query/sql', { replace: true })
    }
  }, [navigate, tab])

  const activeTab = PAGE_MAP[tab] ? (tab === 'vector' || tab === 'multimodal' || tab === 'hybrid' ? 'retrieval' : tab) : 'sql'
  const retrievalPreset = RETRIEVAL_PRESET_MAP[tab] || 'semantic'

  return (
    <div style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      {activeTab === 'sql' && <SqlWorkspaceTab />}
      {activeTab === 'retrieval' && <RetrievalWorkspaceTab initialStrategy={retrievalPreset} />}
      {activeTab === 'copilot' && <CopilotTab />}
      {activeTab === 'annotation' && <AnnotationWorkbenchTab />}
    </div>
  )
}
