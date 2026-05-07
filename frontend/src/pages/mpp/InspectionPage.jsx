import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Button, Card, Space, Table, Tag, Modal, Switch, InputNumber, Message,
  Typography, Empty, Select, Progress, Descriptions, Tabs
} from '@arco-design/web-react'
import {
  IconRefresh, IconPlayCircle, IconCheckCircle, IconCloseCircle,
  IconExclamationCircle, IconClockCircle, IconBug, IconStorage, IconCommand
} from '@arco-design/web-react/icon'
import ChartPanel from '@/components/ChartPanel.jsx'
import { HealthRing, PrdCard, CheckRow, PrdTag, StatCard } from '@/components/PrdWidgets.jsx'

const { Title, Text } = Typography
const Option = Select.Option
const TabPane = Tabs.TabPane

const DORIS_BASE = '/api/doris'

async function dorisGet(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPost(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPut(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function StatusTag({ status }) {
  const map = {
    SUCCESS: { color: 'green', label: '成功', icon: <IconCheckCircle /> },
    FAILED: { color: 'red', label: '失败', icon: <IconCloseCircle /> },
    WARNING: { color: 'orange', label: '警告', icon: <IconExclamationCircle /> },
    RUNNING: { color: 'arcoblue', label: '执行中', icon: <IconClockCircle /> },
  }
  const v = map[String(status || '').toUpperCase()] || { color: 'gray', label: status || '—' }
  return <Tag color={v.color} icon={v.icon}>{v.label}</Tag>
}

function matchCheckIcon(name) {
  if (name?.includes('FE')) return <IconCommand />
  if (name?.includes('BE')) return <IconStorage />
  if (name?.includes('磁盘')) return <IconStorage />
  if (name?.includes('连接')) return <IconCommand />
  return <IconBug />
}

export default function InspectionPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [detail, setDetail] = useState(null)
  const [schedule, setSchedule] = useState({ enabled: false, interval_minutes: 60, last_run_at: null })
  const [activeTab, setActiveTab] = useState('latest')
  const pollRef = useRef(null)

  useEffect(() => {
    dorisGet('/clusters').then(d => {
      const list = d.clusters || []
      setClusters(list)
      if (list.length > 0) setClusterId(list[0].id)
    }).catch(() => {})
  }, [])

  const loadHistory = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const d = await dorisGet('/inspection/history', { cluster_id: clusterId, limit: 30 })
      setHistory(d.history || [])
    } catch (e) {
      Message.error('加载巡检历史失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadSchedule = async () => {
    if (!clusterId) return
    try {
      const d = await dorisGet(`/inspection/schedule/${clusterId}`)
      if (d.schedule) {
        setSchedule({
          enabled: !!d.schedule.enabled,
          interval_minutes: d.schedule.interval_minutes || 60,
          last_run_at: d.schedule.last_run_at,
        })
      }
    } catch { /* */ }
  }

  useEffect(() => {
    if (clusterId) { loadHistory(); loadSchedule() }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [clusterId])

  const saveSchedule = async (next) => {
    if (!clusterId) return
    try {
      await dorisPut(`/inspection/schedule/${clusterId}`, {
        enabled: next.enabled,
        interval_minutes: Number(next.interval_minutes) || 60,
      })
      setSchedule(s => ({ ...s, ...next }))
      Message.success(next.enabled ? `已开启定时巡检：每 ${next.interval_minutes} 分钟一次` : '已关闭定时巡检')
    } catch (e) {
      Message.error('保存失败：' + e.message)
    }
  }

  const pollInspection = (id) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const d = await dorisGet(`/inspection/${id}`)
        const ins = d.inspection || {}
        if (ins.status !== 'RUNNING') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setRunning(false)
          Message.success(`巡检完成，评分：${ins.score ?? 'N/A'}`)
          loadHistory()
        }
      } catch (e) {
        clearInterval(pollRef.current)
        pollRef.current = null
        setRunning(false)
      }
    }, 2000)
  }

  const handleRunNow = async () => {
    if (!clusterId) return
    setRunning(true)
    try {
      const d = await dorisPost('/inspection/run', { cluster_id: clusterId })
      if (d.success) {
        Message.info('巡检任务已启动，正在执行...')
        pollInspection(d.inspection_id)
      } else {
        setRunning(false)
        Message.error(d.detail || '启动巡检失败')
      }
    } catch (e) {
      setRunning(false)
      Message.error('启动巡检失败：' + e.message)
    }
  }

  const loadDetail = async (record) => {
    try {
      const d = await dorisGet(`/inspection/${record.id}`)
      setDetail(d.inspection || record)
    } catch (e) {
      setDetail(record)
    }
  }

  // 派生数据
  const latest = history.find(h => h.status === 'SUCCESS') || history[0]
  const latestItems = latest?.result?.items || []
  const successCount = history.filter(h => h.status === 'SUCCESS').length
  const failedCount = history.filter(h => h.status === 'FAILED').length

  // 评分趋势（按时间正序）
  const scoreTrend = useMemo(() => {
    const sorted = [...history].slice(0, 14).reverse()
    return {
      dates: sorted.map(h => (h.created_at || '').slice(5, 16)),
      scores: sorted.map(h => Number(h.score || 0)),
    }
  }, [history])

  const trendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 24, right: 18, top: 30, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: scoreTrend.dates, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', min: 0, max: 100 },
    series: [{
      type: 'line', smooth: true, data: scoreTrend.scores,
      areaStyle: { color: 'rgba(31, 79, 224, 0.14)' },
      lineStyle: { color: '#1F4FE0', width: 2.4 },
      itemStyle: { color: '#1F4FE0' },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          { yAxis: 90, lineStyle: { color: '#1B9E5C', type: 'dashed' }, label: { formatter: '优秀 90', position: 'end' } },
          { yAxis: 70, lineStyle: { color: '#E68B00', type: 'dashed' }, label: { formatter: '警告 70', position: 'end' } },
        ],
      },
    }],
  }

  const historyColumns = [
    { title: '巡检时间', dataIndex: 'created_at', width: 180 },
    { title: '耗时', dataIndex: 'duration', width: 90, render: v => v != null ? <Text code>{v}s</Text> : '—' },
    { title: '综合评分', dataIndex: 'score', width: 110,
      render: v => v != null
        ? <Text style={{ color: v >= 90 ? '#1B9E5C' : v >= 70 ? '#E68B00' : '#D63B3B', fontWeight: 700 }}>{Math.round(v)}</Text>
        : '—' },
    { title: '状态', dataIndex: 'status', width: 110, render: v => <StatusTag status={v} /> },
    { title: '检查项数', dataIndex: 'check_count', width: 100, render: v => <Text code>{v ?? '—'}</Text> },
    { title: '操作', width: 100, fixed: 'right',
      render: (_, row) => <Button type="text" size="small" onClick={() => loadDetail(row)}>查看详情</Button>,
    },
  ]

  return (
    <div style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>自动巡检</Title>
          <Text type="secondary">Doris 集群健康评分 · 检查项明细 · 历史趋势</Text>
        </div>
        <Space>
          <Text type="secondary">集群：</Text>
          <Select placeholder="选择集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 200 }}>
            {clusters.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>
          <Button type="primary" icon={<IconPlayCircle />} onClick={handleRunNow} loading={running} disabled={!clusterId}>
            立即巡检
          </Button>
          <Button icon={<IconRefresh />} onClick={loadHistory} loading={loading} disabled={!clusterId} />
        </Space>
      </div>

      {clusters.length === 0 ? (
        <Card><Empty description="暂无集群，请先在「湖运维 → 集群管理」注册" /></Card>
      ) : (
        <>
          {/* ── PRD 风格 hero：评分 + 趋势 + KPI ─────────────────── */}
          <div className="prd-row-2-1" style={{ marginBottom: 12 }}>
            <PrdCard
              title="最近巡检评分趋势"
              sub={`近 ${scoreTrend.scores.length} 次巡检`}
              extra={latest && <PrdTag kind={latest.score >= 90 ? 'ok' : latest.score >= 70 ? 'warn' : 'bad'} led>
                {latest.score >= 90 ? '健康' : latest.score >= 70 ? '注意' : '风险'}
              </PrdTag>}
            >
              {scoreTrend.scores.length === 0 ? (
                <Empty description="暂无巡检数据，点击「立即巡检」" />
              ) : (
                <ChartPanel option={trendOption} height={240} />
              )}
            </PrdCard>

            <PrdCard title="最新评分" sub={latest ? latest.created_at : '尚未巡检'}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <HealthRing percent={latest?.score || 0} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <div style={{ padding: '8px 10px', background: 'var(--prd-ok-soft)', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1B9E5C' }}>{successCount}</div>
                  <div style={{ fontSize: 10, color: 'var(--prd-ink-3)' }}>成功</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--prd-bad-soft)', borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#D63B3B' }}>{failedCount}</div>
                  <div style={{ fontSize: 10, color: 'var(--prd-ink-3)' }}>失败</div>
                </div>
              </div>
            </PrdCard>
          </div>

          {/* ── 定时巡检设置 ──────────────────────────────────── */}
          <Card title="定时巡检" style={{ marginBottom: 12 }} bodyStyle={{ padding: 16 }}>
            <Space size="large" wrap>
              <Space>
                <Text>启用定时巡检：</Text>
                <Switch checked={schedule.enabled} onChange={v => saveSchedule({ ...schedule, enabled: v })} />
              </Space>
              <Space>
                <Text>执行间隔：</Text>
                <InputNumber min={5} max={1440} step={5} value={schedule.interval_minutes}
                  onChange={v => setSchedule(s => ({ ...s, interval_minutes: v }))} suffix="分钟" style={{ width: 140 }} />
                <Button size="small" onClick={() => saveSchedule(schedule)}>保存</Button>
              </Space>
              {schedule.last_run_at && <Text type="secondary">上次执行：{schedule.last_run_at}</Text>}
            </Space>
          </Card>

          {/* ── Tab：最新检查项 / 历史列表 ──────────────────────── */}
          <Card bodyStyle={{ padding: 0 }}>
            <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ padding: '0 16px' }}>
              <TabPane key="latest" title={`最新检查项 (${latestItems.length})`} />
              <TabPane key="history" title={`历史巡检 (${history.length})`} />
            </Tabs>
            <div style={{ padding: 16 }}>
              {activeTab === 'latest' && (
                latestItems.length === 0 ? (
                  <Empty description="暂无检查项数据，点击「立即巡检」开始" />
                ) : (
                  <div>
                    {latestItems.map((item, i) => {
                      const s = (item.status || '').toUpperCase()
                      const status = s === 'SUCCESS' ? 'ok' : s === 'WARNING' ? 'warn' : 'bad'
                      return (
                        <CheckRow
                          key={i}
                          status={status}
                          icon={matchCheckIcon(item.name)}
                          title={item.name}
                          meta={item.suggestion || (status === 'ok' ? '检查通过' : '需要关注')}
                          value={item.value}
                        />
                      )
                    })}
                  </div>
                )
              )}
              {activeTab === 'history' && (
                <Table columns={historyColumns} data={history} loading={loading} rowKey="id"
                  pagination={{ pageSize: 10, showTotal: true }}
                  noDataElement={<Empty description="暂无巡检记录" />} />
              )}
            </div>
          </Card>
        </>
      )}

      {/* 详情弹窗 */}
      <Modal
        title="巡检详情"
        visible={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        style={{ width: 800 }}
      >
        {detail && (
          <>
            <Descriptions column={2} size="small" data={[
              { label: '巡检时间', value: detail.created_at || '—' },
              { label: '耗时', value: detail.duration != null ? `${detail.duration}s` : '—' },
              { label: '综合评分', value: <Text style={{ color: detail.score >= 90 ? '#1B9E5C' : detail.score >= 70 ? '#E68B00' : '#D63B3B', fontWeight: 700, fontSize: 16 }}>{Math.round(detail.score || 0)}</Text> },
              { label: '状态', value: <StatusTag status={detail.status} /> },
            ]} labelStyle={{ width: 90 }} style={{ marginBottom: 16 }} />
            <div>
              {(detail.result?.items || []).map((item, i) => {
                const s = (item.status || '').toUpperCase()
                const status = s === 'SUCCESS' ? 'ok' : s === 'WARNING' ? 'warn' : 'bad'
                return (
                  <CheckRow
                    key={i} status={status}
                    icon={matchCheckIcon(item.name)}
                    title={item.name}
                    meta={item.suggestion || (status === 'ok' ? '检查通过' : '需要关注')}
                    value={item.value}
                  />
                )
              })}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
