import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Empty,
  InputNumber,
  Message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from '@arco-design/web-react'
import {
  IconBug,
  IconCheckCircle,
  IconClockCircle,
  IconCloseCircle,
  IconExclamationCircle,
  IconPlayCircle,
  IconRefresh,
  IconStorage,
} from '@arco-design/web-react/icon'
import ChartPanel from '@/components/ChartPanel.jsx'
import { CheckRow, HealthRing, PrdCard, PrdTag, StatCard } from '@/components/PrdWidgets.jsx'

const { Title, Text } = Typography
const Option = Select.Option

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
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

async function dorisPut(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

function StatusTag({ status }) {
  const upper = String(status || '').toUpperCase()
  if (upper === 'SUCCESS') return <PrdTag kind="ok" led>成功</PrdTag>
  if (upper === 'FAILED') return <PrdTag kind="bad" led>失败</PrdTag>
  if (upper === 'WARNING') return <PrdTag kind="warn" led>警告</PrdTag>
  if (upper === 'RUNNING') return <PrdTag kind="info" led>执行中</PrdTag>
  return <PrdTag kind="info">未知</PrdTag>
}

function pickCheckIcon(name = '') {
  if (name.includes('FE')) return <IconStorage />
  if (name.includes('BE')) return <IconStorage />
  if (name.includes('连接')) return <IconExclamationCircle />
  return <IconBug />
}

function classifyCheck(item) {
  const name = String(item?.name || '')
  if (name.includes('FE')) return 'FE'
  if (name.includes('BE')) return 'BE'
  if (name.includes('磁盘') || name.includes('存储')) return '存储'
  if (name.includes('连接') || name.includes('心跳')) return '连接'
  if (name.includes('副本')) return '副本'
  return '通用'
}

function scoreLevel(score) {
  if (score >= 90) return { label: '健康', kind: 'ok' }
  if (score >= 75) return { label: '注意', kind: 'warn' }
  return { label: '风险', kind: 'bad' }
}

function buildRecommendations(items = []) {
  return items
    .filter((item) => String(item?.status || '').toUpperCase() !== 'SUCCESS')
    .map((item) => ({
      title: item.name || '巡检项',
      severity: String(item?.status || '').toUpperCase() === 'FAILED' ? 'critical' : 'warning',
      copy: item.suggestion || '建议结合集群状态、告警阈值和最近变更记录进一步排查。',
      value: item.value,
    }))
}

export default function InspectionPage() {
  const [clusters, setClusters] = useState([])
  const [clusterId, setClusterId] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [detail, setDetail] = useState(null)
  const [schedule, setSchedule] = useState({ enabled: false, interval_minutes: 60, last_run_at: null })
  const pollRef = useRef(null)

  useEffect(() => {
    dorisGet('/clusters')
      .then((data) => {
        const list = data.clusters || []
        setClusters(list)
        if (list.length > 0) setClusterId(list[0].id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!clusterId) return
    loadHistory()
    loadSchedule()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [clusterId])

  const loadHistory = async () => {
    if (!clusterId) return
    setLoading(true)
    try {
      const data = await dorisGet('/inspection/history', { cluster_id: clusterId, limit: 30 })
      setHistory(data.history || [])
    } catch (error) {
      Message.error(`加载巡检历史失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadSchedule = async () => {
    if (!clusterId) return
    try {
      const data = await dorisGet(`/inspection/schedule/${clusterId}`)
      if (data.schedule) {
        setSchedule({
          enabled: Boolean(data.schedule.enabled),
          interval_minutes: data.schedule.interval_minutes || 60,
          last_run_at: data.schedule.last_run_at,
        })
      }
    } catch {
      // ignore
    }
  }

  const saveSchedule = async (nextSchedule) => {
    if (!clusterId) return
    try {
      await dorisPut(`/inspection/schedule/${clusterId}`, {
        enabled: nextSchedule.enabled,
        interval_minutes: Number(nextSchedule.interval_minutes) || 60,
      })
      setSchedule((current) => ({ ...current, ...nextSchedule }))
      Message.success(nextSchedule.enabled ? `已启用定时巡检，每 ${nextSchedule.interval_minutes} 分钟执行一次` : '已关闭定时巡检')
    } catch (error) {
      Message.error(`保存失败: ${error.message}`)
    }
  }

  const pollInspection = (inspectionId) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const data = await dorisGet(`/inspection/${inspectionId}`)
        const inspection = data.inspection || {}
        if (inspection.status !== 'RUNNING') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setRunning(false)
          Message.success(`巡检完成，评分 ${inspection.score ?? '--'}`)
          loadHistory()
        }
      } catch {
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
      const data = await dorisPost('/inspection/run', { cluster_id: clusterId })
      if (data.success) {
        Message.info('巡检任务已启动，正在执行...')
        pollInspection(data.inspection_id)
      } else {
        setRunning(false)
        Message.error(data.detail || '启动巡检失败')
      }
    } catch (error) {
      setRunning(false)
      Message.error(`启动巡检失败: ${error.message}`)
    }
  }

  const openDetail = async (record) => {
    try {
      const data = await dorisGet(`/inspection/${record.id}`)
      setDetail(data.inspection || record)
    } catch {
      setDetail(record)
    }
  }

  const latest = useMemo(() => history.find((item) => item.status === 'SUCCESS') || history[0] || null, [history])
  const latestItems = latest?.result?.items || []
  const recommendations = useMemo(() => buildRecommendations(latestItems), [latestItems])
  const latestLevel = scoreLevel(Number(latest?.score || 0))

  const categorySummary = useMemo(() => {
    const groups = new Map()
    for (const item of latestItems) {
      const key = classifyCheck(item)
      if (!groups.has(key)) {
        groups.set(key, { title: key, total: 0, failed: 0, warning: 0, passed: 0 })
      }
      const group = groups.get(key)
      group.total += 1
      const status = String(item.status || '').toUpperCase()
      if (status === 'SUCCESS') group.passed += 1
      else if (status === 'WARNING') group.warning += 1
      else group.failed += 1
    }
    return Array.from(groups.values())
  }, [latestItems])

  const scoreTrend = useMemo(() => {
    const rows = [...history].slice(0, 14).reverse()
    return {
      dates: rows.map((item) => (item.created_at || '').slice(5, 16)),
      scores: rows.map((item) => Number(item.score || 0)),
    }
  }, [history])

  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    grid: { left: 24, right: 18, top: 30, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: scoreTrend.dates, axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', min: 0, max: 100 },
    series: [{
      type: 'line',
      smooth: true,
      data: scoreTrend.scores,
      areaStyle: { color: 'rgba(31, 79, 224, 0.12)' },
      lineStyle: { color: '#1F4FE0', width: 2.4 },
      itemStyle: { color: '#1F4FE0' },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          { yAxis: 90, lineStyle: { color: '#1B9E5C', type: 'dashed' }, label: { formatter: '优秀 90', position: 'end' } },
          { yAxis: 75, lineStyle: { color: '#E68B00', type: 'dashed' }, label: { formatter: '预警 75', position: 'end' } },
        ],
      },
    }],
  }), [scoreTrend])

  const historyColumns = [
    {
      title: '巡检时间',
      dataIndex: 'created_at',
      width: 170,
    },
    {
      title: '状态',
      width: 110,
      render: (_, row) => <StatusTag status={row.status} />,
    },
    {
      title: '综合评分',
      dataIndex: 'score',
      width: 100,
      render: (value) => (value != null ? <Text bold style={{ color: Number(value) >= 90 ? '#1B9E5C' : Number(value) >= 75 ? '#E68B00' : '#D63B3B' }}>{Math.round(Number(value))}</Text> : '--'),
    },
    {
      title: '检查项',
      dataIndex: 'check_count',
      width: 90,
      render: (value) => <Text code>{value ?? '--'}</Text>,
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      width: 90,
      render: (value) => <Text code>{value != null ? `${value}s` : '--'}</Text>,
    },
    {
      title: '操作',
      width: 100,
      render: (_, row) => <Button type="text" size="small" onClick={() => openDetail(row)}>查看详情</Button>,
    },
  ]

  return (
    <div className="prd-page" style={{ padding: 24, background: 'var(--prd-bg)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>自动巡检评分报告</Title>
          <Text type="secondary">将原来的巡检入口升级为评分报告页，强调整体健康分、分类结果、失败项和修复建议。</Text>
        </div>
        <Space wrap>
          <Text type="secondary">集群</Text>
          <Select placeholder="选择集群" value={clusterId || undefined} onChange={setClusterId} style={{ width: 220 }}>
            {clusters.map((cluster) => (
              <Option key={cluster.id} value={cluster.id}>{cluster.name}</Option>
            ))}
          </Select>
          <Button type="primary" icon={<IconPlayCircle />} onClick={handleRunNow} loading={running} disabled={!clusterId}>
            立即巡检
          </Button>
          <Button icon={<IconRefresh />} onClick={loadHistory} loading={loading} disabled={!clusterId} />
        </Space>
      </div>

      {clusters.length === 0 ? (
        <PrdCard title="自动巡检" sub="需要先完成集群接入">
          <Empty description="请先到湖运维中的集群管理页注册 Doris 集群" />
        </PrdCard>
      ) : (
        <>
          <div className="prd-kpi-grid">
            <StatCard label="最近巡检评分" value={latest?.score != null ? Math.round(Number(latest.score)) : '--'} valueSuffix={latest?.score != null ? '/100' : ''} sub={latest ? latest.created_at : '尚无成功巡检记录'} icon={<IconCheckCircle />} iconBg={latestLevel.kind === 'ok' ? '#E5F6EC' : latestLevel.kind === 'warn' ? '#FFF4E0' : '#FBE7E7'} iconColor={latestLevel.kind === 'ok' ? '#1B9E5C' : latestLevel.kind === 'warn' ? '#E68B00' : '#D63B3B'} />
            <StatCard label="近 30 次巡检" value={formatNumber(history.length)} sub={`${formatNumber(history.filter((item) => item.status === 'SUCCESS').length)} 成功 / ${formatNumber(history.filter((item) => item.status === 'FAILED').length)} 失败`} icon={<IconClockCircle />} iconBg="#EAF0FF" iconColor="#1F4FE0" />
            <StatCard label="失败项数量" value={formatNumber(recommendations.length)} sub="按失败和警告项生成修复建议" icon={<IconExclamationCircle />} iconBg="#FBE7E7" iconColor="#D63B3B" />
            <StatCard label="定时巡检" value={schedule.enabled ? `每 ${schedule.interval_minutes} 分钟` : '未开启'} sub={schedule.last_run_at ? `最近执行 ${schedule.last_run_at}` : '尚未有调度执行记录'} icon={<IconStorage />} iconBg="#F5E8FA" iconColor="#7B1FA2" />
          </div>

          <div className="inspection-score-grid">
            <PrdCard title="整体健康评分" sub="这一块应该成为汇报时的视觉中心" extra={<PrdTag kind={latestLevel.kind} led>{latestLevel.label}</PrdTag>}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <HealthRing percent={Number(latest?.score || 0)} />
              </div>
              <div className="inspection-category-grid">
                {categorySummary.length ? (
                  categorySummary.map((item) => (
                    <div key={item.title} className="inspection-category-card">
                      <div className="title">{item.title}</div>
                      <div className="meta">检查项 {item.total} · 通过 {item.passed} · 警告 {item.warning} · 失败 {item.failed}</div>
                    </div>
                  ))
                ) : (
                  <Empty description="暂无分类结果" />
                )}
              </div>
            </PrdCard>

            <PrdCard title="评分历史趋势" sub="用于展示最近巡检质量是否持续改善">
              {scoreTrend.scores.length ? (
                <ChartPanel option={trendOption} height={300} />
              ) : (
                <Empty description="暂无历史评分趋势" />
              )}
            </PrdCard>
          </div>

          <div className="prd-row-2-1">
            <PrdCard title="修复建议" sub="优先展示失败项和警告项，让运维知道下一步该做什么">
              {recommendations.length ? (
                <div className="inspection-recommend-list">
                  {recommendations.map((item) => (
                    <div key={`${item.title}-${item.copy}`} className="inspection-recommend-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div className="title">{item.title}</div>
                        <PrdTag kind={item.severity === 'critical' ? 'bad' : 'warn'}>{item.severity === 'critical' ? '高优先级' : '处理中'}</PrdTag>
                      </div>
                      <div className="meta">{item.copy}</div>
                      {item.value ? <div className="prd-code-block">{String(item.value)}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty description="当前最新巡检没有失败项和警告项" />
              )}
            </PrdCard>

            <PrdCard title="定时巡检设置" sub="保留原有运维能力，并将它融入报告页">
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Space>
                  <Text>启用定时巡检</Text>
                  <Switch checked={schedule.enabled} onChange={(value) => saveSchedule({ ...schedule, enabled: value })} />
                </Space>
                <Space align="center">
                  <Text>执行间隔</Text>
                  <InputNumber
                    min={5}
                    max={1440}
                    step={5}
                    value={schedule.interval_minutes}
                    onChange={(value) => setSchedule((current) => ({ ...current, interval_minutes: value }))}
                    suffix="分钟"
                    style={{ width: 160 }}
                  />
                  <Button size="small" onClick={() => saveSchedule(schedule)}>保存</Button>
                </Space>
                {schedule.last_run_at ? <Text type="secondary">最近调度执行: {schedule.last_run_at}</Text> : <Text type="secondary">尚无定时执行记录</Text>}
              </Space>
            </PrdCard>
          </div>

          <PrdCard title="最近巡检明细" sub="保留时间线、评分和详情入口，便于后续导出报告或做审计">
            <Table
              columns={historyColumns}
              data={history}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10, showTotal: true }}
              noDataElement={<Empty description="暂无巡检历史" />}
            />
          </PrdCard>

          <PrdCard title="最新巡检项结果" sub="适合在报告页底部展开看具体检查项">
            {latestItems.length ? (
              latestItems.map((item, index) => {
                const status = String(item.status || '').toUpperCase()
                return (
                  <CheckRow
                    key={`${item.name}-${index}`}
                    status={status === 'SUCCESS' ? 'ok' : status === 'WARNING' ? 'warn' : 'bad'}
                    icon={pickCheckIcon(item.name)}
                    title={item.name}
                    meta={item.suggestion || (status === 'SUCCESS' ? '检查通过' : '需要进一步处理')}
                    value={item.value}
                  />
                )
              })
            ) : (
              <Empty description="尚未生成巡检项结果，点击“立即巡检”开始执行" />
            )}
          </PrdCard>
        </>
      )}

      <Modal title="巡检详情" visible={!!detail} onCancel={() => setDetail(null)} footer={null} style={{ width: 840 }}>
        {detail ? (
          <div className="prd-page">
            <div className="prd-kpi-grid">
              <StatCard label="状态" value={String(detail.status || '--')} />
              <StatCard label="评分" value={detail.score != null ? Math.round(Number(detail.score)) : '--'} />
              <StatCard label="检查项" value={formatNumber(detail.check_count || 0)} />
              <StatCard label="耗时" value={detail.duration != null ? `${detail.duration}s` : '--'} />
            </div>
            {(detail.result?.items || []).length ? (
              (detail.result.items || []).map((item, index) => {
                const status = String(item.status || '').toUpperCase()
                return (
                  <CheckRow
                    key={`${item.name}-${index}`}
                    status={status === 'SUCCESS' ? 'ok' : status === 'WARNING' ? 'warn' : 'bad'}
                    icon={pickCheckIcon(item.name)}
                    title={item.name}
                    meta={item.suggestion || (status === 'SUCCESS' ? '检查通过' : '需要处理')}
                    value={item.value}
                  />
                )
              })
            ) : (
              <Empty description="暂无巡检项明细" />
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
