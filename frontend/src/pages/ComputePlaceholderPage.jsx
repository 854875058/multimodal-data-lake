import { Card, Grid, Typography } from '@arco-design/web-react'

const { Row, Col } = Grid
const { Title, Text } = Typography

export default function ComputePlaceholderPage({ title, summary, capabilities = [] }) {
  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <Title heading={5} style={{ margin: 0 }}>{title}</Title>
        <Text type="secondary">{summary}</Text>
      </div>

      <Row gutter={16}>
        {capabilities.map((item) => (
          <Col key={item.label} span={8}>
            <Card bodyStyle={{ padding: 20 }} style={{ height: '100%' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 8 }}>
                {item.label}
              </div>
              <Text type="secondary">{item.description}</Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
