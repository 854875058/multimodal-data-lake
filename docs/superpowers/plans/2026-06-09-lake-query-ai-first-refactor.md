# Lake Query AI-First Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `湖查询` module so `AI 数据副驾驶` is the default entry, while SQL, unified retrieval, and annotation remain focused professional workspaces.

**Architecture:** Keep the existing backend APIs and split the current `LakeQueryPage.jsx` into route orchestration, focused workspaces, shared query components, and query utilities. Collapse `向量检索`、`多模态检索`、`混合检索` from sidebar entries into strategies inside the `统一检索` workspace, with legacy route compatibility.

**Tech Stack:** React 18, React Router hash routes, Arco Design, Vitest, Testing Library, Vite.

---

## File Structure

Create this feature folder:

```text
frontend/src/pages/lake-query/
  LakeQueryPage.jsx
  queryRouting.js
  queryRouting.test.js
  queryUtils.js
  queryUtils.test.js
  AiCopilotWorkspace.jsx
  AiCopilotWorkspace.test.jsx
  SqlWorkspace.jsx
  RetrievalWorkspace.jsx
  RetrievalWorkspace.test.jsx
  AnnotationWorkspace.jsx
  components/
    PromptComposer.jsx
    QueryTracePanel.jsx
    QueryShell.jsx
    QueryResultCards.jsx
    RetrievalStrategyTabs.jsx
    SqlResultPanel.jsx
  lake-query.css
```

Modify:

```text
frontend/src/App.jsx
frontend/src/navigation/navConfig.jsx
frontend/src/navigation/navConfig.test.js
frontend/src/pages/LakeQueryPage.jsx
```

Compatibility approach:

```text
frontend/src/pages/LakeQueryPage.jsx
```

becomes a thin re-export:

```jsx
export { default } from './lake-query/LakeQueryPage.jsx'
```

This avoids changing the lazy import in `App.jsx` during the same step that moves the large page.

---

### Task 1: Route and Sidebar Contract

**Files:**
- Create: `frontend/src/pages/lake-query/queryRouting.js`
- Create: `frontend/src/pages/lake-query/queryRouting.test.js`
- Modify: `frontend/src/navigation/navConfig.jsx`
- Modify: `frontend/src/navigation/navConfig.test.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the failing route utility test**

Create `frontend/src/pages/lake-query/queryRouting.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAKE_QUERY_PATH,
  getLakeQueryRouteState,
  getRetrievalPath,
  isPrimaryLakeQueryTab,
} from './queryRouting'

describe('queryRouting', () => {
  it('uses AI copilot as the lake query default', () => {
    expect(DEFAULT_LAKE_QUERY_PATH).toBe('/lake-query/copilot')
    expect(getLakeQueryRouteState()).toEqual({ activeTab: 'copilot', retrievalStrategy: 'auto', redirectTo: null })
  })

  it('keeps only product-level lake query tabs as primary tabs', () => {
    expect(isPrimaryLakeQueryTab('copilot')).toBe(true)
    expect(isPrimaryLakeQueryTab('sql')).toBe(true)
    expect(isPrimaryLakeQueryTab('retrieval')).toBe(true)
    expect(isPrimaryLakeQueryTab('annotation')).toBe(true)
    expect(isPrimaryLakeQueryTab('vector')).toBe(false)
    expect(isPrimaryLakeQueryTab('multimodal')).toBe(false)
    expect(isPrimaryLakeQueryTab('hybrid')).toBe(false)
  })

  it('maps legacy retrieval routes to the unified retrieval workspace', () => {
    expect(getLakeQueryRouteState('vector')).toEqual({
      activeTab: 'retrieval',
      retrievalStrategy: 'vector',
      redirectTo: '/lake-query/retrieval?strategy=vector',
    })
    expect(getLakeQueryRouteState('multimodal')).toEqual({
      activeTab: 'retrieval',
      retrievalStrategy: 'multimodal',
      redirectTo: '/lake-query/retrieval?strategy=multimodal',
    })
    expect(getLakeQueryRouteState('hybrid')).toEqual({
      activeTab: 'retrieval',
      retrievalStrategy: 'hybrid',
      redirectTo: '/lake-query/retrieval?strategy=hybrid',
    })
  })

  it('maps nl2sql to SQL and unknown tabs to AI copilot', () => {
    expect(getLakeQueryRouteState('nl2sql')).toEqual({
      activeTab: 'sql',
      retrievalStrategy: 'auto',
      redirectTo: '/lake-query/sql',
    })
    expect(getLakeQueryRouteState('unknown')).toEqual({
      activeTab: 'copilot',
      retrievalStrategy: 'auto',
      redirectTo: '/lake-query/copilot',
    })
  })

  it('builds unified retrieval strategy paths', () => {
    expect(getRetrievalPath('auto')).toBe('/lake-query/retrieval')
    expect(getRetrievalPath('vector')).toBe('/lake-query/retrieval?strategy=vector')
    expect(getRetrievalPath('multimodal')).toBe('/lake-query/retrieval?strategy=multimodal')
    expect(getRetrievalPath('hybrid')).toBe('/lake-query/retrieval?strategy=hybrid')
  })
})
```

- [ ] **Step 2: Run the route utility test and verify it fails**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/queryRouting.test.js
```

Expected: FAIL because `queryRouting.js` does not exist.

- [ ] **Step 3: Implement route utilities**

Create `frontend/src/pages/lake-query/queryRouting.js`:

```js
export const DEFAULT_LAKE_QUERY_PATH = '/lake-query/copilot'

export const PRIMARY_LAKE_QUERY_TABS = ['copilot', 'sql', 'retrieval', 'annotation']

export const LEGACY_RETRIEVAL_TAB_STRATEGY = {
  vector: 'vector',
  multimodal: 'multimodal',
  hybrid: 'hybrid',
}

export const RETRIEVAL_STRATEGIES = ['auto', 'semantic', 'vector', 'multimodal', 'hybrid']

export function isPrimaryLakeQueryTab(tab) {
  return PRIMARY_LAKE_QUERY_TABS.includes(tab)
}

export function normalizeRetrievalStrategy(strategy) {
  return RETRIEVAL_STRATEGIES.includes(strategy) ? strategy : 'auto'
}

export function getRetrievalPath(strategy = 'auto') {
  const normalized = normalizeRetrievalStrategy(strategy)
  return normalized === 'auto' ? '/lake-query/retrieval' : `/lake-query/retrieval?strategy=${normalized}`
}

export function getLakeQueryRouteState(tab) {
  if (!tab) {
    return { activeTab: 'copilot', retrievalStrategy: 'auto', redirectTo: null }
  }

  if (tab === 'nl2sql') {
    return { activeTab: 'sql', retrievalStrategy: 'auto', redirectTo: '/lake-query/sql' }
  }

  if (LEGACY_RETRIEVAL_TAB_STRATEGY[tab]) {
    const retrievalStrategy = LEGACY_RETRIEVAL_TAB_STRATEGY[tab]
    return {
      activeTab: 'retrieval',
      retrievalStrategy,
      redirectTo: getRetrievalPath(retrievalStrategy),
    }
  }

  if (isPrimaryLakeQueryTab(tab)) {
    return { activeTab: tab, retrievalStrategy: 'auto', redirectTo: null }
  }

  return { activeTab: 'copilot', retrievalStrategy: 'auto', redirectTo: DEFAULT_LAKE_QUERY_PATH }
}
```

- [ ] **Step 4: Run the route utility test and verify it passes**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/queryRouting.test.js
```

Expected: PASS.

- [ ] **Step 5: Write the failing navigation contract test**

Modify `frontend/src/navigation/navConfig.test.js` by adding:

```js
  it('shows only product-level lake query entries in the sidebar', () => {
    const lakeQueryGroup = navGroups.find((group) => group.key === 'lake-query')
    expect(lakeQueryGroup.items.map((item) => item.path)).toEqual([
      '/lake-query/copilot',
      '/lake-query/sql',
      '/lake-query/retrieval',
      '/lake-query/annotation',
    ])
    expect(lakeQueryGroup.items.map((item) => item.label)).toEqual([
      'AI 数据副驾驶',
      'SQL 查询',
      '统一检索',
      '自动化标注',
    ])
  })

  it('does not expose retrieval strategies as sidebar entries', () => {
    expect(allNavItems.map((item) => item.path)).not.toContain('/lake-query/vector')
    expect(allNavItems.map((item) => item.path)).not.toContain('/lake-query/multimodal')
    expect(allNavItems.map((item) => item.path)).not.toContain('/lake-query/hybrid')
  })
```

- [ ] **Step 6: Run the navigation test and verify it fails**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/navigation/navConfig.test.js
```

Expected: FAIL because `navConfig.jsx` still exposes `/lake-query/vector`, `/lake-query/multimodal`, and `/lake-query/hybrid`.

- [ ] **Step 7: Update sidebar navigation**

In `frontend/src/navigation/navConfig.jsx`, change the `lake-query` group items to:

```jsx
    items: [
      { path: '/lake-query/copilot', label: 'AI 数据副驾驶', icon: <IconRobot /> },
      { path: '/lake-query/sql', label: 'SQL 查询', icon: <IconCommand /> },
      { path: '/lake-query/retrieval', label: '统一检索', icon: <IconSearch /> },
      { path: '/lake-query/annotation', label: '自动化标注', icon: <IconExport /> },
    ],
```

Do not change first-level group titles.

- [ ] **Step 8: Update default lake query route**

In `frontend/src/App.jsx`, change:

```jsx
<Route path="/lake-query" element={<Navigate to="/lake-query/sql" replace />} />
```

to:

```jsx
<Route path="/lake-query" element={<Navigate to="/lake-query/copilot" replace />} />
```

- [ ] **Step 9: Run tests for routing and navigation**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/queryRouting.test.js frontend/src/navigation/navConfig.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit route and navigation contract**

Run:

```powershell
git add frontend/src/pages/lake-query/queryRouting.js frontend/src/pages/lake-query/queryRouting.test.js frontend/src/navigation/navConfig.jsx frontend/src/navigation/navConfig.test.js frontend/src/App.jsx
git commit -m "feat: make lake query ai first navigation"
```

---

### Task 2: Shared Query Utilities and Presentational Components

**Files:**
- Create: `frontend/src/pages/lake-query/queryUtils.js`
- Create: `frontend/src/pages/lake-query/queryUtils.test.js`
- Create: `frontend/src/pages/lake-query/components/QueryShell.jsx`
- Create: `frontend/src/pages/lake-query/components/QueryTracePanel.jsx`
- Create: `frontend/src/pages/lake-query/components/QueryResultCards.jsx`
- Create: `frontend/src/pages/lake-query/components/SqlResultPanel.jsx`
- Create: `frontend/src/pages/lake-query/lake-query.css`

- [ ] **Step 1: Write utility tests**

Create `frontend/src/pages/lake-query/queryUtils.test.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  buildTableColumns,
  compactFilters,
  formatFilters,
  getFirstMediaPath,
  mapSearchResult,
  normalizeTraceStep,
} from './queryUtils'

describe('queryUtils', () => {
  it('removes empty filter values but keeps numeric zero', () => {
    expect(compactFilters({ city_name: '南京', event_type: '', confidence_min: 0, lat: null })).toEqual({
      city_name: '南京',
      confidence_min: 0,
    })
  })

  it('formats filters with known Chinese labels', () => {
    expect(formatFilters({ city_name: '南京', confidence_min: 0.6 })).toBe('城市: 南京 / 置信度下限: 0.6')
    expect(formatFilters({})).toBe('未启用高级筛选')
  })

  it('extracts the first usable media path', () => {
    expect(getFirstMediaPath(' , /a.jpg, /b.jpg')).toBe('/a.jpg')
    expect(getFirstMediaPath('')).toBe('')
  })

  it('normalizes trace steps for display', () => {
    expect(normalizeTraceStep({ title: '选择工具', status: 'running' })).toEqual({
      key: '选择工具-running-0',
      title: '选择工具',
      status: 'running',
      detail: '',
      time: '',
    })
  })

  it('maps search results to a stable card model', () => {
    expect(mapSearchResult({ asset_id: 'a1', doc_name: '图片样本', img_src_path: '/a.jpg' }, 2)).toMatchObject({
      key: 'a1-2',
      title: '图片样本',
      imagePath: '/a.jpg',
      rank: 3,
    })
  })

  it('builds SQL table columns', () => {
    const columns = buildTableColumns(['doc_name'])
    expect(columns[0]).toMatchObject({ title: 'doc_name', dataIndex: 'doc_name', ellipsis: true })
  })
})
```

- [ ] **Step 2: Run utility tests and verify they fail**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/queryUtils.test.js
```

Expected: FAIL because `queryUtils.js` does not exist.

- [ ] **Step 3: Implement utility module**

Create `frontend/src/pages/lake-query/queryUtils.js`:

```jsx
import { Typography } from '@arco-design/web-react'

const { Text } = Typography

export const FILTER_LABELS = {
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

export function compactFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  )
}

export function formatFilters(filters = {}) {
  const entries = Object.entries(compactFilters(filters))
  if (!entries.length) return '未启用高级筛选'
  return entries.map(([key, value]) => `${FILTER_LABELS[key] || key}: ${value}`).join(' / ')
}

export function getFirstMediaPath(value) {
  return String(value || '').split(',').map((item) => item.trim()).find(Boolean) || ''
}

export function buildTableColumns(columns = []) {
  return columns.map((column) => ({
    title: column,
    dataIndex: column,
    ellipsis: true,
    render: (value) => (value == null ? <Text type="secondary">NULL</Text> : <Text code>{String(value)}</Text>),
  }))
}

export function normalizeTraceStep(step = {}, index = 0) {
  const title = step.title || step.name || `步骤 ${index + 1}`
  const status = step.status || 'pending'
  return {
    key: step.key || `${title}-${status}-${index}`,
    title,
    status,
    detail: step.detail || step.description || '',
    time: step.time || '',
  }
}

export function mapSearchResult(item = {}, index = 0) {
  const imagePath = getFirstMediaPath(item.img_src_path || item.source_uri)
  const iconPath = getFirstMediaPath(item.img_icon_path)
  const videoPath = getFirstMediaPath(item.video_path)
  return {
    key: `${item.asset_id || item.file_hash || item.id || 'result'}-${index}`,
    title: item.doc_name || item.file_name || item.asset_id || '未命名资产',
    description: item.summary || item.description || item.text || '当前结果暂无文本摘要。',
    docType: item.doc_type || 'unknown',
    eventType: item.event_type || '',
    alarmLevel: item.alarm_level || '',
    orderStatus: item.order_status || '',
    imagePath,
    iconPath,
    videoPath,
    relatedImages: Array.isArray(item.related_image_paths) ? item.related_image_paths.filter(Boolean) : [],
    raw: item,
    rank: index + 1,
  }
}
```

- [ ] **Step 4: Run utility tests and verify they pass**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/queryUtils.test.js
```

Expected: PASS.

- [ ] **Step 5: Create shared query shell**

Create `frontend/src/pages/lake-query/components/QueryShell.jsx`:

```jsx
import PageScaffold from '@/components/layout/PageScaffold'

export default function QueryShell({ title, subtitle, metrics = [], actions, children, className = '' }) {
  return (
    <PageScaffold
      title={title}
      subtitle={subtitle}
      metrics={metrics}
      actions={actions}
      className={`lake-query-page ${className}`.trim()}
    >
      {children}
    </PageScaffold>
  )
}
```

- [ ] **Step 6: Create trace panel component**

Create `frontend/src/pages/lake-query/components/QueryTracePanel.jsx`:

```jsx
import { Button, Card, Space, Tag, Typography } from '@arco-design/web-react'
import { IconRefresh } from '@arco-design/web-react/icon'
import { normalizeTraceStep, formatFilters } from '../queryUtils'

const { Paragraph, Text } = Typography

const statusColor = {
  done: 'green',
  running: 'arcoblue',
  error: 'red',
  pending: 'gray',
}

export function TraceStep({ step, index = 0 }) {
  const item = normalizeTraceStep(step, index)
  return (
    <div className="lake-query-trace-step">
      <div className="lake-query-trace-step-head">
        <strong>{item.title}</strong>
        <Tag color={statusColor[item.status] || 'gray'}>{item.status}</Tag>
      </div>
      {item.detail ? <Text type="secondary">{item.detail}</Text> : null}
      {item.time ? <Text type="secondary" className="lake-query-trace-time">{item.time}</Text> : null}
    </div>
  )
}

export default function QueryTracePanel({
  traceItems = [],
  traceStats,
  selectedTraceId,
  traceDetail,
  onRefresh,
  onSelectTrace,
}) {
  return (
    <Card title="查询轨迹" bodyStyle={{ padding: 16 }}>
      <Space className="lake-query-card-toolbar">
        <Text type="secondary">最近的查询回放</Text>
        <Button size="small" icon={<IconRefresh />} onClick={onRefresh}>刷新</Button>
      </Space>
      {traceStats ? (
        <div className="lake-query-mini-metrics">
          <div><span>总查询</span><strong>{traceStats.total_queries || 0}</strong></div>
          <div><span>成功数</span><strong>{traceStats.success_count || 0}</strong></div>
        </div>
      ) : null}
      <div className="lake-query-trace-list">
        {traceItems.map((item) => (
          <button
            key={item.trace_id}
            type="button"
            className={item.trace_id === selectedTraceId ? 'is-active' : ''}
            onClick={() => onSelectTrace(item.trace_id)}
          >
            <strong>{item.question || '未命名查询'}</strong>
            <span>{item.route || '未命名路径'} · {item.created_at || ''}</span>
          </button>
        ))}
      </div>
      {traceDetail ? (
        <div className="lake-query-trace-detail">
          <Paragraph>{traceDetail.question}</Paragraph>
          {traceDetail.route ? <Tag color="arcoblue">{traceDetail.route}</Tag> : null}
          <Text type="secondary">{formatFilters(traceDetail.filters || {})}</Text>
          {traceDetail.sql ? <Text code copyable className="lake-query-code-text">{traceDetail.sql}</Text> : null}
          {(traceDetail.steps || []).map((step, index) => <TraceStep key={step.key || index} step={step} index={index} />)}
        </div>
      ) : null}
    </Card>
  )
}
```

- [ ] **Step 7: Create result cards and SQL result panel**

Create `frontend/src/pages/lake-query/components/QueryResultCards.jsx`:

```jsx
import { Button, Card, Empty, Space, Tag, Typography } from '@arco-design/web-react'
import { IconImage, IconPlayArrow } from '@arco-design/web-react/icon'
import api from '@/api'
import { getFirstMediaPath, mapSearchResult } from '../queryUtils'

const { Paragraph, Text, Title } = Typography

function openMedia(path, kind = 'image') {
  const mediaPath = getFirstMediaPath(path)
  if (!mediaPath) return
  window.open(api.getMultimodalMediaUrl(mediaPath, kind), '_blank', 'noopener,noreferrer')
}

function MediaThumb({ path, alt = 'preview', kind = 'image', width = 104, height = 84 }) {
  const mediaPath = getFirstMediaPath(path)
  if (!mediaPath) return null
  return (
    <img
      src={api.getMultimodalMediaUrl(mediaPath, kind)}
      alt={alt}
      onClick={() => openMedia(mediaPath, kind)}
      className="lake-query-media-thumb"
      style={{ width, height }}
    />
  )
}

function DetailField({ label, value, copyable = false }) {
  if (!value) return null
  return (
    <div className="lake-query-detail-field">
      <Text type="secondary">{label}</Text>
      <Text copyable={copyable ? { text: String(value) } : false}>{String(value)}</Text>
    </div>
  )
}

export function SearchResultCard({ item, index = 0, onAddToContext }) {
  const result = mapSearchResult(item, index)
  const raw = result.raw
  return (
    <Card bodyStyle={{ padding: 14 }} hoverable>
      <div className="lake-query-result-card">
        {result.imagePath ? <MediaThumb path={result.imagePath} /> : null}
        <div className="lake-query-result-main">
          <div className="lake-query-result-head">
            <div>
              <Title heading={6}>{result.title}</Title>
              <Space size="small" wrap>
                <Tag color="arcoblue">{result.docType}</Tag>
                {result.eventType ? <Tag color="orangered">{result.eventType}</Tag> : null}
                {result.alarmLevel ? <Tag color="gold">等级 {result.alarmLevel}</Tag> : null}
                {result.orderStatus ? <Tag color="purple">工单 {result.orderStatus}</Tag> : null}
              </Space>
            </div>
            <Tag>#{result.rank}</Tag>
          </div>
          <Paragraph type="secondary">{result.description}</Paragraph>
          <div className="lake-query-result-details">
            <DetailField label="告警时间" value={raw.alarm_time} />
            <DetailField label="采集时间" value={raw.captured_at} />
            <DetailField label="设备点位" value={raw.device_name} />
            <DetailField label="告警地址" value={raw.address} />
            <DetailField label="算法" value={raw.algorithm_name} />
            <DetailField label="原图路径" value={raw.img_src_path || raw.source_uri} copyable />
            <DetailField label="标注路径" value={raw.img_icon_path} copyable />
            <DetailField label="视频路径" value={raw.video_path} copyable />
          </div>
          <Space size="small" wrap>
            {result.imagePath ? <Button size="small" icon={<IconImage />} onClick={() => openMedia(result.imagePath, 'image')}>查看图片</Button> : null}
            {result.iconPath ? <Button size="small" onClick={() => openMedia(result.iconPath, 'image')}>查看标注图</Button> : null}
            {result.videoPath ? <Button size="small" icon={<IconPlayArrow />} onClick={() => openMedia(result.videoPath, 'video')}>播放视频</Button> : null}
            {onAddToContext ? <Button size="small" onClick={() => onAddToContext(raw)}>加入 AI 上下文</Button> : null}
          </Space>
        </div>
      </div>
    </Card>
  )
}

export default function SearchResultList({ results = [], searched = false, emptyText = '没有匹配结果', onAddToContext }) {
  if (!searched) return <Empty description="输入检索内容后开始查询" />
  if (!results.length) return <Empty description={emptyText} />
  return (
    <div className="lake-query-result-list">
      {results.map((item, index) => (
        <SearchResultCard key={`${item.file_hash || item.asset_id || item.id || index}-${index}`} item={item} index={index} onAddToContext={onAddToContext} />
      ))}
    </div>
  )
}
```

Create `frontend/src/pages/lake-query/components/SqlResultPanel.jsx`:

```jsx
import { Empty, Space, Table, Tag, Typography } from '@arco-design/web-react'
import { buildTableColumns } from '../queryUtils'

const { Text } = Typography

export function ResultSummary({ result }) {
  if (!result) return null
  return (
    <Space className="lake-query-result-summary" size="large" wrap>
      {result.elapsed != null ? <Text type="secondary">耗时 <Text code>{result.elapsed}s</Text></Text> : null}
      {result.affectedRows != null ? <Text type="secondary">影响 <Text code>{result.affectedRows}</Text> 行</Text> : null}
      {Array.isArray(result.rows) ? <Text type="secondary">返回 <Text code>{result.rows.length}</Text> 行</Text> : null}
      {result.hasMore ? <Tag color="orange">结果已截断</Tag> : null}
      {result.message ? <Text type="secondary">{result.message}</Text> : null}
    </Space>
  )
}

export default function SqlResultPanel({ result, pageSize = 50 }) {
  if (!result) return null
  return (
    <div className="lake-query-sql-result">
      <ResultSummary result={result} />
      {result.columns?.length > 0 ? (
        <Table
          columns={buildTableColumns(result.columns)}
          data={result.rows || []}
          rowKey={(_, index) => index}
          pagination={{ pageSize }}
          scroll={{ x: 'max-content' }}
          size="small"
          border
        />
      ) : (
        <Empty description="无结果集" />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Create page-level CSS**

Create `frontend/src/pages/lake-query/lake-query.css`:

```css
.lake-query-page {
  min-height: 100%;
}

.lake-query-grid {
  display: grid;
  gap: 16px;
}

.lake-query-grid[data-columns="main-rail"] {
  grid-template-columns: minmax(0, 1fr) 340px;
}

.lake-query-grid[data-columns="side-main"] {
  grid-template-columns: 360px minmax(0, 1fr);
}

.lake-query-grid[data-columns="three"] {
  grid-template-columns: 360px minmax(0, 1fr) 340px;
}

.lake-query-stack,
.lake-query-result-list,
.lake-query-trace-list,
.lake-query-trace-detail {
  display: grid;
  gap: 12px;
}

.lake-query-card-toolbar,
.lake-query-result-head {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.lake-query-mini-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.lake-query-mini-metrics > div {
  padding: 10px;
  border-radius: 8px;
  background: var(--color-fill-1);
}

.lake-query-mini-metrics span {
  display: block;
  font-size: 11px;
  color: var(--color-text-3);
}

.lake-query-mini-metrics strong {
  display: block;
  margin-top: 4px;
  font-size: 18px;
}

.lake-query-trace-list button {
  text-align: left;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border-2);
  background: #fff;
  cursor: pointer;
}

.lake-query-trace-list button.is-active {
  border-color: rgba(22, 93, 255, 0.35);
  background: rgba(22, 93, 255, 0.06);
}

.lake-query-trace-list button span {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-text-3);
}

.lake-query-trace-step {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border-2);
  background: #fff;
}

.lake-query-trace-step-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.lake-query-trace-time {
  display: block;
  margin-top: 6px;
  font-size: 11px;
}

.lake-query-result-card {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  gap: 14px;
}

.lake-query-result-card:not(:has(.lake-query-media-thumb)) {
  grid-template-columns: 1fr;
}

.lake-query-media-thumb {
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--color-border-2);
  cursor: pointer;
}

.lake-query-result-main h6 {
  margin: 0;
}

.lake-query-result-details {
  display: grid;
  gap: 8px;
  margin: 10px 0;
  padding: 12px;
  border-radius: 8px;
  background: var(--color-fill-1);
  border: 1px solid var(--color-border-2);
}

.lake-query-detail-field {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
}

.lake-query-code-text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}

.lake-query-result-summary {
  margin-bottom: 10px;
}

@media (max-width: 1180px) {
  .lake-query-grid[data-columns="main-rail"],
  .lake-query-grid[data-columns="side-main"],
  .lake-query-grid[data-columns="three"] {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 9: Run utility tests and CSS build smoke**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/queryUtils.test.js
```

Expected: PASS.

Run from `frontend/`:

```powershell
npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit shared utilities and components**

Run:

```powershell
git add frontend/src/pages/lake-query/queryUtils.js frontend/src/pages/lake-query/queryUtils.test.js frontend/src/pages/lake-query/components/QueryShell.jsx frontend/src/pages/lake-query/components/QueryTracePanel.jsx frontend/src/pages/lake-query/components/QueryResultCards.jsx frontend/src/pages/lake-query/components/SqlResultPanel.jsx frontend/src/pages/lake-query/lake-query.css
git commit -m "feat: add lake query shared ui primitives"
```

---

### Task 3: Unified Retrieval Workspace

**Files:**
- Create: `frontend/src/pages/lake-query/components/RetrievalStrategyTabs.jsx`
- Create: `frontend/src/pages/lake-query/RetrievalWorkspace.jsx`
- Create: `frontend/src/pages/lake-query/RetrievalWorkspace.test.jsx`

- [ ] **Step 1: Write retrieval workspace tests**

Create `frontend/src/pages/lake-query/RetrievalWorkspace.test.jsx`:

```jsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import RetrievalWorkspace from './RetrievalWorkspace'

vi.mock('@/api', () => ({
  default: {
    search: vi.fn(),
    convertNlToVector: vi.fn(),
    getMultimodalMediaUrl: (path) => `/media${path}`,
  },
  getErrorMessage: (error, fallback) => error?.message || fallback,
}))

const api = (await import('@/api')).default

describe('RetrievalWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.convertNlToVector.mockResolvedValue({ data: { mode: 'text', command_text: 'semantic route' } })
    api.search.mockResolvedValue({ success: true, results: [{ asset_id: 'a1', doc_name: '样本资产' }], message: 'ok' })
  })

  it('renders unified strategies without exposing sidebar concepts as pages', () => {
    render(<RetrievalWorkspace initialStrategy="auto" />)
    expect(screen.getByText('统一检索')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '智能选择' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '语义检索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '向量检索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '多模态检索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '混合检索' })).toBeInTheDocument()
  })

  it('runs hybrid search for intelligent selection by default', async () => {
    render(<RetrievalWorkspace initialStrategy="auto" />)
    fireEvent.click(screen.getByRole('button', { name: '开始检索' }))
    await waitFor(() => expect(api.search).toHaveBeenCalledWith(expect.any(String), 'hybrid', { limit: 12, rrf_k: 60 }))
    expect(await screen.findByText('样本资产')).toBeInTheDocument()
  })

  it('runs image retrieval for multimodal strategy', async () => {
    render(<RetrievalWorkspace initialStrategy="multimodal" />)
    fireEvent.click(screen.getByRole('button', { name: '开始检索' }))
    await waitFor(() => expect(api.search).toHaveBeenCalledWith(expect.any(String), 'image', 12))
  })
})
```

- [ ] **Step 2: Run retrieval tests and verify they fail**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/RetrievalWorkspace.test.jsx
```

Expected: FAIL because `RetrievalWorkspace.jsx` does not exist.

- [ ] **Step 3: Create retrieval strategy tabs**

Create `frontend/src/pages/lake-query/components/RetrievalStrategyTabs.jsx`:

```jsx
import { Button, Space } from '@arco-design/web-react'

export const RETRIEVAL_STRATEGY_OPTIONS = [
  { key: 'auto', label: '智能选择' },
  { key: 'semantic', label: '语义检索' },
  { key: 'vector', label: '向量检索' },
  { key: 'multimodal', label: '多模态检索' },
  { key: 'hybrid', label: '混合检索' },
]

export default function RetrievalStrategyTabs({ value, onChange }) {
  return (
    <Space wrap className="lake-query-strategy-tabs">
      {RETRIEVAL_STRATEGY_OPTIONS.map((item) => (
        <Button key={item.key} type={value === item.key ? 'primary' : 'outline'} onClick={() => onChange(item.key)}>
          {item.label}
        </Button>
      ))}
    </Space>
  )
}
```

- [ ] **Step 4: Implement retrieval workspace**

Create `frontend/src/pages/lake-query/RetrievalWorkspace.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Button, Card, Grid, Input, InputNumber, Message, Typography } from '@arco-design/web-react'
import { IconImage, IconSearch } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import QueryShell from './components/QueryShell'
import SearchResultList from './components/QueryResultCards'
import RetrievalStrategyTabs from './components/RetrievalStrategyTabs'
import { normalizeRetrievalStrategy } from './queryRouting'

const { Text } = Typography
const { TextArea } = Input
const { Row, Col } = Grid

const strategyLabel = {
  auto: '智能选择',
  semantic: '语义检索',
  vector: '向量检索',
  multimodal: '多模态检索',
  hybrid: '混合检索',
}

function getInitialQuery(strategy) {
  if (strategy === 'multimodal') return '查找设备异常外观相关的图片样本'
  if (strategy === 'hybrid') return '夜间巡检异常样本，按设备和告警等级汇总'
  return '夜间巡检异常样本'
}

export default function RetrievalWorkspace({ initialStrategy = 'auto' }) {
  const [strategy, setStrategy] = useState(normalizeRetrievalStrategy(initialStrategy))
  const [query, setQuery] = useState(getInitialQuery(initialStrategy))
  const [limit, setLimit] = useState(12)
  const [rrfK, setRrfK] = useState(60)
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [routeText, setRouteText] = useState('等待执行')
  const [routeMeta, setRouteMeta] = useState('系统会根据当前策略生成检索路径。')

  useEffect(() => {
    const normalized = normalizeRetrievalStrategy(initialStrategy)
    setStrategy(normalized)
    setQuery((current) => current || getInitialQuery(normalized))
  }, [initialStrategy])

  const run = async () => {
    if (!query.trim()) {
      Message.warning('请输入检索内容')
      return
    }
    setSearching(true)
    setResults([])
    try {
      if (strategy === 'auto' || strategy === 'hybrid') {
        const response = await api.search(query.trim(), 'hybrid', { limit, rrf_k: rrfK })
        if (!response.success) throw new Error(response.message || '检索失败')
        setResults(Array.isArray(response.results) ? response.results : [])
        setRouteText(strategy === 'auto' ? '智能选择 · 混合召回' : '关键词检索 + 向量召回 + RRF 融合')
        setRouteMeta(response.message || `RRF k=${rrfK}`)
      } else {
        const guideResponse = await api.convertNlToVector({ prompt: query.trim(), top_k: limit })
        const guide = guideResponse?.data || {}
        const mode = strategy === 'multimodal' ? 'image' : (guide.mode || 'text')
        const response = await api.search(query.trim(), mode, limit)
        if (!response.success) throw new Error(response.message || '检索失败')
        setResults(Array.isArray(response.results) ? response.results : [])
        setRouteText(strategy === 'multimodal' ? '文搜图多模态检索' : `${strategyLabel[strategy]}召回`)
        setRouteMeta(guide.command_text || '已根据当前问题生成检索指令。')
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

  const metrics = [
    { label: '当前策略', value: strategyLabel[strategy], trend: '页面内切换，不再拆成多个导航入口' },
    { label: '结果规模', value: `${limit} 条`, trend: '适合演示召回效果和快速抽样' },
    { label: '检索路径', value: routeText, trend: routeMeta },
    { label: '当前命中', value: searched ? `${results.length} 条` : '--', trend: '执行后展示召回资产' },
  ]

  return (
    <QueryShell title="统一检索" subtitle="语义、向量、多模态和混合检索收敛到同一入口，由策略决定执行路径。" metrics={metrics}>
      <div className="lake-query-grid" data-columns="side-main">
        <div className="lake-query-stack">
          <Card title="检索输入" bodyStyle={{ padding: 16 }}>
            <Text type="secondary">检索策略</Text>
            <RetrievalStrategyTabs value={strategy} onChange={setStrategy} />
            <Text type="secondary">检索内容</Text>
            <TextArea value={query} onChange={setQuery} autoSize={{ minRows: 5, maxRows: 9 }} />
            <Row gutter={12}>
              <Col span={12}>
                <Text type="secondary">Top K</Text>
                <InputNumber value={limit} onChange={setLimit} min={1} max={100} />
              </Col>
              <Col span={12}>
                <Text type="secondary">RRF K</Text>
                <InputNumber value={rrfK} onChange={setRrfK} min={10} max={200} disabled={!['auto', 'hybrid'].includes(strategy)} />
              </Col>
            </Row>
            <Button type="primary" icon={strategy === 'multimodal' ? <IconImage /> : <IconSearch />} onClick={run} loading={searching} long>
              开始检索
            </Button>
          </Card>
        </div>
        <Card title="检索结果" bodyStyle={{ padding: 16 }}>
          <SearchResultList results={results} searched={searched} emptyText="当前条件下没有找到相关资产" />
        </Card>
      </div>
    </QueryShell>
  )
}
```

- [ ] **Step 5: Run retrieval tests and verify they pass**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/RetrievalWorkspace.test.jsx
```

Expected: PASS.

- [ ] **Step 6: Commit unified retrieval workspace**

Run:

```powershell
git add frontend/src/pages/lake-query/components/RetrievalStrategyTabs.jsx frontend/src/pages/lake-query/RetrievalWorkspace.jsx frontend/src/pages/lake-query/RetrievalWorkspace.test.jsx
git commit -m "feat: unify lake query retrieval strategies"
```

---

### Task 4: AI Copilot Workspace

**Files:**
- Create: `frontend/src/pages/lake-query/components/PromptComposer.jsx`
- Create: `frontend/src/pages/lake-query/AiCopilotWorkspace.jsx`
- Create: `frontend/src/pages/lake-query/AiCopilotWorkspace.test.jsx`

- [ ] **Step 1: Write AI workspace tests**

Create `frontend/src/pages/lake-query/AiCopilotWorkspace.test.jsx`:

```jsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import AiCopilotWorkspace from './AiCopilotWorkspace'

vi.mock('@/api', () => ({
  default: {
    queryMultimodalAgent: vi.fn(),
    listMultimodalTraces: vi.fn(),
    getMultimodalTraceStats: vi.fn(),
    getMultimodalTraceDetail: vi.fn(),
    getMultimodalMediaUrl: (path) => `/media${path}`,
  },
  getErrorMessage: (error, fallback) => error?.message || fallback,
}))

const api = (await import('@/api')).default

describe('AiCopilotWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listMultimodalTraces.mockResolvedValue({ data: { items: [] } })
    api.getMultimodalTraceStats.mockResolvedValue({ data: { total_queries: 0, success_count: 0 } })
    api.queryMultimodalAgent.mockResolvedValue({
      data: {
        summary: '最近图片资产以告警事件为主。',
        route: 'SQL + 统一检索',
        sql: 'SELECT doc_type, count(*) FROM files GROUP BY doc_type',
        search_results: [{ asset_id: 'a1', doc_name: '样本资产' }],
        steps: [{ title: '选择工具', status: 'done', detail: '使用 SQL 和统一检索' }],
      },
    })
  })

  it('renders AI as the first-screen command center', async () => {
    render(<MemoryRouter><AiCopilotWorkspace /></MemoryRouter>)
    expect(await screen.findByText('AI 数据副驾驶')).toBeInTheDocument()
    expect(screen.getByText('打开 SQL 查询')).toBeInTheDocument()
    expect(screen.getByText('转到统一检索')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始分析' })).toBeInTheDocument()
  })

  it('submits a question and renders reusable artifacts', async () => {
    render(<MemoryRouter><AiCopilotWorkspace /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: '开始分析' }))
    await waitFor(() => expect(api.queryMultimodalAgent).toHaveBeenCalled())
    expect(await screen.findByText('最近图片资产以告警事件为主。')).toBeInTheDocument()
    expect(screen.getByText('SELECT doc_type, count(*) FROM files GROUP BY doc_type')).toBeInTheDocument()
    expect(screen.getByText('样本资产')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run AI workspace tests and verify they fail**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/AiCopilotWorkspace.test.jsx
```

Expected: FAIL because `AiCopilotWorkspace.jsx` does not exist.

- [ ] **Step 3: Create prompt composer**

Create `frontend/src/pages/lake-query/components/PromptComposer.jsx`:

```jsx
import { Button, Card, Input, Space } from '@arco-design/web-react'
import { IconRobot } from '@arco-design/web-react/icon'

const { TextArea } = Input

export default function PromptComposer({ value, onChange, onSubmit, loading, examples = [] }) {
  return (
    <Card title="发起提问" bodyStyle={{ padding: 16 }}>
      <TextArea value={value} onChange={onChange} autoSize={{ minRows: 4, maxRows: 8 }} />
      <Space wrap className="lake-query-prompt-actions">
        <Button type="primary" icon={<IconRobot />} onClick={onSubmit} loading={loading}>开始分析</Button>
        {examples.map((item) => <Button key={item} onClick={() => onChange(item)}>{item}</Button>)}
      </Space>
    </Card>
  )
}
```

- [ ] **Step 4: Implement AI copilot workspace**

Create `frontend/src/pages/lake-query/AiCopilotWorkspace.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Grid, Input, InputNumber, Message, Space, Table, Tag, Typography } from '@arco-design/web-react'
import { IconCommand, IconSearch } from '@arco-design/web-react/icon'
import api, { getErrorMessage } from '@/api'
import QueryShell from './components/QueryShell'
import PromptComposer from './components/PromptComposer'
import QueryTracePanel from './components/QueryTracePanel'
import SearchResultList from './components/QueryResultCards'
import SqlResultPanel from './components/SqlResultPanel'
import { compactFilters, formatFilters } from './queryUtils'

const { Paragraph, Text } = Typography
const { Row, Col } = Grid

const COPILOT_EXAMPLES = [
  '最近 7 天有哪些车辆闯入监控告警，给我相关样本',
  '上个月导入最多的图片资产类型是什么，顺便给我相关样本',
  '找出与设备异常外观相关的样本，并按告警等级汇总',
]

const FILTER_DEFAULTS = {
  event_type: '',
  city_name: '',
  device_name: '',
  algorithm_name: '',
  confidence_min: undefined,
  confidence_max: undefined,
}

export default function AiCopilotWorkspace() {
  const navigate = useNavigate()
  const [question, setQuestion] = useState('上个月导入最多的图片资产类型是什么，顺便给我相关样本')
  const [running, setRunning] = useState(false)
  const [filters, setFilters] = useState(FILTER_DEFAULTS)
  const [messages, setMessages] = useState([])
  const [traceItems, setTraceItems] = useState([])
  const [traceStats, setTraceStats] = useState(null)
  const [selectedTraceId, setSelectedTraceId] = useState('')
  const [traceDetail, setTraceDetail] = useState(null)

  const loadTraces = async (keepSelected = true) => {
    try {
      const [listResponse, statsResponse] = await Promise.all([
        api.listMultimodalTraces({ session_id: 'main', limit: 20 }),
        api.getMultimodalTraceStats(),
      ])
      const items = Array.isArray(listResponse?.data?.items) ? listResponse.data.items : []
      setTraceItems(items)
      setTraceStats(statsResponse?.data || null)
      if (!keepSelected && items.length) setSelectedTraceId(items[0].trace_id)
    } catch (error) {
      Message.error(getErrorMessage(error, '加载查询轨迹失败'))
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
    loadTraces(false)
  }, [])

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))

  const sendQuestion = async (presetQuestion = '') => {
    const currentQuestion = (presetQuestion || question).trim()
    if (!currentQuestion) {
      Message.warning('请输入问题')
      return
    }
    setRunning(true)
    try {
      const response = await api.queryMultimodalAgent({
        question: currentQuestion,
        dataset_name: 'tower_eye',
        limit: 8,
        session_id: 'main',
        filters: compactFilters(filters),
      })
      const data = response?.data || {}
      setMessages((current) => [
        ...current,
        {
          question: currentQuestion,
          summary: data.summary || '',
          route: data.route || '',
          sql: data.sql || '',
          sqlResult: data.sql_result || null,
          searchResults: data.search_results || [],
          followups: data.followups || [],
          steps: data.steps || [],
        },
      ])
      setQuestion('')
      await loadTraces(false)
      if (data.trace_id) await loadTraceDetail(data.trace_id)
    } catch (error) {
      Message.error(getErrorMessage(error, '副驾驶执行失败'))
    } finally {
      setRunning(false)
    }
  }

  const metrics = [
    { label: '主入口形态', value: 'AI 优先', trend: '自然语言先表达目标，再选择工具' },
    { label: '筛选状态', value: formatFilters(filters), trend: '显式筛选和问题上下文共同生效' },
    { label: '轨迹总量', value: traceStats?.total_queries || 0, trend: '每轮问答记录执行轨迹' },
    { label: '当前状态', value: running ? '执行中' : '已就绪', trend: '结果可进入 SQL 或统一检索继续处理' },
  ]

  return (
    <QueryShell
      title="AI 数据副驾驶"
      subtitle="先用自然语言描述目标，再由系统调度 SQL、统一检索和多模态资产召回。"
      metrics={metrics}
      actions={(
        <>
          <Button icon={<IconCommand />} onClick={() => navigate('/lake-query/sql')}>打开 SQL 查询</Button>
          <Button icon={<IconSearch />} onClick={() => navigate('/lake-query/retrieval')}>转到统一检索</Button>
        </>
      )}
    >
      <div className="lake-query-grid" data-columns="main-rail">
        <div className="lake-query-stack">
          <Card title="高级筛选" bodyStyle={{ padding: 16 }}>
            <Row gutter={[12, 12]}>
              <Col span={8}><Input value={filters.event_type} onChange={(value) => updateFilter('event_type', value)} placeholder="事件类型" /></Col>
              <Col span={8}><Input value={filters.city_name} onChange={(value) => updateFilter('city_name', value)} placeholder="城市" /></Col>
              <Col span={8}><Input value={filters.device_name} onChange={(value) => updateFilter('device_name', value)} placeholder="设备名称" /></Col>
              <Col span={8}><Input value={filters.algorithm_name} onChange={(value) => updateFilter('algorithm_name', value)} placeholder="算法名称" /></Col>
              <Col span={8}><InputNumber min={0} max={1} step={0.05} value={filters.confidence_min} onChange={(value) => updateFilter('confidence_min', value)} placeholder="置信度下限" /></Col>
              <Col span={8}><InputNumber min={0} max={1} step={0.05} value={filters.confidence_max} onChange={(value) => updateFilter('confidence_max', value)} placeholder="置信度上限" /></Col>
            </Row>
          </Card>
          <PromptComposer value={question} onChange={setQuestion} onSubmit={() => sendQuestion()} loading={running} examples={COPILOT_EXAMPLES} />
          <Card title="答案与执行产物" bodyStyle={{ padding: 16 }}>
            {messages.length ? (
              <div className="lake-query-stack">
                {messages.map((message, index) => (
                  <div className="lake-query-stack" key={`${message.question}-${index}`}>
                    <div className="lake-query-user-question">{message.question}</div>
                    <div className="lake-query-answer-card">
                      <Space className="lake-query-card-toolbar">
                        <div>
                          <strong>AI 数据副驾驶</strong>
                          <div><Text type="secondary">{message.route}</Text></div>
                        </div>
                        <Tag color="green">已完成</Tag>
                      </Space>
                      {message.summary ? <Card size="small" title="结论摘要"><Paragraph>{message.summary}</Paragraph></Card> : null}
                      {message.sql ? <Card size="small" title="生成 SQL"><Text code copyable className="lake-query-code-text">{message.sql}</Text></Card> : null}
                      {message.sqlResult ? <SqlResultPanel result={message.sqlResult} pageSize={5} /> : null}
                      <SearchResultList results={message.searchResults || []} searched emptyText="本轮没有补充相关资产" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary">当前还没有问题，直接输入业务问题开始。</Text>
            )}
          </Card>
        </div>
        <QueryTracePanel
          traceItems={traceItems}
          traceStats={traceStats}
          selectedTraceId={selectedTraceId}
          traceDetail={traceDetail}
          onRefresh={() => loadTraces(true)}
          onSelectTrace={loadTraceDetail}
        />
      </div>
    </QueryShell>
  )
}
```

- [ ] **Step 5: Run AI workspace tests and verify they pass**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/AiCopilotWorkspace.test.jsx
```

Expected: PASS.

- [ ] **Step 6: Commit AI copilot workspace**

Run:

```powershell
git add frontend/src/pages/lake-query/components/PromptComposer.jsx frontend/src/pages/lake-query/AiCopilotWorkspace.jsx frontend/src/pages/lake-query/AiCopilotWorkspace.test.jsx
git commit -m "feat: add lake query ai copilot workspace"
```

---

### Task 5: Split SQL and Annotation Workspaces

**Files:**
- Create: `frontend/src/pages/lake-query/SqlWorkspace.jsx`
- Create: `frontend/src/pages/lake-query/AnnotationWorkspace.jsx`
- Modify: `frontend/src/pages/lake-query/queryUtils.js`

- [ ] **Step 1: Move SQL workspace**

Create `frontend/src/pages/lake-query/SqlWorkspace.jsx` by moving the existing `SqlWorkspaceTab` implementation from `frontend/src/pages/LakeQueryPage.jsx` and applying these exact changes:

```jsx
function SqlWorkspace() {
```

replaces:

```jsx
function SqlWorkspaceTab() {
```

Use:

```jsx
import QueryShell from './components/QueryShell'
import SqlResultPanel from './components/SqlResultPanel'
import { buildTableColumns } from './queryUtils'
```

Replace the `QueryPageFrame` wrapper with:

```jsx
<QueryShell
  title="SQL 查询"
  subtitle="承接 NL2SQL、编辑执行与历史回放，用于结构化分析和结果校验。"
  metrics={summaryItems.map((item) => ({ label: item.label, value: item.value, trend: item.meta }))}
  actions={(
    <>
      <Text type="secondary">集群</Text>
      <Select placeholder="选择集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 220 }}>
        {clusters.map((cluster) => <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>)}
      </Select>
    </>
  )}
>
```

Replace the SQL result rendering block:

```jsx
{result ? (
  <div style={{ marginTop: 16 }}>
    <ResultSummary result={result} />
    {result.columns.length > 0 ? <Table columns={buildTableColumns(result.columns)} data={result.rows} rowKey={(_, index) => index} pagination={{ pageSize: 50 }} scroll={{ x: 'max-content' }} size="small" border /> : <Empty description="无结果集" />}
  </div>
) : null}
```

with:

```jsx
<SqlResultPanel result={result} />
```

End the file with:

```jsx
export default SqlWorkspace
```

- [ ] **Step 2: Move annotation workspace**

Create `frontend/src/pages/lake-query/AnnotationWorkspace.jsx` by moving the existing `AnnotationWorkbenchTab` implementation from `frontend/src/pages/LakeQueryPage.jsx` and applying these exact changes:

```jsx
function AnnotationWorkspace() {
```

replaces:

```jsx
function AnnotationWorkbenchTab() {
```

Use:

```jsx
import QueryShell from './components/QueryShell'
```

Replace the `QueryPageFrame` wrapper with:

```jsx
<QueryShell
  title="自动化标注"
  subtitle="面向数据集和资产做预标批处理、人工复核回流和质量监控，保持独立流程。"
  metrics={summaryItems.map((item) => ({ label: item.label, value: item.value, trend: item.meta }))}
>
```

End the file with:

```jsx
export default AnnotationWorkspace
```

- [ ] **Step 3: Keep media and table helpers shared**

If either moved workspace needs `getFirstMediaPath`, `formatFilters`, or `buildTableColumns`, import them from:

```jsx
import { buildTableColumns, formatFilters, getFirstMediaPath } from './queryUtils'
```

Do not duplicate those helpers inside the workspace files.

- [ ] **Step 4: Run build after extracting SQL and annotation**

Run from `frontend/`:

```powershell
npm run build
```

Expected: PASS. If Vite reports an unresolved import, fix the import in the extracted workspace file before continuing.

- [ ] **Step 5: Commit SQL and annotation extraction**

Run:

```powershell
git add frontend/src/pages/lake-query/SqlWorkspace.jsx frontend/src/pages/lake-query/AnnotationWorkspace.jsx frontend/src/pages/lake-query/queryUtils.js
git commit -m "refactor: split lake query sql and annotation workspaces"
```

---

### Task 6: Assemble New Lake Query Page and Verify

**Files:**
- Create: `frontend/src/pages/lake-query/LakeQueryPage.jsx`
- Modify: `frontend/src/pages/LakeQueryPage.jsx`
- Modify: `frontend/src/pages/lake-query/lake-query.css`

- [ ] **Step 1: Create the new route-level page**

Create `frontend/src/pages/lake-query/LakeQueryPage.jsx`:

```jsx
import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import AiCopilotWorkspace from './AiCopilotWorkspace'
import SqlWorkspace from './SqlWorkspace'
import RetrievalWorkspace from './RetrievalWorkspace'
import AnnotationWorkspace from './AnnotationWorkspace'
import { getLakeQueryRouteState, normalizeRetrievalStrategy } from './queryRouting'
import './lake-query.css'

function useQueryStrategy(fallbackStrategy) {
  const location = useLocation()
  return useMemo(() => {
    const params = new URLSearchParams(location.search)
    return normalizeRetrievalStrategy(params.get('strategy') || fallbackStrategy)
  }, [fallbackStrategy, location.search])
}

export default function LakeQueryPage() {
  const { tab } = useParams()
  const navigate = useNavigate()
  const routeState = getLakeQueryRouteState(tab)
  const retrievalStrategy = useQueryStrategy(routeState.retrievalStrategy)

  useEffect(() => {
    if (routeState.redirectTo) {
      navigate(routeState.redirectTo, { replace: true })
    }
  }, [navigate, routeState.redirectTo])

  if (routeState.activeTab === 'sql') return <SqlWorkspace />
  if (routeState.activeTab === 'retrieval') return <RetrievalWorkspace initialStrategy={retrievalStrategy} />
  if (routeState.activeTab === 'annotation') return <AnnotationWorkspace />
  return <AiCopilotWorkspace />
}
```

- [ ] **Step 2: Replace old page with compatibility re-export**

Replace all contents of `frontend/src/pages/LakeQueryPage.jsx` with:

```jsx
export { default } from './lake-query/LakeQueryPage.jsx'
```

- [ ] **Step 3: Add missing CSS for AI answer cards**

Append to `frontend/src/pages/lake-query/lake-query.css`:

```css
.lake-query-prompt-actions {
  margin-top: 12px;
}

.lake-query-user-question {
  padding: 14px;
  border-radius: 8px;
  background: rgba(22, 93, 255, 0.08);
  border: 1px solid rgba(22, 93, 255, 0.16);
  line-height: 1.7;
}

.lake-query-answer-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--color-border-2);
}

.lake-query-strategy-tabs {
  display: flex;
  margin: 8px 0 12px;
}

.lake-query-grid .arco-input-number,
.lake-query-grid .arco-textarea,
.lake-query-grid .arco-input {
  width: 100%;
}
```

- [ ] **Step 4: Run the focused frontend tests**

Run:

```powershell
npm --prefix frontend run test -- frontend/src/pages/lake-query/queryRouting.test.js frontend/src/pages/lake-query/queryUtils.test.js frontend/src/pages/lake-query/RetrievalWorkspace.test.jsx frontend/src/pages/lake-query/AiCopilotWorkspace.test.jsx frontend/src/navigation/navConfig.test.js
```

Expected: PASS.

- [ ] **Step 5: Run the full frontend test suite**

Run:

```powershell
npm --prefix frontend run test
```

Expected: PASS.

- [ ] **Step 6: Run production build from the frontend directory**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS. Use this form because `npm --prefix frontend run build` can fail on this Windows Chinese path with Vite absolute `index.html` handling.

- [ ] **Step 7: Start local services for browser verification**

If the existing dev servers are not running, start:

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 27843
```

and from `frontend/`:

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 27844
```

Expected:

```text
Backend: http://127.0.0.1:27843/api/health returns ok
Frontend: http://127.0.0.1:27844/ opens the app
```

- [ ] **Step 8: Browser verify the core routes**

Open:

```text
http://127.0.0.1:27844/#/lake-query/copilot
http://127.0.0.1:27844/#/lake-query/sql
http://127.0.0.1:27844/#/lake-query/retrieval
http://127.0.0.1:27844/#/lake-query/vector
```

Expected:

```text
/lake-query/copilot shows AI 数据副驾驶 as the main workspace.
/lake-query/sql shows SQL 查询.
/lake-query/retrieval shows 统一检索 with 智能选择, 语义检索, 向量检索, 多模态检索, 混合检索 as internal strategies.
/lake-query/vector redirects to or displays /lake-query/retrieval?strategy=vector.
The left sidebar under 湖查询 shows exactly AI 数据副驾驶, SQL 查询, 统一检索, 自动化标注.
```

- [ ] **Step 9: Commit final assembly**

Run:

```powershell
git add frontend/src/pages/lake-query/LakeQueryPage.jsx frontend/src/pages/LakeQueryPage.jsx frontend/src/pages/lake-query/lake-query.css
git commit -m "refactor: assemble ai first lake query page"
```

---

## Self-Review

Spec coverage:

```text
AI 数据副驾驶 default entry: Task 1 and Task 6.
Four sidebar entries only: Task 1.
Unified retrieval with internal strategies: Task 3.
Legacy route compatibility: Task 1 and Task 6.
SQL professional workspace retained: Task 5 and Task 6.
Annotation remains independent: Task 5 and Task 6.
Large page split into focused modules: Tasks 2 through 6.
Tests and build verification: every task includes focused checks; Task 6 includes full suite, build, and browser verification.
```

Placeholder scan:

```text
No unresolved placeholders are intentionally left in this plan. Each task names exact files, commands, and expected outcomes.
```

Type and naming consistency:

```text
Routing uses activeTab, retrievalStrategy, redirectTo consistently.
Retrieval strategies are auto, semantic, vector, multimodal, hybrid consistently.
Workspace names are AiCopilotWorkspace, SqlWorkspace, RetrievalWorkspace, AnnotationWorkspace consistently.
```
