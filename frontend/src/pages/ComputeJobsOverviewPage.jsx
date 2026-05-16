import { Button, Card, Grid, Space, Table, Tabs, Tag, Typography } from '@arco-design/web-react'
import { IconCalendarClock, IconPlayArrow, IconRefresh, IconRobot } from '@arco-design/web-react/icon'

const { Row, Col } = Grid
const { Title, Text } = Typography
const TabPane = Tabs.TabPane

const summaryCards = [
  { label: '运行中实例', value: '12', note: '编排中心、任务中心和 Ray 作业的合并视角。', color: '#165dff' },
  { label: '等待队列', value: '5', note: '主要集中在 GPU 与大批量视频抽帧任务。', color: '#ff7d00' },
  { label: '异常告警', value: '2', note: '建议先排查输入契约与资源配额。', color: '#f53f3f' },
  { label: '今日完成', value: '38', note: '包含批量入湖任务与独立 Ray 计算任务。', color: '#00b42a' },
]

const pipelineColumns = [
  { title: '实例 ID', dataIndex: 'id', width: 160, render: (value) => <Text code>{value}</Text> },
  { title: '工作流', dataIndex: 'workflow', width: 180 },
  { title: '输入批次', dataIndex: 'batch', width: 160 },
  { title: '当前节点', dataIndex: 'step', width: 160 },
  { title: '状态', dataIndex: 'status', width: 100, render: (value) => <Tag color={value === '运行中' ? 'arcoblue' : value === '排队中' ? 'orange' : 'green'}>{value}</Tag> },
  { title: '资源', dataIndex: 'resource', width: 160 },
  { title: '更新时间', dataIndex: 'updated', width: 180 },
]

const rayColumns = [
  { title: 'Job ID', dataIndex: 'id', width: 160, render: (value) => <Text code>{value}</Text> },
  { title: '任务名称', dataIndex: 'name', width: 180 },
  { title: '入口命令', dataIndex: 'entry', ellipsis: true },
  { title: '状态', dataIndex: 'status', width: 100, render: (value) => <Tag color={value === 'RUNNING' ? 'arcoblue' : value === 'PENDING' ? 'orange' : 'green'}>{value}</Tag> },
  { title: '配额', dataIndex: 'quota', width: 160 },
  { title: '开始时间', dataIndex: 'started', width: 180 },
]

const pipelineData = [
  { key: '1', id: 'flow-20260513-001', workflow: '文档解析标准流', batch: 'invoice_0513', step: 'OCR 识别', status: '运行中', resource: 'CPU 4 / GPU 1', updated: '2026-05-13 14:58' },
  { key: '2', id: 'flow-20260513-002', workflow: '视频抽帧增强流', batch: 'video_batch_a', step: '镜头切分', status: '排队中', resource: 'CPU 8 / GPU 1', updated: '2026-05-13 14:52' },
  { key: '3', id: 'flow-20260513-003', workflow: '图文向量化流', batch: 'knowledge_pack', step: '向量写入', status: '已完成', resource: 'CPU 4 / GPU 1', updated: '2026-05-13 14:30' },
]

const rayData = [
  { key: '1', id: 'rayjob-8f2d', name: 'embedding-rebuild', entry: 'python jobs/rebuild_embedding.py --bucket multimodal', status: 'RUNNING', quota: 'CPU 6 / GPU 1', started: '2026-05-13 14:41' },
  { key: '2', id: 'rayjob-91ca', name: 'video-enhance', entry: 'python jobs/video_enhance.py --profile default', status: 'PENDING', quota: 'CPU 8 / GPU 1', started: '2026-05-13 14:35' },
  { key: '3', id: 'rayjob-a12f', name: 'cleaning-backfill', entry: 'python jobs/cleaning_backfill.py --days 7', status: 'SUCCEEDED', quota: 'CPU 2 / GPU 0', started: '2026-05-13 13:58' },
]

export default function ComputeJobsOverviewPage() {
  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>作业实例</Title>
          <Text type="secondary">按实例观察多模态处理链路，区分工作流执行态与底层 Ray 作业态。</Text>
        </div>
        <Space>
          <Button icon={<IconRefresh />}>刷新视图</Button>
          <Button type="primary" icon={<IconPlayArrow />}>新建实例</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {summaryCards.map((item) => (
          <Col key={item.label} span={6}>
            <Card bodyStyle={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{item.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: 'var(--color-text-2)' }}>{item.note}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs defaultActiveTab="pipeline" style={{ padding: '0 20px' }}>
          <TabPane key="pipeline" title={<span><IconCalendarClock /> 工作流实例</span>}>
            <Table rowKey="key" columns={pipelineColumns} data={pipelineData} pagination={false} borderCell />
          </TabPane>
          <TabPane key="ray" title={<span><IconRobot /> Ray 作业</span>}>
            <Table rowKey="key" columns={rayColumns} data={rayData} pagination={false} borderCell />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  )
}
