# Phase 2: 核心功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI 数据副驾驶、多模态检索工作台、数据治理目录页、湖查询能力收口四大核心功能。

**Architecture:** 基于 Phase 1 的 Umi + Ant Design Pro 基础架构，实现业务功能页面。AI 副驾驶使用 SSE 流式返回，检索工作台使用混合布局展示结果，数据治理使用 AntV G6 有向图展示血缘关系。

**Tech Stack:** Umi 4, React 18, Ant Design 5, ProComponents, AntV G6, TypeScript

---

## Task 1: AI 数据副驾驶 (BL-006)

**Files:**
- Create: `src/pages/query/copilot/index.tsx`
- Create: `src/pages/query/copilot/components/ChatMessage.tsx`
- Create: `src/pages/query/copilot/components/ReasoningPanel.tsx`
- Create: `src/pages/query/copilot/components/ResultTable.tsx`

### Requirements

1. 自然语言转 SQL 查询
2. 推理过程完整展示（意图理解 → SQL 生成 → 执行步骤）
3. 支持上下文追问
4. 流式返回推理过程

### Implementation

#### Step 1: 创建副驾驶主页面

创建 `src/pages/query/copilot/index.tsx`:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, List, Space, Typography, Spin } from 'antd';
import { SendOutlined, ClearOutlined } from '@ant-design/icons';
import ChatMessage from './components/ChatMessage';
import ReasoningPanel from './components/ReasoningPanel';
import { copilotApi, CopilotResponse } from '@/services/api';

const { Text } = Typography;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: CopilotResponse['reasoning'];
  sql?: string;
  execution?: CopilotResponse['execution'];
  result?: CopilotResponse['result'];
}

const CopilotPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      const response = await copilotApi.chat({
        message: inputValue,
        conversation_id: conversationId,
      });

      if (response.code === 0) {
        const assistantMessage: Message = {
          id: response.data.message_id,
          role: 'assistant',
          content: response.data.sql,
          reasoning: response.data.reasoning,
          sql: response.data.sql,
          execution: response.data.execution,
          result: response.data.result,
        };

        setMessages(prev => [...prev, assistantMessage]);
        setConversationId(response.data.conversation_id);
      }
    } catch (error) {
      console.error('Copilot error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setConversationId(undefined);
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)' }}>
      {/* 对话区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginRight: 16 }}>
        <Card
          title="AI 数据副驾驶"
          extra={
            <Button icon={<ClearOutlined />} onClick={handleClear}>
              清空对话
            </Button>
          }
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          bodyStyle={{ flex: 1, overflow: 'auto', padding: '16px' }}
        >
          <List
            dataSource={messages}
            renderItem={message => <ChatMessage message={message} />}
          />
          {loading && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <Spin tip="思考中..." />
            </div>
          )}
          <div ref={messagesEndRef} />
        </Card>

        {/* 输入框 */}
        <div style={{ marginTop: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onPressEnter={handleSend}
              placeholder="输入您的问题，例如：查询最近7天的文件数量"
              disabled={loading}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
            >
              发送
            </Button>
          </Space.Compact>
        </div>
      </div>

      {/* 推理面板 */}
      <div style={{ width: 400 }}>
        <ReasoningPanel messages={messages} />
      </div>
    </div>
  );
};

export default CopilotPage;
```

#### Step 2: 创建消息组件

创建 `src/pages/query/copilot/components/ChatMessage.tsx`:

```tsx
import React from 'react';
import { List, Avatar, Typography, Tag } from 'antd';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';
import ResultTable from './ResultTable';

const { Text, Paragraph } = Typography;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: any;
  sql?: string;
  execution?: any;
  result?: any;
}

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <List.Item style={{ border: 'none', padding: '8px 0' }}>
      <List.Item.Meta
        avatar={
          <Avatar
            icon={isUser ? <UserOutlined /> : <RobotOutlined />}
            style={{ backgroundColor: isUser ? '#1890ff' : '#52c41a' }}
          />
        }
        title={
          <Text strong>{isUser ? '您' : 'AI 助手'}</Text>
        }
        description={
          <div>
            {isUser ? (
              <Paragraph>{message.content}</Paragraph>
            ) : (
              <>
                {message.sql && (
                  <div style={{ marginBottom: 8 }}>
                    <Tag color="blue">生成的 SQL</Tag>
                    <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                      {message.sql}
                    </pre>
                  </div>
                )}
                {message.execution && (
                  <div style={{ marginBottom: 8 }}>
                    <Tag color={message.execution.status === 'success' ? 'green' : 'red'}>
                      {message.execution.status === 'success' ? '执行成功' : '执行失败'}
                    </Tag>
                    <Text type="secondary">
                      耗时: {message.execution.duration_ms}ms | 
                      行数: {message.execution.row_count}
                    </Text>
                  </div>
                )}
                {message.result && <ResultTable result={message.result} />}
              </>
            )}
          </div>
        }
      />
    </List.Item>
  );
};

export default ChatMessage;
```

#### Step 3: 创建推理面板组件

创建 `src/pages/query/copilot/components/ReasoningPanel.tsx`:

```tsx
import React from 'react';
import { Card, Collapse, Tag, Typography, Descriptions } from 'antd';
import { BulbOutlined, CodeOutlined, ThunderboltOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: {
    intent: string;
    entities: string[];
    time_range?: string;
    filters?: Record<string, any>;
  };
  sql?: string;
  execution?: {
    status: string;
    duration_ms?: number;
    row_count?: number;
  };
}

interface ReasoningPanelProps {
  messages: Message[];
}

const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ messages }) => {
  const lastAssistantMessage = [...messages]
    .reverse()
    .find(m => m.role === 'assistant' && m.reasoning);

  if (!lastAssistantMessage?.reasoning) {
    return (
      <Card title="推理过程" style={{ height: '100%' }}>
        <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
          发送消息后，推理过程将在这里显示
        </div>
      </Card>
    );
  }

  const { reasoning, sql, execution } = lastAssistantMessage;

  return (
    <Card title="推理过程" style={{ height: '100%' }}>
      <Collapse defaultActiveKey={['intent', 'sql', 'execution']}>
        <Collapse.Panel
          header={
            <span>
              <BulbOutlined style={{ marginRight: 8 }} />
              意图理解
            </span>
          }
          key="intent"
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="识别意图">
              <Tag color="blue">{reasoning.intent}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="提取实体">
              {reasoning.entities?.map((entity, index) => (
                <Tag key={index}>{entity}</Tag>
              ))}
            </Descriptions.Item>
            {reasoning.time_range && (
              <Descriptions.Item label="时间范围">
                <Tag color="orange">{reasoning.time_range}</Tag>
              </Descriptions.Item>
            )}
            {reasoning.filters && Object.keys(reasoning.filters).length > 0 && (
              <Descriptions.Item label="筛选条件">
                {Object.entries(reasoning.filters).map(([key, value]) => (
                  <Tag key={key} color="purple">
                    {key}: {String(value)}
                  </Tag>
                ))}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Collapse.Panel>

        <Collapse.Panel
          header={
            <span>
              <CodeOutlined style={{ marginRight: 8 }} />
              SQL 生成
            </span>
          }
          key="sql"
        >
          {sql ? (
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, margin: 0 }}>
              {sql}
            </pre>
          ) : (
            <Text type="secondary">暂无 SQL</Text>
          )}
        </Collapse.Panel>

        <Collapse.Panel
          header={
            <span>
              <ThunderboltOutlined style={{ marginRight: 8 }} />
              执行步骤
            </span>
          }
          key="execution"
        >
          {execution ? (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="执行状态">
                <Tag color={execution.status === 'success' ? 'green' : 'red'}>
                  {execution.status === 'success' ? '成功' : '失败'}
                </Tag>
              </Descriptions.Item>
              {execution.duration_ms && (
                <Descriptions.Item label="耗时">
                  <Text>{execution.duration_ms} ms</Text>
                </Descriptions.Item>
              )}
              {execution.row_count !== undefined && (
                <Descriptions.Item label="结果行数">
                  <Text>{execution.row_count} 行</Text>
                </Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <Text type="secondary">暂无执行信息</Text>
          )}
        </Collapse.Panel>
      </Collapse>
    </Card>
  );
};

export default ReasoningPanel;
```

#### Step 4: 创建结果表格组件

创建 `src/pages/query/copilot/components/ResultTable.tsx`:

```tsx
import React from 'react';
import { Table, Button, Space, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';

interface ResultTableProps {
  result: {
    columns: string[];
    rows: any[];
  };
}

const ResultTable: React.FC<ResultTableProps> = ({ result }) => {
  const { columns, rows } = result;

  const tableColumns = columns.map(col => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
  }));

  const tableData = rows.map((row, index) => {
    const record: any = { key: index };
    columns.forEach((col, colIndex) => {
      record[col] = row[colIndex];
    });
    return record;
  });

  const handleExport = () => {
    const csv = [columns.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query_result.csv';
    a.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
  };

  return (
    <div>
      <div style={{ marginBottom: 8, textAlign: 'right' }}>
        <Space>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleExport}
          >
            导出 CSV
          </Button>
        </Space>
      </div>
      <Table
        columns={tableColumns}
        dataSource={tableData}
        size="small"
        pagination={{ pageSize: 10 }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
};

export default ResultTable;
```

#### Step 5: 提交

```bash
git add src/pages/query/copilot/
git commit -m "feat: add AI copilot page with reasoning panel"
```

---

## Task 2: 多模态检索工作台 (BL-007)

**Files:**
- Create: `src/pages/query/retrieval/index.tsx`
- Create: `src/pages/query/retrieval/components/ImageResultGrid.tsx`
- Create: `src/pages/query/retrieval/components/TextResultList.tsx`

### Requirements

1. 文搜图：文本查询 → 返回相关图片
2. 文搜文：文本查询 → 返回相关文本
3. 混合布局展示结果

### Implementation

#### Step 1: 创建检索主页面

创建 `src/pages/query/retrieval/index.tsx`:

```tsx
import React, { useState } from 'react';
import { Card, Input, Select, Row, Col, Space, Tag, Empty, Spin, message } from 'antd';
import { SearchOutlined, PictureOutlined, FileTextOutlined } from '@ant-design/icons';
import ImageResultGrid from './components/ImageResultGrid';
import TextResultList from './components/TextResultList';
import { searchApi, SearchResult } from '@/services/api';

const { Search } = Input;
const { Option } = Select;

const RetrievalPage: React.FC = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<'text' | 'image' | 'hybrid'>('hybrid');
  const [total, setTotal] = useState(0);

  const handleSearch = async (value: string) => {
    if (!value.trim()) {
      message.warning('请输入搜索内容');
      return;
    }

    setLoading(true);
    try {
      const response = await searchApi.search({
        query: value,
        mode: searchType,
        limit: 20,
      });

      if (response.code === 0) {
        setResults(response.data.results);
        setTotal(response.data.total);
      } else {
        message.error('搜索失败');
      }
    } catch (error) {
      message.error('搜索请求失败');
    } finally {
      setLoading(false);
    }
  };

  const imageResults = results.filter(r => r.type === 'image');
  const textResults = results.filter(r => r.type === 'text');

  return (
    <div style={{ padding: 24 }}>
      {/* 搜索区 */}
      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Search
            placeholder="输入搜索内容，例如：巡检图片、告警记录"
            enterButton={<><SearchOutlined /> 搜索</>}
            size="large"
            onSearch={handleSearch}
            loading={loading}
          />
          <Space>
            <span>搜索类型：</span>
            <Select value={searchType} onChange={setSearchType} style={{ width: 120 }}>
              <Option value="hybrid">
                <Space>
                  <span>混合</span>
                  <Tag color="blue">推荐</Tag>
                </Space>
              </Option>
              <Option value="image">
                <Space>
                  <PictureOutlined />
                  <span>文搜图</span>
                </Space>
              </Option>
              <Option value="text">
                <Space>
                  <FileTextOutlined />
                  <span>文搜文</span>
                </Space>
              </Option>
            </Select>
            {total > 0 && (
              <Tag color="green">找到 {total} 条结果</Tag>
            )}
          </Space>
        </Space>
      </Card>

      {/* 结果区 */}
      <Spin spinning={loading}>
        {results.length === 0 && !loading ? (
          <Card>
            <Empty description="输入关键词开始搜索" />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {/* 图片结果 */}
            {imageResults.length > 0 && (
              <Col span={searchType === 'image' ? 24 : 12}>
                <Card title={<><PictureOutlined /> 图片结果 ({imageResults.length})</>}>
                  <ImageResultGrid results={imageResults} />
                </Card>
              </Col>
            )}

            {/* 文本结果 */}
            {textResults.length > 0 && (
              <Col span={searchType === 'text' ? 24 : 12}>
                <Card title={<><FileTextOutlined /> 文本结果 ({textResults.length})</>}>
                  <TextResultList results={textResults} />
                </Card>
              </Col>
            )}
          </Row>
        )}
      </Spin>
    </div>
  );
};

export default RetrievalPage;
```

#### Step 2: 创建图片结果网格组件

创建 `src/pages/query/retrieval/components/ImageResultGrid.tsx`:

```tsx
import React, { useState } from 'react';
import { Row, Col, Card, Modal, Typography, Tag } from 'antd';
import { ZoomInOutlined } from '@ant-design/icons';
import { SearchResult } from '@/services/api';

const { Text } = Typography;

interface ImageResultGridProps {
  results: SearchResult[];
}

const ImageResultGrid: React.FC<ImageResultGridProps> = ({ results }) => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState<SearchResult | null>(null);

  const handlePreview = (result: SearchResult) => {
    setPreviewImage(result);
    setPreviewVisible(true);
  };

  return (
    <>
      <Row gutter={[16, 16]}>
        {results.map(result => (
          <Col key={result.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              cover={
                <div
                  style={{
                    height: 200,
                    background: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => handlePreview(result)}
                >
                  {result.content.thumbnail ? (
                    <img
                      src={result.content.thumbnail}
                      alt={result.id}
                      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <ZoomInOutlined style={{ fontSize: 48, color: '#999' }} />
                  )}
                </div>
              }
              size="small"
            >
              <Card.Meta
                title={
                  <Text ellipsis style={{ fontSize: 12 }}>
                    {result.content.source_file || '未知来源'}
                  </Text>
                }
                description={
                  <Tag color="blue">
                    相似度: {(result.score * 100).toFixed(1)}%
                  </Tag>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        open={previewVisible}
        title="图片预览"
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width={800}
      >
        {previewImage && (
          <div style={{ textAlign: 'center' }}>
            <img
              src={previewImage.content.url || previewImage.content.thumbnail}
              alt={previewImage.id}
              style={{ maxWidth: '100%' }}
            />
            <div style={{ marginTop: 16 }}>
              <Tag color="blue">相似度: {(previewImage.score * 100).toFixed(1)}%</Tag>
              <Tag>来源: {previewImage.content.source_file}</Tag>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ImageResultGrid;
```

#### Step 3: 创建文本结果列表组件

创建 `src/pages/query/retrieval/components/TextResultList.tsx`:

```tsx
import React from 'react';
import { List, Card, Typography, Tag, Space } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { SearchResult } from '@/services/api';

const { Text, Paragraph } = Typography;

interface TextResultListProps {
  results: SearchResult[];
  query?: string;
}

const highlightKeywords = (text: string, query?: string) => {
  if (!query || !text) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

const TextResultList: React.FC<TextResultListProps> = ({ results, query }) => {
  return (
    <List
      dataSource={results}
      renderItem={result => (
        <List.Item>
          <Card size="small" style={{ width: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <FileTextOutlined />
                <Text strong>{result.content.title || '无标题'}</Text>
                <Tag color="blue">
                  相似度: {(result.score * 100).toFixed(1)}%
                </Tag>
              </Space>
              {result.content.snippet && (
                <Paragraph
                  ellipsis={{ rows: 2 }}
                  dangerouslySetInnerHTML={{
                    __html: highlightKeywords(result.content.snippet, query),
                  }}
                />
              )}
              <Space>
                <Tag>来源: {result.content.source_file || '未知'}</Tag>
              </Space>
            </Space>
          </Card>
        </List.Item>
      )}
    />
  );
};

export default TextResultList;
```

#### Step 4: 提交

```bash
git add src/pages/query/retrieval/
git commit -m "feat: add multimodal retrieval page with image and text results"
```

---

## Task 3: 数据治理目录页 (BL-101)

**Files:**
- Create: `src/pages/governance/catalog/index.tsx`
- Create: `src/pages/governance/catalog/components/LineageGraph.tsx`
- Create: `src/pages/governance/catalog/components/MetadataPanel.tsx`

### Requirements

1. Catalog → Schema → Table 三级目录
2. 元数据和治理标签展示
3. 有向图可视化展示血缘关系

### Implementation

#### Step 1: 创建数据目录主页面

创建 `src/pages/governance/catalog/index.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { Card, Tree, Row, Col, Descriptions, Tag, Empty, Spin, Tabs, Badge } from 'antd';
import { DatabaseOutlined, TableOutlined, FolderOutlined } from '@ant-design/icons';
import MetadataPanel from './components/MetadataPanel';
import LineageGraph from './components/LineageGraph';
import { datasetApi, Dataset } from '@/services/api';

interface TreeNode {
  key: string;
  title: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  isLeaf?: boolean;
}

const CatalogPage: React.FC = () => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const response = await datasetApi.getDatasets();
      if (response.code === 0) {
        // 构建树结构
        const catalogs = new Map<string, Map<string, Dataset[]>>();
        
        response.data.forEach(dataset => {
          const parts = dataset.name.split('.');
          const catalog = parts[0] || 'default';
          const schema = parts[1] || 'public';
          
          if (!catalogs.has(catalog)) {
            catalogs.set(catalog, new Map());
          }
          const schemaMap = catalogs.get(catalog)!;
          if (!schemaMap.has(schema)) {
            schemaMap.set(schema, []);
          }
          schemaMap.get(schema)!.push(dataset);
        });

        const tree: TreeNode[] = [];
        catalogs.forEach((schemaMap, catalog) => {
          const catalogNode: TreeNode = {
            key: catalog,
            title: catalog,
            icon: <DatabaseOutlined />,
            children: [],
          };

          schemaMap.forEach((datasets, schema) => {
            const schemaNode: TreeNode = {
              key: `${catalog}.${schema}`,
              title: schema,
              icon: <FolderOutlined />,
              children: datasets.map(d => ({
                key: d.id,
                title: d.name,
                icon: <TableOutlined />,
                isLeaf: true,
              })),
            };
            catalogNode.children!.push(schemaNode);
          });

          tree.push(catalogNode);
        });

        setTreeData(tree);
      }
    } catch (error) {
      console.error('Load datasets error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (selectedKeys: React.Key[]) => {
    const key = selectedKeys[0] as string;
    if (key && !key.includes('.')) {
      // 选中的是表
      try {
        const response = await datasetApi.getDataset(key);
        if (response.code === 0) {
          setSelectedDataset(response.data);
        }
      } catch (error) {
        console.error('Load dataset error:', error);
      }
    }
  };

  return (
    <Row gutter={16} style={{ height: 'calc(100vh - 120px)' }}>
      {/* 左侧目录树 */}
      <Col span={6}>
        <Card title="数据目录" style={{ height: '100%' }}>
          <Spin spinning={loading}>
            {treeData.length > 0 ? (
              <Tree
                showIcon
                defaultExpandAll
                onSelect={handleSelect}
                treeData={treeData}
              />
            ) : (
              <Empty description="暂无数据" />
            )}
          </Spin>
        </Card>
      </Col>

      {/* 右侧详情区 */}
      <Col span={18}>
        {selectedDataset ? (
          <Tabs defaultActiveKey="metadata">
            <Tabs.TabPane tab="元数据" key="metadata">
              <MetadataPanel dataset={selectedDataset} />
            </Tabs.TabPane>
            <Tabs.TabPane tab="血缘关系" key="lineage">
              <Card>
                <LineageGraph datasetId={selectedDataset.id} />
              </Card>
            </Tabs.TabPane>
          </Tabs>
        ) : (
          <Card style={{ height: '100%' }}>
            <Empty description="选择数据集查看详情" />
          </Card>
        )}
      </Col>
    </Row>
  );
};

export default CatalogPage;
```

#### Step 2: 创建元数据面板组件

创建 `src/pages/governance/catalog/components/MetadataPanel.tsx`:

```tsx
import React from 'react';
import { Card, Descriptions, Tag, Table, Space, Typography } from 'antd';
import { Dataset } from '@/services/api';

const { Text } = Typography;

interface MetadataPanelProps {
  dataset: Dataset;
}

const MetadataPanel: React.FC<MetadataPanelProps> = ({ dataset }) => {
  const columns = [
    {
      title: '列名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-',
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title="基本信息">
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="名称">{dataset.name}</Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color="blue">{dataset.type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="行数">{dataset.row_count?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="大小">
            {dataset.size_bytes ? `${(dataset.size_bytes / 1024 / 1024).toFixed(2)} MB` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{dataset.created_at}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{dataset.updated_at}</Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>
            {dataset.description || '无描述'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="治理标签">
        <Space>
          <Tag color="green">数据集</Tag>
          <Tag color="blue">{dataset.type}</Tag>
          <Tag>已治理</Tag>
        </Space>
      </Card>
    </Space>
  );
};

export default MetadataPanel;
```

#### Step 3: 创建血缘图组件

创建 `src/pages/governance/catalog/components/LineageGraph.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { Card, Empty } from 'antd';

interface LineageGraphProps {
  datasetId: string;
}

const LineageGraph: React.FC<LineageGraphProps> = ({ datasetId }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 模拟血缘数据
    const mockData = {
      nodes: [
        { id: 'source1', label: 'S3 数据源', type: 'source' },
        { id: 'source2', label: 'FTP 数据源', type: 'source' },
        { id: 'etl1', label: 'ETL 处理', type: 'process' },
        { id: 'dataset1', label: '当前数据集', type: 'dataset' },
        { id: 'dataset2', label: '派生数据集', type: 'dataset' },
        { id: 'service1', label: '检索服务', type: 'service' },
      ],
      edges: [
        { source: 'source1', target: 'etl1' },
        { source: 'source2', target: 'etl1' },
        { source: 'etl1', target: 'dataset1' },
        { source: 'dataset1', target: 'dataset2' },
        { source: 'dataset1', target: 'service1' },
      ],
    };

    // 使用简单的 SVG 渲染（实际项目中应使用 AntV G6）
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '400');
    svg.style.background = '#fafafa';

    // 绘制节点
    const nodePositions: Record<string, { x: number; y: number }> = {
      source1: { x: 100, y: 100 },
      source2: { x: 100, y: 250 },
      etl1: { x: 300, y: 175 },
      dataset1: { x: 500, y: 175 },
      dataset2: { x: 700, y: 100 },
      service1: { x: 700, y: 250 },
    };

    // 绘制边
    mockData.edges.forEach(edge => {
      const from = nodePositions[edge.source];
      const to = nodePositions[edge.target];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(from.x + 60));
      line.setAttribute('y1', String(from.y + 20));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y + 20));
      line.setAttribute('stroke', '#1890ff');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(line);
    });

    // 绘制节点
    mockData.nodes.forEach(node => {
      const pos = nodePositions[node.id];
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(pos.x));
      rect.setAttribute('y', String(pos.y));
      rect.setAttribute('width', '120');
      rect.setAttribute('height', '40');
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', node.id === dataset1.id ? '#e6f7ff' : '#fff');
      rect.setAttribute('stroke', node.id === dataset1.id ? '#1890ff' : '#d9d9d9');
      group.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(pos.x + 60));
      text.setAttribute('y', String(pos.y + 25));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '12');
      text.textContent = node.label;
      group.appendChild(text);

      svg.appendChild(group);
    });

    // 添加箭头标记
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#1890ff');
    marker.appendChild(polygon);
    defs.appendChild(marker);
    svg.appendChild(defs);

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(svg);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [datasetId]);

  return (
    <div ref={containerRef} style={{ minHeight: 400 }}>
      {!datasetId && <Empty description="暂无血缘数据" />}
    </div>
  );
};

export default LineageGraph;
```

#### Step 4: 提交

```bash
git add src/pages/governance/catalog/
git commit -m "feat: add data governance catalog page with lineage graph"
```

---

## Task 4: 湖查询能力收口 (BL-102)

**Files:**
- Verify: `src/pages/query/sql/index.tsx` (placeholder)
- Verify: `src/pages/query/retrieval/index.tsx` (Task 2)
- Verify: `src/pages/query/copilot/index.tsx` (Task 1)

### Requirements

1. SQL 查询、统一检索、AI 副驾驶各自独立页面
2. 侧边栏分开入口
3. 清晰的职责边界

### Verification

Verify the route structure in `config/routes.ts` has:
- `/query/sql` - SQL 查询页面
- `/query/retrieval` - 统一检索页面
- `/query/copilot` - AI 副驾驶页面

All three pages should be independent with clear separation of concerns.

---

## Task 5: 构建验证

### Step 1: 构建项目

```bash
npm run build
```

### Step 2: 验证所有新页面

Verify all new pages exist:
- `src/pages/query/copilot/index.tsx`
- `src/pages/query/retrieval/index.tsx`
- `src/pages/governance/catalog/index.tsx`

### Step 3: 提交

```bash
git add .
git commit -m "feat: complete phase 2 core features"
```

---

*Plan Version: V1.0*  
*Created: 2026-06-03*
