import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api, { getErrorMessage } from '@/api'

const defaultResources = { cpu: 4, gpu: 0, memory_gb: 16 }

const kindLabels = { source: '输入', transform: '处理', ai: '智能', sink: '输出' }
const healthStateLabels = { runnable: '可运行', staged: '待集成', missing_env: '缺环境变量', missing_dependency: '缺依赖', import_error: '导入失败' }
const getHealthStateLabel = (s) => healthStateLabels[s] || '未知'

function buildDefaultParamsText(item) {
  const d = item?.default_params || {}
  return Object.keys(d).length ? JSON.stringify(d, null, 2) : ''
}

function createNodeFromLibrary(item, pos = { x: 80, y: 80 }) {
  return {
    id: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    operatorId: item.id, label: item.label, description: item.description,
    kind: item.kind || 'transform', runtime: item.runtime || '', status: item.status || '',
    modality: item.modality || '', category: item.category || '', health: item.health || null,
    paramsSchema: item.params_schema || {}, defaultParams: item.default_params || {},
    sourceCodePath: item.source_code_path || '',
    inputTypes: item.input_types || [], outputTypes: item.output_types || [], tags: item.tags || [],
    x: pos.x, y: pos.y,
    config: { alias: item.label, paramsText: buildDefaultParamsText(item), notes: '' },
    paramsExpanded: true,
  }
}

function buildPresetGraph(preset, libraryMap) {
  const nodes = [], edges = []
  const gx = 260, gy = 200
  ;(preset?.nodes || []).forEach((nodeId, i) => {
    const item = libraryMap.get(nodeId) || { id: nodeId, label: nodeId, description: '未找到', kind: 'transform' }
    const node = createNodeFromLibrary(item, { x: 60 + (i % 4) * gx, y: 90 + Math.floor(i / 4) * gy })
    nodes.push(node)
    if (i > 0) edges.push({ id: `edge-${nodes[i - 1].id}-${node.id}`, source: nodes[i - 1].id, target: node.id })
  })
  return { presetNodes: nodes, presetEdges: edges }
}

function parseParams(text) {
  const raw = String(text || '').trim()
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function topoSort(nodes, edges) {
  if (!nodes.length) return []
  const adj = new Map(), deg = new Map(), nmap = new Map(nodes.map(n => [n.id, n]))
  nodes.forEach(n => { adj.set(n.id, []); deg.set(n.id, 0) })
  edges.forEach(e => { if (adj.has(e.source) && adj.has(e.target)) { adj.get(e.source).push(e.target); deg.set(e.target, (deg.get(e.target) || 0) + 1) } })
  const q = nodes.filter(n => (deg.get(n.id) || 0) === 0).sort((a, b) => a.x - b.x || a.y - b.y)
  const out = []
  while (q.length) { const c = q.shift(); out.push(c); (adj.get(c.id) || []).forEach(t => { const d = (deg.get(t) || 0) - 1; deg.set(t, d); if (d === 0) { q.push(nmap.get(t)); q.sort((a, b) => a.x - b.x || a.y - b.y) } }) }
  return out.length === nodes.length ? out : [...nodes].sort((a, b) => a.x - b.x || a.y - b.y)
}

function NodeParamForm({ node, onUpdate, llmModels = [] }) {
  const schema = node.paramsSchema || {}
  const keys = Object.keys(schema)
  if (!keys.length) return null
  let params = {}; try { params = parseParams(node.config?.paramsText) } catch {}
  const set = (k, v) => onUpdate({ paramsText: JSON.stringify({ ...params, [k]: v }, null, 2) })
  const isLLM = (k) => /model|llm|provider/i.test(k)
  return (
    <div className="workflow-node-params" onMouseDown={e => e.stopPropagation()}>
      {keys.map(k => {
        const s = schema[k], v = params[k] ?? s.default ?? '', t = s.type || 'string'
        return (
          <div key={k} className="workflow-param-field">
            <label className="workflow-param-label">{k}</label>
            {t === 'boolean' ? <input type="checkbox" checked={!!v} onChange={e => set(k, e.target.checked)} className="workflow-param-checkbox" />
            : t === 'integer' || t === 'number' ? <input type="number" value={v} onChange={e => set(k, t === 'integer' ? parseInt(e.target.value || 0, 10) : parseFloat(e.target.value || 0))} className="workflow-param-input" />
            : isLLM(k) && llmModels.length ? <select value={String(v)} onChange={e => set(k, e.target.value)} className="workflow-param-select"><option value="">选择模型</option>{llmModels.map(m => <option key={m.id} value={m.model}>{m.name}</option>)}</select>
            : s.enum?.length ? <select value={String(v)} onChange={e => set(k, e.target.value)} className="workflow-param-select">{s.enum.map(o => <option key={o} value={o}>{o}</option>)}</select>
            : t === 'array' ? <input type="text" value={Array.isArray(v) ? v.join(', ') : String(v)} onChange={e => set(k, e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="workflow-param-input" placeholder="逗号分隔" />
            : <input type="text" value={String(v)} onChange={e => set(k, e.target.value)} className="workflow-param-input" />}
            {s.description && <span className="workflow-param-hint">{s.description}</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function WorkflowStudio({ sourceHint = '', platformSettings = null, onBanner }) {
  const canvasRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const rafRef = useRef(null)
  const dragRef = useRef(null)
  const connectRef = useRef(null)

  const [library, setLibrary] = useState([])
  const [presets, setPresets] = useState([])
  const [workflowName, setWorkflowName] = useState('multimodal_workflow')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [resources, setResources] = useState(defaultResources)
  const [canvasNodes, setCanvasNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [connectSourceId, setConnectSourceId] = useState('')
  const [jobSpec, setJobSpec] = useState(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [llmModels, setLlmModels] = useState([])
  const [zoom, setZoom] = useState(1)
  const [, forceUpdate] = useState(0)

  nodesRef.current = canvasNodes
  edgesRef.current = edges

  useEffect(() => { api.getLLMModels().then(r => setLlmModels(Array.isArray(r?.items) ? r.items : [])).catch(() => {}) }, [])

  useEffect(() => {
    api.getWorkflowPresets().then(r => {
      const lib = Array.isArray(r?.library) ? r.library : []
      const pre = Array.isArray(r?.presets) ? r.presets : []
      setLibrary(lib); setPresets(pre)
      if (pre.length) {
        const lm = new Map(lib.map(i => [i.id, i]))
        const { presetNodes, presetEdges } = buildPresetGraph(pre[0], lm)
        setSelectedPresetId(pre[0].id); setWorkflowName(pre[0].id)
        setCanvasNodes(presetNodes); setEdges(presetEdges)
        setResources(pre[0].resources || defaultResources)
        setSelectedNodeId(presetNodes[0]?.id || '')
      }
    }).catch(e => setError(getErrorMessage(e, '加载失败'))).finally(() => setLoading(false))
  }, [])

  const libraryMap = useMemo(() => new Map(library.map(i => [i.id, i])), [library])
  const filteredLibrary = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase()
    if (!kw) return library
    return library.filter(i => [i.label, i.description, i.kind, i.id, i.modality, i.category, i.runtime, ...(i.tags || [])].some(f => String(f || '').toLowerCase().includes(kw)))
  }, [library, searchKeyword])

  const selectedNode = useMemo(() => canvasNodes.find(n => n.id === selectedNodeId), [canvasNodes, selectedNodeId])
  const selectedNodeIndex = useMemo(() => canvasNodes.findIndex(n => n.id === selectedNodeId), [canvasNodes, selectedNodeId])
  const orderedNodes = useMemo(() => topoSort(canvasNodes, edges), [canvasNodes, edges])

  useEffect(() => {
    if (!orderedNodes.length) { setJobSpec(null); return }
    api.buildWorkflowJob({ name: workflowName || 'multimodal_workflow', nodes: orderedNodes.map(n => n.operatorId), source_hint: sourceHint, ...resources })
      .then(r => setJobSpec({ ...(r?.data || {}), graph: { nodes: orderedNodes.map(n => ({ id: n.id, operatorId: n.operatorId, alias: n.config?.alias || n.label, paramsText: n.config?.paramsText || '', notes: n.config?.notes || '' })), edges } }))
      .catch(e => setError(getErrorMessage(e, '生成预览失败')))
  }, [edges, orderedNodes, resources, sourceHint, workflowName])

  // --- 节点拖拽 ---
  const onNodeMouseDown = useCallback((e, node) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    dragRef.current = {
      nodeId: node.id,
      startX: e.clientX, startY: e.clientY,
      nodeStartX: node.x, nodeStartY: node.y,
      canvasLeft: rect.left, canvasTop: rect.top,
      scrollLeft: canvas.scrollLeft, scrollTop: canvas.scrollTop,
    }
    setSelectedNodeId(node.id)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      const newX = Math.max(20, d.nodeStartX + dx)
      const newY = Math.max(20, d.nodeStartY + dy)
      // 直接更新 state，用 requestAnimationFrame 节流
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setCanvasNodes(prev => prev.map(n => n.id === d.nodeId ? { ...n, x: newX, y: newY } : n))
      })
    }
    const onUp = () => {
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // --- 连线：拖拽式 ---
  const onOutputMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation()
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) return
    connectRef.current = {
      sourceId: nodeId,
      startX: node.x + 220, startY: node.y + 44,
      mouseX: e.clientX - rect.left + canvas.scrollLeft,
      mouseY: e.clientY - rect.top + canvas.scrollTop,
    }
    setConnectSourceId(nodeId)
    document.body.style.cursor = 'crosshair'
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      const c = connectRef.current
      if (!c) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      c.mouseX = e.clientX - rect.left + canvas.scrollLeft
      c.mouseY = e.clientY - rect.top + canvas.scrollTop
      forceUpdate(n => n + 1)
    }
    const onUp = (e) => {
      const c = connectRef.current
      if (!c) return
      // 检测是否松在某个节点的输入口上
      const target = e.target.closest('.workflow-handle-input')
      if (target) {
        const targetId = target.dataset.nodeId
        if (targetId && targetId !== c.sourceId) {
          setEdges(prev => {
            if (prev.some(ed => ed.source === c.sourceId && ed.target === targetId)) return prev
            return [...prev, { id: `edge-${c.sourceId}-${targetId}`, source: c.sourceId, target: targetId }]
          })
        }
      }
      connectRef.current = null
      setConnectSourceId('')
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const applyPreset = (pid) => {
    const p = presets.find(i => i.id === pid); if (!p) return
    const { presetNodes, presetEdges } = buildPresetGraph(p, libraryMap)
    setSelectedPresetId(pid); setWorkflowName(p.id); setCanvasNodes(presetNodes); setEdges(presetEdges)
    setResources(p.resources || defaultResources); setSelectedNodeId(presetNodes[0]?.id || ''); setConnectSourceId('')
    if (onBanner) onBanner('success', `已应用：${p.name}`)
  }
  const addNode = (item, pos) => { const n = createNodeFromLibrary(item, pos); setCanvasNodes(p => [...p, n]); setSelectedNodeId(n.id); setSelectedPresetId('') }
  const removeNode = (id) => { setCanvasNodes(p => p.filter(n => n.id !== id)); setEdges(p => p.filter(e => e.source !== id && e.target !== id)); setSelectedNodeId(p => p === id ? '' : p); setConnectSourceId(p => p === id ? '' : p) }
  const dupNode = (id) => { const src = canvasNodes.find(n => n.id === id); if (!src) return; const n = { ...src, id: `${src.operatorId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x: src.x + 36, y: src.y + 36, config: { ...src.config } }; setCanvasNodes(p => [...p, n]); setSelectedNodeId(n.id) }
  const clearAll = () => { setCanvasNodes([]); setEdges([]); setSelectedPresetId(''); setSelectedNodeId(''); setConnectSourceId(''); setJobSpec(null) }
  const updateNodeConfig = (patch) => { if (!selectedNodeId) return; setCanvasNodes(p => p.map(n => n.id === selectedNodeId ? { ...n, config: { ...n.config, ...patch } } : n)) }
  const toggleParams = (id) => { setCanvasNodes(p => p.map(n => n.id === id ? { ...n, paramsExpanded: !n.paramsExpanded } : n)) }
  const removeEdge = (eid) => { setEdges(p => p.filter(e => e.id !== eid)) }
  const copyText = async (text, msg) => { try { await navigator.clipboard.writeText(text); onBanner?.('success', msg) } catch { setError('复制失败') } }

  const nodeStats = useMemo(() => ({
    total: canvasNodes.length, edges: edges.length,
    connected: new Set(edges.flatMap(e => [e.source, e.target])).size,
  }), [canvasNodes.length, edges])

  if (loading) return <div className="loading-state compact">加载中...</div>

  // 计算连线路径
  const renderEdges = () => {
    const allEdges = [...edgesRef.current]
    // 添加正在拖拽的连线
    const c = connectRef.current
    if (c) {
      const canvas = canvasRef.current
      if (canvas) {
        const path = `M ${c.startX} ${c.startY} C ${c.startX + 80} ${c.startY}, ${c.mouseX - 80} ${c.mouseY}, ${c.mouseX} ${c.mouseY}`
        allEdges.push({ id: '__connecting__', path, isConnecting: true })
      }
    }
    return allEdges.map(edge => {
      if (edge.isConnecting) return <path key={edge.id} d={edge.path} className="workflow-edge-path workflow-edge-connecting" />
      const src = nodesRef.current.find(n => n.id === edge.source)
      const tgt = nodesRef.current.find(n => n.id === edge.target)
      if (!src || !tgt) return null
      const x1 = src.x + 220, y1 = src.y + 44, x2 = tgt.x, y2 = tgt.y + 44
      const d = `M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`
      return <path key={edge.id} d={d} className="workflow-edge-path" />
    })
  }

  return (
    <section className="workflow-studio-fullscreen">
      {error && <div className="error-banner">{error}</div>}

      <div className="workflow-top-toolbar">
        <div className="workflow-toolbar-left">
          <select className="select workflow-preset-select" value={selectedPresetId} onChange={e => applyPreset(e.target.value)}>
            <option value="">选择预设模板</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="input workflow-name-input" value={workflowName} onChange={e => setWorkflowName(e.target.value)} placeholder="工作流名称" />
        </div>
        <div className="workflow-toolbar-center">
          <span className="badge">{nodeStats.total} 节点</span>
          <span className="badge subtle">{nodeStats.edges} 连线</span>
          <span className="badge subtle">已连接 {nodeStats.connected}</span>
          {connectSourceId && <span className="badge warning">连线中</span>}
        </div>
        <div className="workflow-toolbar-right">
          <button className="button button-small button-secondary" onClick={clearAll} disabled={!canvasNodes.length}>清空</button>
          <button className="button button-small button-primary" onClick={() => copyText(jobSpec?.entrypoint || '', '已复制命令')} disabled={!jobSpec?.entrypoint}>复制命令</button>
          <button className="button button-small button-secondary" onClick={() => copyText(JSON.stringify(jobSpec?.graph, null, 2), '已复制图定义')} disabled={!jobSpec?.graph}>复制图</button>
        </div>
      </div>

      <div className="workflow-studio-layout">
        <aside className={`workflow-library-column workflow-panel ${leftCollapsed ? 'is-collapsed' : ''}`}>
          {!leftCollapsed ? (
            <>
              <div className="workflow-panel-head">
                <div className="panel-title">算子库</div>
                <button className="button button-mini button-ghost" onClick={() => setLeftCollapsed(true)}>收起</button>
              </div>
              <div className="field"><input className="input" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} placeholder="搜索算子..." /></div>
              <div className="workflow-library-grid">
                {filteredLibrary.map(item => (
                  <button key={item.id} type="button" draggable className={`workflow-library-item kind-${item.kind || 'transform'}`}
                    onDragStart={e => { e.dataTransfer.setData('application/operator-id', item.id); e.dataTransfer.effectAllowed = 'copy' }}
                    onClick={() => addNode(item, { x: 72, y: 72 + canvasNodes.length * 26 })}>
                    <div className="workflow-library-topline"><span className="workflow-library-name">{item.label}</span><span className="workflow-kind-chip">{kindLabels[item.kind] || '节点'}</span></div>
                    <span className="workflow-library-copy">{item.description}</span>
                    <span className="workflow-library-copy">{item.runtime || 'N/A'} | {getHealthStateLabel(item?.health?.state)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="workflow-collapse-expand" onClick={() => setLeftCollapsed(false)}>算子库</button>
          )}
        </aside>

        <main className="workflow-canvas-column workflow-panel">
          <div className="workflow-zoom-controls">
            <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="放大">+</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} title="缩小">−</button>
            <button onClick={() => setZoom(1)} title="重置">↺</button>
          </div>
          <div className="workflow-minimap">
            <div className="workflow-minimap-title">小地图</div>
            <svg viewBox={`0 0 ${Math.max(1200, ...canvasNodes.map(n => n.x + 240))} ${Math.max(800, ...canvasNodes.map(n => n.y + 100))}`} preserveAspectRatio="xMidYMid meet">
              {edges.map(e => {
                const s = canvasNodes.find(n => n.id === e.source)
                const t = canvasNodes.find(n => n.id === e.target)
                if (!s || !t) return null
                return <line key={e.id} x1={s.x + 110} y1={s.y + 44} x2={t.x} y2={t.y + 44} stroke="rgba(22,93,255,0.3)" strokeWidth="2" />
              })}
              {canvasNodes.map(n => (
                <rect key={n.id} x={n.x} y={n.y} width={220} height={88} rx="6"
                  fill={selectedNodeId === n.id ? 'rgba(22,93,255,0.2)' : 'rgba(255,255,255,0.8)'}
                  stroke={selectedNodeId === n.id ? 'rgba(22,93,255,0.6)' : 'rgba(0,0,0,0.1)'} strokeWidth="1" />
              ))}
            </svg>
          </div>
          <div ref={canvasRef} className="workflow-node-canvas"
            style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
            onWheel={e => { if (e.ctrlKey) { e.preventDefault(); setZoom(z => Math.min(2, Math.max(0.3, z + (e.deltaY > 0 ? -0.1 : 0.1)))) } }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const opId = e.dataTransfer.getData('application/operator-id'); const op = libraryMap.get(opId); if (!op || !canvasRef.current) return; const r = canvasRef.current.getBoundingClientRect(); addNode(op, { x: Math.max(24, (e.clientX - r.left) / zoom - 110), y: Math.max(24, (e.clientY - r.top) / zoom - 42) }) }}>
            <svg className="workflow-edge-layer">{renderEdges()}</svg>
            {canvasNodes.length ? canvasNodes.map(node => (
              <div key={node.id} id={`wf-node-${node.id}`}
                className={`workflow-graph-node kind-${node.kind || 'transform'} ${selectedNodeId === node.id ? 'is-selected' : ''} ${node.paramsExpanded ? 'is-expanded' : ''}`}
                style={{ left: node.x, top: node.y }}
                onClick={() => setSelectedNodeId(node.id)}>
                <button type="button" className={`workflow-handle workflow-handle-input ${connectSourceId && connectSourceId !== node.id ? 'is-ready' : ''}`}
                  data-node-id={node.id}
                  onMouseDown={e => {
                    // 如果正在连线，点击输入口完成连线
                    const c = connectRef.current
                    if (c && c.sourceId !== node.id) {
                      setEdges(prev => { if (prev.some(ed => ed.source === c.sourceId && ed.target === node.id)) return prev; return [...prev, { id: `edge-${c.sourceId}-${node.id}`, source: c.sourceId, target: node.id }] })
                      connectRef.current = null; setConnectSourceId(''); document.body.style.cursor = ''
                      e.stopPropagation()
                    }
                  }} title="接入上游" />
                <div className="workflow-graph-node-header" onMouseDown={e => onNodeMouseDown(e, node)}>
                  <div className="workflow-graph-node-meta"><div className="workflow-graph-node-title">{node.config?.alias || node.label}</div><div className="workflow-graph-node-subtitle">{node.description}</div></div>
                  <span className="workflow-kind-chip">{kindLabels[node.kind] || '节点'}</span>
                </div>
                <div className="workflow-graph-node-body"><div className="workflow-node-code">{node.operatorId}</div></div>
                {Object.keys(node.paramsSchema || {}).length > 0 && (
                  <button type="button" className="workflow-params-toggle" onClick={e => { e.stopPropagation(); toggleParams(node.id) }}>{node.paramsExpanded ? '收起参数' : '展开参数'}</button>
                )}
                {node.paramsExpanded && <NodeParamForm node={node} llmModels={llmModels} onUpdate={patch => setCanvasNodes(p => p.map(n => n.id === node.id ? { ...n, config: { ...n.config, ...patch } } : n))} />}
                <div className="workflow-graph-node-actions">
                  <button className="button button-mini button-ghost" onClick={() => dupNode(node.id)}>复制</button>
                  <button className="button button-mini button-danger" onClick={() => removeNode(node.id)}>删除</button>
                </div>
                <button type="button" className={`workflow-handle workflow-handle-output ${connectSourceId === node.id ? 'is-linking' : ''}`}
                  onMouseDown={e => onOutputMouseDown(e, node.id)} title="连接下游" />
              </div>
            )) : <div className="empty-state small workflow-empty-state">拖入算子开始搭建</div>}
          </div>
        </main>

        <aside className={`workflow-summary-column workflow-panel ${rightCollapsed ? 'is-collapsed' : ''}`}>
          {!rightCollapsed ? (
            <>
              <div className="workflow-panel-head"><div className="panel-title">配置面板</div><button className="button button-mini button-ghost" onClick={() => setRightCollapsed(true)}>收起</button></div>
              <div className="workflow-inspector-block">
                <div className="kpi-label">当前节点</div>
                {selectedNode ? (
                  <>
                    <div className="workflow-selected-title">{selectedNode.label}</div>
                    <pre className="workflow-code-block mono" style={{ marginBottom: 12 }}>{`算子: ${selectedNode.operatorId}\n运行时: ${selectedNode.runtime || 'N/A'}\n状态: ${getHealthStateLabel(selectedNode?.health?.state)}\n模态: ${selectedNode.modality || 'N/A'}`}</pre>
                    <div className="field"><label>别名</label><input className="input" value={selectedNode.config?.alias || ''} onChange={e => updateNodeConfig({ alias: e.target.value })} /></div>
                    <div className="field"><label>备注</label><textarea className="textarea" value={selectedNode.config?.notes || ''} onChange={e => updateNodeConfig({ notes: e.target.value })} rows={2} /></div>
                  </>
                ) : <div className="empty-state small">选中节点后编辑</div>}
              </div>
              <div className="workflow-resource-grid">
                <div className="field compact-field"><label>CPU</label><input className="input" type="number" min="1" value={resources.cpu} onChange={e => setResources(p => ({ ...p, cpu: +e.target.value || 1 }))} /></div>
                <div className="field compact-field"><label>GPU</label><input className="input" type="number" min="0" value={resources.gpu} onChange={e => setResources(p => ({ ...p, gpu: +e.target.value || 0 }))} /></div>
                <div className="field compact-field"><label>内存 GB</label><input className="input" type="number" min="1" value={resources.memory_gb} onChange={e => setResources(p => ({ ...p, memory_gb: +e.target.value || 1 }))} /></div>
              </div>
              <div className="workflow-summary-panel">
                <div className="kpi-label">拓扑顺序</div>
                <div className="workflow-node-order">{orderedNodes.map((n, i) => <div key={n.id} className={`workflow-node-order-item ${selectedNodeIndex === i ? 'is-active' : ''}`}><span>{String(i + 1).padStart(2, '0')}</span><strong>{n.config?.alias || n.label}</strong></div>)}</div>
              </div>
              <div className="workflow-summary-panel">
                <div className="kpi-label">连线</div>
                {edges.length ? <div className="workflow-edge-list">{edges.map(e => {
                  const s = canvasNodes.find(n => n.id === e.source)?.label || e.source
                  const t = canvasNodes.find(n => n.id === e.target)?.label || e.target
                  return <div key={e.id} className="workflow-edge-row"><span>{s}</span><span className="workflow-edge-arrow">→</span><span>{t}</span><button className="button button-mini button-ghost" onClick={() => removeEdge(e.id)}>×</button></div>
                })}</div> : <div className="empty-state small">无连线</div>}
              </div>
              <div className="workflow-summary-panel"><div className="kpi-label">Ray Job</div><div className="workflow-code-block mono" style={{ fontSize: 11 }}>{building ? '生成中...' : (jobSpec?.entrypoint || '放置节点后生成')}</div></div>
            </>
          ) : (
            <button className="workflow-collapse-expand" onClick={() => setRightCollapsed(false)}>配置</button>
          )}
        </aside>
      </div>
    </section>
  )
}
