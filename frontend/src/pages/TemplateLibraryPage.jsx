import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Descriptions, Empty, Grid, Modal, Space, Spin, Table, Tag, Typography } from '@arco-design/web-react'
import { IconCopy, IconPlus, IconRefresh } from '@arco-design/web-react/icon'
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
  const [selectedOperator, setSelectedOperator] = useState(null)
  const [operatorDetail, setOperatorDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

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

  const loadOperatorDetail = async (operatorKey) => {
    setDetailLoading(true)
    setOperatorDetail(null)
    try {
      const res = await api.getOperatorDetail(operatorKey)
      setOperatorDetail(res?.data || res || null)
    } catch (e) {
      Message.error(getErrorMessage(e, '加载算子详情失败'))
    } finally { setDetailLoading(false) }
  }

  const handleOperatorClick = (op) => {
    setSelectedOperator(op)
    loadOperatorDetail(op.id)
  }

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
          sessionStorage.setItem('workflow_preset_id', preset.id)
          navigate('/workflow', { state: { presetId: preset.id } })
        }}>使用模板</Button>
      ),
    },
  ]

  const operatorColumns = [
    {
      title: '算子名称',
      render: (_, op) => (
        <div style={{ cursor: 'pointer' }} onClick={() => handleOperatorClick(op)}>
          <Text style={{ fontWeight: 500, color: 'var(--color-primary-light-4)' }}>{op.label || op.id}</Text>
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
    {
      title: '详情', width: 60,
      render: (_, op) => <Button size="mini" onClick={() => handleOperatorClick(op)}>查看</Button>,
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

          <Card title="算子目录" bodyStyle={{ padding: 0 }} extra={<Text type="secondary" style={{ fontSize: 12 }}>共 {library.length} 个算子，点击查看详情</Text>}>
            {library.length ? (
              <Table rowKey="id" columns={operatorColumns} data={library} pagination={{ pageSize: 10 }} size="small" />
            ) : (
              <div style={{ padding: 40 }}><Empty description="暂无算子数据" /></div>
            )}
          </Card>
        </>
      )}

      {/* ── 算子详情弹窗 ─────────────────────────────────────────────── */}
      <Modal
        title={selectedOperator ? `算子详情 — ${selectedOperator.label || selectedOperator.id}` : '算子详情'}
        visible={!!selectedOperator}
        onCancel={() => { setSelectedOperator(null); setOperatorDetail(null) }}
        footer={null}
        style={{ width: 640 }}
      >
        {detailLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
        ) : operatorDetail ? (
          <div>
            <Descriptions
              column={2}
              data={[
                { label: '算子 ID', value: operatorDetail.id || '—' },
                { label: '类型', value: <Tag color={kindColors[operatorDetail.kind] || 'gray'} size="small">{kindLabels[operatorDetail.kind] || operatorDetail.kind || '—'}</Tag> },
                { label: '模态', value: operatorDetail.modality || '—' },
                { label: '分类', value: operatorDetail.category || '—' },
                { label: '运行时', value: operatorDetail.runtime || '—' },
                { label: '源码路径', value: operatorDetail.source_code_path || '—' },
                { label: '输入类型', value: (operatorDetail.input_types || []).join(', ') || '—' },
                { label: '输出类型', value: (operatorDetail.output_types || []).join(', ') || '—' },
              ].filter(Boolean)}
              style={{ marginBottom: 16 }}
              labelStyle={{ fontWeight: 500 }}
            />
            {operatorDetail.description && (
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>描述</Text>
                <Text>{operatorDetail.description}</Text>
              </div>
            )}
            {operatorDetail.tags && operatorDetail.tags.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>标签</Text>
                <Space>{operatorDetail.tags.map((t) => <Tag key={t} size="small">{t}</Tag>)}</Space>
              </div>
            )}
            {operatorDetail.default_params && Object.keys(operatorDetail.default_params).length > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>默认参数</Text>
                <pre style={{
                  background: '#f7f8fa', padding: 12, borderRadius: 6,
                  fontSize: 12, fontFamily: 'monospace', maxHeight: 200, overflow: 'auto',
                }}>{JSON.stringify(operatorDetail.default_params, null, 2)}</pre>
              </div>
            )}
          </div>
        ) : (
          <Empty description="暂无详情数据" />
        )}
      </Modal>
    </div>
  )
}
