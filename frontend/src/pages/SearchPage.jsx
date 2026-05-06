import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Button, Space, Tag, Input, Select, Tabs, Form, Typography,
  Empty, Grid, Message, Alert, InputNumber
} from '@arco-design/web-react'
import {
  IconSearch, IconCommand, IconCopy
} from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import { truncateText } from '@/utils/format'

const { Title, Text, Paragraph } = Typography
const { Row, Col } = Grid
const TabPane = Tabs.TabPane
const Option = Select.Option
const TextArea = Input.TextArea

export default function SearchPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('vector')

  const [nlPrompt, setNlPrompt] = useState('查询最近导入的图片资产')
  const [generatedSql, setGeneratedSql] = useState('')
  const [convertingSql, setConvertingSql] = useState(false)

  const [vectorPrompt, setVectorPrompt] = useState('红色背景的图片')
  const [convertingVector, setConvertingVector] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('text')
  const [limit, setLimit] = useState(10)
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleNlToSql = async () => {
    if (!nlPrompt.trim()) { Message.warning('请输入自然语言'); return }
    setConvertingSql(true)
    try {
      const r = await api.convertNlToSql({ prompt: nlPrompt, top_k: 10 })
      setGeneratedSql(r?.sql || '')
      Message.success(r?.reasoning || '已生成 SQL 草案')
    } catch (e) {
      Message.error(getErrorMessage(e, 'NL2SQL 失败'))
    } finally {
      setConvertingSql(false)
    }
  }

  const copySqlAndJump = async () => {
    if (!generatedSql) return
    try { await navigator.clipboard?.writeText(generatedSql); Message.success('SQL 已复制，正在跳转 SQL 编辑器') } catch { /* */ }
    navigate('/mpp/sql')
  }

  const handleNlToVector = async () => {
    if (!vectorPrompt.trim()) { Message.warning('请输入语义描述'); return }
    setConvertingVector(true)
    try {
      const r = await api.convertNlToVector({ prompt: vectorPrompt, top_k: limit })
      const data = r?.data || {}
      setQuery(data.query || vectorPrompt)
      setMode(data.mode || 'text')
      setLimit(Number(data.top_k || 10))
      Message.success(data.command_text || '已生成检索指令')
    } catch (e) {
      Message.error(getErrorMessage(e, '生成检索指令失败'))
    } finally {
      setConvertingVector(false)
    }
  }

  const handleVectorSearch = async () => {
    if (!query.trim()) { Message.warning('请输入检索内容'); return }
    setSearching(true)
    try {
      const r = await api.search(query.trim(), mode, Number(limit))
      if (!r.success) throw new Error(r.message || '检索失败')
      setResults(Array.isArray(r.results) ? r.results : [])
      setSearched(true)
    } catch (e) {
      setResults([])
      setSearched(true)
      Message.error(getErrorMessage(e, '检索失败'))
    } finally {
      setSearching(false)
    }
  }

  return (
    <div style={{ padding: 24, background: 'var(--color-fill-1)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>查询分析</Title>
          <Text type="secondary">向量检索 · 自然语言生成 SQL</Text>
        </div>
        <Button icon={<IconCommand />} onClick={() => navigate('/mpp/sql')}>前往 SQL 编辑器</Button>
      </div>

      <Alert
        type="info"
        content="本页面专注于多模态语义检索与自然语言查询入口；Doris SQL 执行已统一收口到「湖运维 → SQL 编辑器」。"
        style={{ marginBottom: 16 }}
        closable
      />

      <Card bodyStyle={{ padding: 0 }}>
        <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
          <TabPane key="vector" title={<span><IconSearch /> 向量检索</span>} />
          <TabPane key="nl" title={<span><IconCommand /> 自然语言生成</span>} />
        </Tabs>

        <div style={{ padding: 16 }}>
          {activeTab === 'vector' && (
            <>
              <Form layout="inline" style={{ marginBottom: 16 }}>
                <Form.Item label="查询内容" style={{ flex: 1, minWidth: 300 }}>
                  <Input value={query} onChange={setQuery} placeholder="语义描述、关键词或图片描述" allowClear />
                </Form.Item>
                <Form.Item label="模式">
                  <Select value={mode} onChange={setMode} style={{ width: 100 }}>
                    <Option value="text">文本</Option>
                    <Option value="image">图像</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="Top K">
                  <InputNumber value={limit} onChange={setLimit} min={1} max={100} style={{ width: 90 }} />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" icon={<IconSearch />} onClick={handleVectorSearch} loading={searching}>开始检索</Button>
                </Form.Item>
              </Form>
              {!searched ? (
                <Empty description="输入查询内容开始检索" />
              ) : results.length === 0 ? (
                <Empty description="没有匹配的结果" />
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {results.map((r, i) => (
                    <Card key={`${r.file_hash}-${i}`} bodyStyle={{ padding: 16 }} hoverable>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <Title heading={6} style={{ margin: 0 }}>{r.doc_name || '未命名文件'}</Title>
                          <Space size="small" style={{ marginTop: 4 }}>
                            <Tag color="arcoblue">{r.doc_type || '未知'}</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>距离 {Number(r.distance ?? 0).toFixed(4)}</Text>
                          </Space>
                        </div>
                        <Tag>#{i + 1}</Tag>
                      </div>
                      <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                        {truncateText(r.text || '该结果暂无文本摘要', 200)}
                      </Paragraph>
                      <Text type="secondary" style={{ fontSize: 11 }}>来源：{r.source_uri || '本地入库'}</Text>
                    </Card>
                  ))}
                </Space>
              )}
            </>
          )}

          {activeTab === 'nl' && (
            <Row gutter={24}>
              <Col span={12}>
                <Title heading={6}>NL → SQL</Title>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>用自然语言描述查询意图，生成 SQL 草案后到「湖运维 → SQL 编辑器」执行</Paragraph>
                <TextArea value={nlPrompt} onChange={setNlPrompt} autoSize={{ minRows: 3 }} style={{ marginBottom: 12 }} />
                <Space>
                  <Button type="primary" icon={<IconCommand />} onClick={handleNlToSql} loading={convertingSql}>生成 SQL</Button>
                  {generatedSql && (
                    <Button icon={<IconCopy />} onClick={copySqlAndJump}>复制并跳转执行</Button>
                  )}
                </Space>
                {generatedSql && (
                  <Card size="small" style={{ marginTop: 12 }}>
                    <Text code copyable style={{ fontSize: 12 }}>{generatedSql}</Text>
                  </Card>
                )}
              </Col>
              <Col span={12}>
                <Title heading={6}>NL → 向量检索</Title>
                <Paragraph type="secondary" style={{ fontSize: 12 }}>语义描述自动生成向量检索指令并填入左侧检索表单</Paragraph>
                <TextArea value={vectorPrompt} onChange={setVectorPrompt} autoSize={{ minRows: 3 }} style={{ marginBottom: 12 }} />
                <Button type="primary" icon={<IconSearch />} onClick={handleNlToVector} loading={convertingVector}>生成检索指令</Button>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                  推荐模式：<Tag size="small">{mode}</Tag>　Top K：<Tag size="small">{limit}</Tag>
                </Text>
              </Col>
            </Row>
          )}
        </div>
      </Card>
    </div>
  )
}
