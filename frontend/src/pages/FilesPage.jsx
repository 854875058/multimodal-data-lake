import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Empty,
  Input,
  Message,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react'
import {
  IconFile,
  IconFileAudio,
  IconFileImage,
  IconFilePdf,
  IconFileVideo,
  IconList,
  IconApps,
  IconRefresh,
  IconSearch,
  IconEye,
  IconDownload,
  IconDelete,
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import PreviewModal from '@/components/PreviewModal.jsx'
import { formatDateTime, formatNumber } from '@/utils/format'

const { Text } = Typography
const TabPane = Tabs.TabPane
const Option = Select.Option

const initialPreview = { open: false, loading: false, preview: null, error: '' }

// 文件类型配置
const FILE_TYPE_CONFIG = {
  document: { label: '文档', color: 'blue', icon: <IconFilePdf /> },
  image: { label: '图片', color: 'green', icon: <IconFileImage /> },
  audio: { label: '音频', color: 'purple', icon: <IconFileAudio /> },
  video: { label: '视频', color: 'orange', icon: <IconFileVideo /> },
  other: { label: '其他', color: 'gray', icon: <IconFile /> },
}

function getFileType(docType) {
  if (!docType) return 'other'
  const type = docType.toLowerCase()
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'ppt', 'pptx', 'xls', 'xlsx'].includes(type)) return 'document'
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(type)) return 'image'
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(type)) return 'audio'
  if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv'].includes(type)) return 'video'
  return 'other'
}

function formatFileSize(bytes) {
  if (!bytes) return '--'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export default function FilesPage() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'list' | 'grid'
  const [activeCategory, setActiveCategory] = useState('all') // 'all' | 'document' | 'image' | 'audio' | 'video'
  const [previewState, setPreviewState] = useState(initialPreview)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [fileTypes, setFileTypes] = useState([])

  // 加载文件列表
  const loadFiles = async (page = 1, docType = 'all') => {
    setLoading(true)
    try {
      const response = await api.getFiles(page, 20, docType)
      setFiles(Array.isArray(response?.items) ? response.items : [])
      setTotal(response?.total || 0)
      setCurrentPage(page)
    } catch (error) {
      setFiles([])
      Message.error(getErrorMessage(error, '加载文件列表失败'))
    } finally {
      setLoading(false)
    }
  }

  // 加载文件类型统计
  const loadFileTypes = async () => {
    try {
      const response = await api.getFileTypes()
      setFileTypes(Array.isArray(response) ? response : [])
    } catch {
      setFileTypes([])
    }
  }

  // 刷新页面
  const refreshPage = async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        loadFiles(1, activeCategory),
        loadFileTypes(),
      ])
    } catch (error) {
      Message.error(getErrorMessage(error, '刷新失败'))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refreshPage()
  }, [])

  useEffect(() => {
    loadFiles(1, activeCategory)
  }, [activeCategory])

  // 预览文件
  const handlePreview = async (fileHash) => {
    setPreviewState({ open: true, loading: true, preview: null, error: '' })
    try {
      const response = await api.previewFile(fileHash)
      setPreviewState({ open: true, loading: false, preview: response, error: '' })
    } catch (error) {
      setPreviewState({
        open: true,
        loading: false,
        preview: null,
        error: getErrorMessage(error, '预览失败'),
      })
    }
  }

  // KPI 统计
  const stats = useMemo(() => {
    const typeCounts = {}
    fileTypes.forEach(item => {
      const type = getFileType(item.doc_type)
      typeCounts[type] = (typeCounts[type] || 0) + Number(item.count || 0)
    })
    return {
      total: fileTypes.reduce((sum, item) => sum + Number(item.count || 0), 0),
      document: typeCounts.document || 0,
      image: typeCounts.image || 0,
      audio: typeCounts.audio || 0,
      video: typeCounts.video || 0,
    }
  }, [fileTypes])

  // 过滤文件
  const filteredFiles = useMemo(() => {
    const query = searchKeyword.trim().toLowerCase()
    if (!query) return files
    return files.filter((item) => {
      const haystack = [item.file_name, item.doc_name, item.doc_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [files, searchKeyword])

  // 文件类型统计选项
  const categoryOptions = useMemo(() => [
    { key: 'all', label: `全部 (${stats.total})` },
    { key: 'document', label: `文档 (${stats.document})` },
    { key: 'image', label: `图片 (${stats.image})` },
    { key: 'audio', label: `音频 (${stats.audio})` },
    { key: 'video', label: `视频 (${stats.video})` },
  ], [stats])

  // 表格列定义
  const columns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      render: (value, record) => (
        <Space>
          {FILE_TYPE_CONFIG[getFileType(record.doc_type)]?.icon}
          <Text>{value || record.doc_name || '--'}</Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'doc_type',
      width: 100,
      render: (value) => {
        const type = getFileType(value)
        const config = FILE_TYPE_CONFIG[type]
        return <Tag color={config.color}>{value || config.label}</Tag>
      },
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      width: 100,
      render: (value) => <Text>{formatFileSize(value)}</Text>,
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      width: 160,
      render: (value) => <Text type="secondary">{value ? formatDateTime(value) : '--'}</Text>,
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<IconEye />}
            onClick={() => handlePreview(record.file_hash)}
          >
            预览
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="asset-page">
      {/* 页面头部 */}
      <div className="ap-page__header">
        <h1 className="ap-page__title">资产目录</h1>
        <p className="ap-page__subtitle">统一管理可用数据资产</p>
      </div>

      {/* KPI 统计 */}
      <div className="ap-stats">
        <div className="ap-stat-item">
          <div className="ap-stat-label">资产总数</div>
          <div className="ap-stat-value">{stats.total}</div>
        </div>
        <div className="ap-stat-item">
          <div className="ap-stat-label">文档</div>
          <div className="ap-stat-value ap-stat-value--blue">{stats.document}</div>
        </div>
        <div className="ap-stat-item">
          <div className="ap-stat-label">图片</div>
          <div className="ap-stat-value ap-stat-value--green">{stats.image}</div>
        </div>
        <div className="ap-stat-item">
          <div className="ap-stat-label">音视频</div>
          <div className="ap-stat-value ap-stat-value--purple">{stats.audio + stats.video}</div>
        </div>
      </div>

      {/* Tab 分类 */}
      <Tabs
        activeTab={activeCategory}
        onChange={setActiveCategory}
        className="ap-tabs"
      >
        {categoryOptions.map(item => (
          <TabPane key={item.key} title={item.label} />
        ))}
      </Tabs>

      {/* 工具栏 */}
      <div className="ap-toolbar">
        <Input.Search
          placeholder="搜索文件名 / 类型..."
          style={{ width: 340 }}
          allowClear
          value={searchKeyword}
          onChange={setSearchKeyword}
        />
        <span style={{ flex: 1 }} />
        <Space>
          <Button.Group size="small">
            <Button
              type={viewMode === 'list' ? 'primary' : 'secondary'}
              icon={<IconList />}
              onClick={() => setViewMode('list')}
            />
            <Button
              type={viewMode === 'grid' ? 'primary' : 'secondary'}
              icon={<IconApps />}
              onClick={() => setViewMode('grid')}
            />
          </Button.Group>
          <Button icon={<IconRefresh />} loading={refreshing} onClick={refreshPage}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 文件列表 */}
      <Spin loading={loading}>
        {filteredFiles.length === 0 ? (
          <Empty description="暂无资产" style={{ padding: '64px 0' }} />
        ) : viewMode === 'grid' ? (
          // 卡片网格视图
          <div className="asset-grid">
            {filteredFiles.map((item) => {
              const fileType = getFileType(item.doc_type)
              const config = FILE_TYPE_CONFIG[fileType]
              return (
                <div
                  key={item.file_hash || item.id}
                  className="asset-grid-card"
                  onClick={() => handlePreview(item.file_hash)}
                >
                  {/* 卡片头部：图标 + 类型 */}
                  <div className="asset-grid-card-header">
                    <div className="asset-grid-card-icon" data-type={fileType}>
                      {config.icon}
                    </div>
                    <Tag color={config.color} size="small">
                      {item.doc_type || config.label}
                    </Tag>
                  </div>

                  {/* 文件名 */}
                  <div className="asset-grid-card-title">
                    {item.file_name || item.doc_name || '未命名文件'}
                  </div>

                  {/* 文件大小 */}
                  <div className="asset-grid-card-meta">
                    <span>{formatFileSize(item.file_size)}</span>
                    <span>{item.created_at ? formatDateTime(item.created_at) : '--'}</span>
                  </div>

                  {/* 悬停操作 */}
                  <div className="asset-grid-card-actions" onClick={(e) => e.stopPropagation()}>
                    <Button type="text" size="small" icon={<IconEye />}>
                      预览
                    </Button>
                    <Button type="text" size="small" icon={<IconDownload />}>
                      下载
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // 列表视图
          <Table
            columns={columns}
            data={filteredFiles}
            rowKey={(record) => record.file_hash || record.id}
            pagination={{
              current: currentPage,
              total,
              pageSize: 20,
              onChange: (page) => loadFiles(page, activeCategory),
            }}
          />
        )}
      </Spin>

      {/* 预览弹窗 */}
      <PreviewModal
        open={previewState.open}
        loading={previewState.loading}
        preview={previewState.preview}
        error={previewState.error}
        onClose={() => setPreviewState(initialPreview)}
      />
    </div>
  )
}
