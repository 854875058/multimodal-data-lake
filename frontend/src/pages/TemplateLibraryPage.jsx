import { Button, Card, Grid, Space, Table, Tag, Typography } from '@arco-design/web-react'
import { IconCopy, IconExport, IconPlus } from '@arco-design/web-react/icon'

const { Row, Col } = Grid
const { Title, Text } = Typography

const templateCards = [
  { label: '已发布模板', value: '15', note: '覆盖入湖增强、质量治理与自动标注场景。' },
  { label: '跨团队复用', value: '9', note: '模板参数与资源规格已标准化。' },
  { label: '最近更新', value: '3', note: '本周新增视频抽帧和版面解析模板。' },
]

const templateColumns = [
  { title: '模板名称', dataIndex: 'name', render: (_, item) => <Space direction="vertical" size={2}><Text bold>{item.name}</Text><Text type="secondary">{item.desc}</Text></Space> },
  { title: '场景', dataIndex: 'scenario', width: 140, render: (value) => <Tag color="arcoblue">{value}</Tag> },
  { title: '默认链路', dataIndex: 'flow', width: 220 },
  { title: '资源基线', dataIndex: 'resource', width: 140 },
  { title: '维护人', dataIndex: 'owner', width: 120 },
  { title: '状态', dataIndex: 'status', width: 100, render: (value) => <Tag color={value === '稳定' ? 'green' : 'orange'}>{value}</Tag> },
]

const templateData = [
  {
    key: '1',
    name: '票据解析标准模板',
    desc: '适配扫描票据、合同与报告的 OCR + 清洗 + 向量化流程。',
    scenario: '文档解析',
    flow: 'OCR -> 清洗 -> 结构化 -> Embedding',
    resource: 'CPU 4 / GPU 1',
    owner: '数据平台组',
    status: '稳定',
  },
  {
    key: '2',
    name: '视频抽帧质检模板',
    desc: '适配安防与巡检视频的抽帧、去重与质量筛查。',
    scenario: '视频处理',
    flow: '抽帧 -> 质检 -> 去重 -> 入库',
    resource: 'CPU 8 / GPU 1',
    owner: '视觉算法组',
    status: '稳定',
  },
  {
    key: '3',
    name: '自动标注增强模板',
    desc: '适配图文数据集的预标注、复核与结果回写。',
    scenario: '标注增强',
    flow: '预标注 -> 人审 -> 回写 -> 追踪',
    resource: 'CPU 4 / GPU 0',
    owner: '治理运营组',
    status: '试运行',
  },
]

export default function TemplateLibraryPage() {
  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>模板库</Title>
          <Text type="secondary">复用成熟的数据处理模板，减少重复编排并统一参数基线。</Text>
        </div>
        <Space>
          <Button icon={<IconExport />}>导出模板</Button>
          <Button type="primary" icon={<IconPlus />}>新建模板</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {templateCards.map((item) => (
          <Col key={item.label} span={8}>
            <Card bodyStyle={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{item.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: 'var(--color-text-1)' }}>{item.value}</div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{item.note}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title="模板目录"
        extra={<Button type="text" icon={<IconCopy />}>从模板派生工作流</Button>}
        bodyStyle={{ padding: 0 }}
      >
        <Table rowKey="key" columns={templateColumns} data={templateData} pagination={false} borderCell />
      </Card>
    </div>
  )
}
