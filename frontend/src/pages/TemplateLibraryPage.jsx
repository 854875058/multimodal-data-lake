import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Grid, Space, Spin, Table, Tag, Typography } from '@arco-design/web-react'
import { IconCopy, IconExport, IconPlus, IconRefresh } from '@arco-design/web-react/icon'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import { Message } from '@arco-design/web-react'

const { Row, Col } = Grid
const { Title, Text } = Typography

const kindLabels = { source: '输入', transform: '处理', ai: '智能', sink: '输出' }
const kindColors = { source: 'blue', transform: 'green', ai: 'purple', sink: 'orange' }

export default function TemplateLibraryPage() {
  const navigate = useNavigate()
  const [presets, setPresets] = useState([])
  const [library, setLibrary] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api.getWorkflowPresets()
      setPresets(Array.isArray(res?.presets) ? res.presets : [])
      setLibrary(Array.isArray(res?.library) ? res.library : [])
    } catch (e) {
      Message.error(getErrorMessage(e, '加载模板数据失败'))
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const operatorStats = useMemo(() => {
    const byKind = { source: 0, transform: 0, ai: 0, sink: 0 }
    library.forEach((op) => { byKind[op.kind || 'transform'] = (byKind[op.kind || 'transform'] || 0) + 1 })
    return byKind
  }, [library])

  const summaryCards = [
    { label: '工作流模板', value: String(presets.length), note: '预设工作流，可直接使用或派生。' },
    { label: '算子总数', value: String(library.length), note: `输入 ${operatorStats.source} / 处理 ${operatorStats.transform} / 智能 ${operatorStats.ai} / 输出 ${operatorStats.sink}` },
    { label: '健康算子', value: String(library.filter((op) => op.health?.state === 'runnable').length), note: '可直接用于工作流编排。' },
  ]

  const presetColumns = [
    {
      title: '模板名称', width: 200,
      render: (_, preset) => (
        <div>
          <Text style={{ fontWeight: 600 }}>{preset.label || preset.id}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{preset.description || '暂无描述'}</Text>
        </div>
      ),
    },
    {
      title: '节点数', width: 80,
      render: (_, preset) => <Text style={{ fontFeatureSettings: '"tnum"' }}>{(preset.nodes || []).length}</Text>,
    },
    {
      title: '资源', width: 140,
      render: (_, preset) => {
        const r = preset.resources || {}
        return `CPU ${r.cpu || 4} / GPU ${r.gpu || 0} / ${r.memory_gb || 16}GB`
      },
    },
    {
      title: '算子链路',
      render: (_, preset) => {
        const nodes = preset.nodes || []
        if (!nodes.length) return <Text type="secondary">—</Text>
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {nodes.slice(0, 6).map((nodeId) => {
              const op = library.find((o) => o.id === nodeId)
              return <Tag key={nodeId} color={kindColors[op?.kind] || 'gray'} size="small">{op?.label || nodeId}</Tag>
            })}
            {nodes.length > 6 && <Tag size="small">+{nodes.length - 6}</Tag>}
          </div>
        )
      },
    },
    {
      title: '操作', width: 120,
      render: (_, preset) => (
        <Button size="mini" type="primary" onClick={() => {
          navigate('/workflow')
        }}>使用模板</Button>
      ),
    },
  ]

  const operatorColumns = [
    {
      title: '算子名称',
      render: (_, op) => (
        <div>
          <Text style={{ fontWeight: 500 }}>{op.label || op.id}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{op.description || '暂无描述'}</Text>
        </div>
      ),
    },
    {
      title: '类型', width: 80,
      render: (_, op) => <Tag color={kindColors[op.kind] || 'gray'} size="small">{kindLabels[op.kind] || op.kind || '—'}</Tag>,
    },
    { title: '模态', width: 100, render: (_, op) => op.modality || '—' },
    { title: '分类', width: 100, render: (_, op) => op.category || '—' },
    { title: '运行时', width: 100, render: (_, op) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{op.runtime || '—'}</Text> },
    {
      title: '健康状态', width: 100,
      render: (_, op) => {
        const state = op.health?.state
        const colorMap = { runnable: 'green', staged: 'orange', missing_env: 'red', missing_dependency: 'red', import_error: 'red' }
        const labelMap = { runnable: '可运行', staged: '待集成', missing_env: '缺环境', missing_dependency: '缺依赖', import_error: '导入失败' }
        return <Tag color={colorMap[state] || 'gray'} size="small">{labelMap[state] || state || '未知'}</Tag>
      },
    },
  ]

  return (
    <div style={{ padding: 20, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>模板库</Title>
          <Text type="secondary">复用成熟的数据处理模板，减少重复编排并统一参数基线。</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />} loading={loading} onClick={loadData}>刷新</Button>
          <Button type="primary" icon={<IconPlus />} onClick={() => navigate('/workflow')}>新建工作流</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {summaryCards.map((item) => (
          <Col key={item.label} span={8}>
            <Card bodyStyle={{ padding: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>{item.value}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.note}</Text>
            </Card>
          </Col>
        ))}
      </Row>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}><Spin size={32} /></div>
      ) : (
        <>
          <Card title="工作流模板" bodyStyle={{ padding: 0 }} style={{ marginBottom: 16 }}>
            {presets.length ? (
              <Table rowKey="id" columns={presetColumns} data={presets} pagination={false} size="small" />
            ) : (
              <div style={{ padding: 40 }}><Empty description="暂无工作流模板" /></div>
            )}
          </Card>

          <Card title="算子目录" bodyStyle={{ padding: 0 }} extra={<Text type="secondary" style={{ fontSize: 12 }}>共 {library.length} 个算子</Text>}>
            {library.length ? (
              <Table rowKey="id" columns={operatorColumns} data={library} pagination={{ pageSize: 10 }} size="small" />
            ) : (
              <div style={{ padding: 40 }}><Empty description="暂无算子数据" /></div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
