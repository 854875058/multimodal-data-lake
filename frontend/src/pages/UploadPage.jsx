import { useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Card, Button, Space, Typography, Table, Progress, Tag, Empty,
  Message, Grid, Statistic
} from '@arco-design/web-react'
import {
  IconUpload, IconFolder, IconDelete, IconCloudDownload, IconPlus
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { formatBytes } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { Row, Col } = Grid

function buildKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

const acceptedFormats = ['txt', 'pdf', 'docx', 'pptx', 'jpg', 'png', 'mp3', 'wav', 'mp4', 'zip', 'tar', 'gz', 'tgz']

export default function UploadPage() {
  const inputRef = useRef(null)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const totalSize = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0),
    [selectedFiles]
  )

  const addFiles = (incoming) => {
    const next = Array.from(incoming || [])
    if (!next.length) return
    setSelectedFiles(curr => {
      const exists = new Set(curr.map(buildKey))
      const merged = [...curr]
      next.forEach(f => {
        const k = buildKey(f)
        if (!exists.has(k)) { merged.push(f); exists.add(k) }
      })
      return merged
    })
  }

  const openPicker = () => inputRef.current?.click()

  const submitUpload = async () => {
    if (!selectedFiles.length) {
      Message.warning('请先选择文件')
      return
    }
    setUploading(true)
    setProgress(0)
    const timer = window.setInterval(() => {
      setProgress(p => p >= 90 ? p : p + 10)
    }, 180)
    try {
      const result = await api.uploadFiles(selectedFiles)
      window.clearInterval(timer)
      setProgress(100)
      if (result.success) {
        Message.success(result.message || '上传成功')
        setSelectedFiles([])
      } else {
        Message.error(result.message || '上传失败')
      }
    } catch (e) {
      window.clearInterval(timer)
      setProgress(100)
      Message.error(getErrorMessage(e, '上传失败'))
    } finally {
      setUploading(false)
    }
  }

  const columns = [
    { title: '文件名', dataIndex: 'name' },
    { title: '大小', dataIndex: 'size', width: 120, render: v => formatBytes(v) },
    { title: '类型', dataIndex: 'type', width: 160, render: v => v || <Text type="secondary">未知</Text> },
    {
      title: '操作', width: 90, fixed: 'right',
      render: (_, file) => {
        const k = buildKey(file)
        return (
          <Button type="text" status="danger" size="small" icon={<IconDelete />}
            onClick={() => setSelectedFiles(curr => curr.filter(f => buildKey(f) !== k))}>
            移除
          </Button>
        )
      },
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>本地上传</Title>
          <Text type="secondary">本机文件、离线交付件和压缩包的快速入湖</Text>
        </div>
        <Space>
          <NavLink to="/workbench"><Button icon={<IconCloudDownload />}>前往接入与扫描</Button></NavLink>
          <Button type="primary" icon={<IconPlus />} onClick={openPicker}>选择文件</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="入口类型" value="本地直传" />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="已选文件" value={selectedFiles.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Statistic title="总大小" value={formatBytes(totalSize)} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bodyStyle={{ padding: 20 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>支持格式</Text>
            <div style={{ marginTop: 8 }}>
              <Space wrap size={4}>
                {acceptedFormats.slice(0, 6).map(f => <Tag key={f} color="arcoblue">{f}</Tag>)}
                <Text type="secondary">等</Text>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <div
          onClick={openPicker}
          onDragEnter={e => { e.preventDefault(); setDragging(true) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={e => { e.preventDefault(); setDragging(false) }}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
          style={{
            border: `2px dashed ${dragging ? 'var(--color-primary-light-3)' : 'var(--color-border-2)'}`,
            borderRadius: 8,
            padding: '48px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'var(--color-primary-light-1)' : 'var(--color-fill-1)',
            transition: 'all 0.2s',
          }}
        >
          <IconUpload style={{ fontSize: 48, color: 'var(--color-primary-light-3)', marginBottom: 16 }} />
          <Title heading={6} style={{ margin: 0, marginBottom: 8 }}>拖拽文件到这里，或点击选择</Title>
          <Text type="secondary">支持批量选择，压缩包会在服务端自动解包</Text>
          <div style={{ marginTop: 16 }}>
            <Space>
              <Button type="primary" icon={<IconFolder />} onClick={(e) => { e.stopPropagation(); openPicker() }}>
                选择本地文件
              </Button>
              <Button
                type="outline"
                icon={<IconUpload />}
                onClick={(e) => { e.stopPropagation(); submitUpload() }}
                loading={uploading}
                disabled={!selectedFiles.length}
              >
                上传并入湖
              </Button>
            </Space>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = '' }}
          />
        </div>

        {progress > 0 && (
          <Progress
            percent={progress}
            style={{ marginTop: 16 }}
            status={progress === 100 ? 'success' : 'normal'}
          />
        )}
      </Card>

      <Card title={`待上传列表（${selectedFiles.length} 项）`}>
        <Table
          columns={columns}
          data={selectedFiles}
          rowKey={file => buildKey(file)}
          pagination={{ pageSize: 10 }}
          noDataElement={<Empty description="还没有选中文件" />}
        />
      </Card>
    </div>
  )
}
