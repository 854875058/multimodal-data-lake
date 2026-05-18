import { useEffect, useMemo, useRef, useState } from 'react'
import api, { getErrorMessage } from '@/api'

const defaultResources = {
  cpu: 4,
  gpu: 0,
  memory_gb: 16,
}

const kindLabels = {
  source: '输入',
  transform: '处理',
  ai: '智能',
  sink: '输出',
}

const healthStateLabels = {
  runnable: 'Runnable',
  staged: 'Staged',
  missing_env: 'Missing env',
  missing_dependency: 'Missing dependency',
  import_error: 'Import error',
}

function getHealthStateLabel(state) {
  return healthStateLabels[state] || 'Unknown'
}

function buildDefaultParamsText(item) {
  const defaults = item?.default_params || {}
  return Object.keys(defaults).length ? JSON.stringify(defaults, null, 2) : ''
}

function createNodeFromLibrary(item, position = { x: 80, y: 80 }) {
  const timestamp = Date.now()
  return {
    id: `${item.id}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    operatorId: item.id,
    label: item.label,
    description: item.description,
    kind: item.kind || 'transform',
    runtime: item.runtime || '',
    status: item.status || '',
    modality: item.modality || '',
    category: item.category || '',
    health: item.health || null,
    paramsSchema: item.params_schema || {},
    sourceCodePath: item.source_code_path || '',
    inputTypes: item.input_types || [],
    outputTypes: item.output_types || [],
    tags: item.tags || [],
    x: position.x,
    y: position.y,
    config: {
      alias: item.label,
      paramsText: buildDefaultParamsText(item),
      notes: '',
    },
  }
}

function buildPresetGraph(preset, libraryMap) {
  const presetNodes = []
  const presetEdges = []
  const baseX = 60
  const baseY = 90
  const gapX = 240
  ;(preset?.nodes || []).forEach((nodeId, index) => {
    const item = libraryMap.get(nodeId) || {
      id: nodeId,
      label: nodeId,
      description: '未在算子库中找到该节点定义',
      kind: 'transform',
    }
    const node = createNodeFromLibrary(item, {
      x: baseX + (index % 3) * gapX,
      y: baseY + Math.floor(index / 3) * 170,
    })
    presetNodes.push(node)
    if (index > 0) {
      presetEdges.push({
        id: `edge-${presetNodes[index - 1].id}-${node.id}`,
        source: presetNodes[index - 1].id,
        target: node.id,
      })
    }
  })
  return { presetNodes, presetEdges }
}

function parseParams(text) {
  const raw = String(text || '').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

function sortNodesForExecution(nodes, edges) {
  if (!nodes.length) return []
  const adjacency = new Map()
  const indegree = new Map()
  const nodeMap = new Map(nodes.map((item) => [item.id, item]))

  nodes.forEach((node) => {
    adjacency.set(node.id, [])
    indegree.set(node.id, 0)
  })

  edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return
    adjacency.get(edge.source).push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
  })

  const queue = nodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .sort((a, b) => (a.x - b.x) || (a.y - b.y))

  const ordered = []
  while (queue.length) {
    const current = queue.shift()
    ordered.push(current)
    ;(adjacency.get(current.id) || []).forEach((targetId) => {
      const next = (indegree.get(targetId) || 0) - 1
      indegree.set(targetId, next)
      if (next === 0) {
        queue.push(nodeMap.get(targetId))
        queue.sort((a, b) => (a.x - b.x) || (a.y - b.y))
      }
    })
  }

  if (ordered.length !== nodes.length) {
    return [...nodes].sort((a, b) => (a.x - b.x) || (a.y - b.y))
  }
  return ordered
}

export default function WorkflowStudio({ sourceHint = '', onBanner }) {
  const canvasRef = useRef(null)
  const dragStateRef = useRef(null)
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

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.getWorkflowPresets()
        const nextLibrary = Array.isArray(response?.library) ? response.library : []
        const nextPresets = Array.isArray(response?.presets) ? response.presets : []
        setLibrary(nextLibrary)
        setPresets(nextPresets)
        if (nextPresets.length) {
          const firstPreset = nextPresets[0]
          const libraryMap = new Map(nextLibrary.map((item) => [item.id, item]))
          const { presetNodes, presetEdges } = buildPresetGraph(firstPreset, libraryMap)
          setSelectedPresetId(firstPreset.id)
          setWorkflowName(firstPreset.id)
          setCanvasNodes(presetNodes)
          setEdges(presetEdges)
          setResources(firstPreset.resources || defaultResources)
          setSelectedNodeId(presetNodes[0]?.id || '')
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError, '加载工作流预设失败'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const libraryMap = useMemo(() => new Map(library.map((item) => [item.id, item])), [library])

  const filteredLibrary = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return library
    return library.filter((item) =>
      [
        item.label,
        item.description,
        item.kind,
        item.id,
        item.modality,
        item.category,
        item.runtime,
        ...(Array.isArray(item.tags) ? item.tags : []),
      ].some((field) =>
        String(field || '').toLowerCase().includes(keyword)
      )
    )
  }, [library, searchKeyword])

  const selectedNode = useMemo(
    () => canvasNodes.find((item) => item.id === selectedNodeId) || null,
    [canvasNodes, selectedNodeId]
  )

  const selectedNodeIndex = useMemo(
    () => canvasNodes.findIndex((item) => item.id === selectedNodeId),
    [canvasNodes, selectedNodeId]
  )

  const orderedNodes = useMemo(() => sortNodesForExecution(canvasNodes, edges), [canvasNodes, edges])

  useEffect(() => {
    if (!orderedNodes.length) {
      setJobSpec(null)
      return
    }

    const build = async () => {
      setBuilding(true)
      try {
        const response = await api.buildWorkflowJob({
          name: workflowName || 'multimodal_workflow',
          nodes: orderedNodes.map((item) => item.operatorId),
          source_hint: sourceHint,
          ...resources,
        })
        setJobSpec({
          ...(response?.data || {}),
          graph: {
            nodes: orderedNodes.map((node) => ({
              id: node.id,
              operatorId: node.operatorId,
              alias: node.config?.alias || node.label,
              paramsText: node.config?.paramsText || '',
              notes: node.config?.notes || '',
            })),
            edges,
          },
        })
      } catch (requestError) {
        setError(getErrorMessage(requestError, '生成工作流任务预览失败'))
      } finally {
        setBuilding(false)
      }
    }

    build()
  }, [edges, orderedNodes, resources, sourceHint, workflowName])

  useEffect(() => {
    const onPointerMove = (event) => {
      const dragState = dragStateRef.current
      if (!dragState) return
      setCanvasNodes((current) =>
        current.map((node) =>
          node.id === dragState.nodeId
            ? {
                ...node,
                x: Math.max(20, event.clientX - dragState.offsetX),
                y: Math.max(20, event.clientY - dragState.offsetY),
              }
            : node
        )
      )
    }

    const onPointerUp = () => {
      dragStateRef.current = null
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }

    if (dragStateRef.current) {
      window.addEventListener('mousemove', onPointerMove)
      window.addEventListener('mouseup', onPointerUp)
    }

    return () => {
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }
  }, [canvasNodes])

  const applyPreset = (presetId) => {
    const preset = presets.find((item) => item.id === presetId)
    if (!preset) return
    const { presetNodes, presetEdges } = buildPresetGraph(preset, libraryMap)
    setSelectedPresetId(presetId)
    setWorkflowName(preset.id)
    setCanvasNodes(presetNodes)
    setEdges(presetEdges)
    setResources(preset.resources || defaultResources)
    setSelectedNodeId(presetNodes[0]?.id || '')
    setConnectSourceId('')
    setError('')
    if (typeof onBanner === 'function') {
      onBanner('success', `已应用工作流预设：${preset.name}`)
    }
  }

  const addNodeToCanvas = (item, position) => {
    const nextNode = createNodeFromLibrary(item, position)
    setCanvasNodes((current) => [...current, nextNode])
    setSelectedNodeId(nextNode.id)
    setSelectedPresetId('')
  }

  const removeNode = (nodeId) => {
    setCanvasNodes((current) => current.filter((item) => item.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    setSelectedNodeId((current) => (current === nodeId ? '' : current))
    setConnectSourceId((current) => (current === nodeId ? '' : current))
  }

  const duplicateNode = (nodeId) => {
    const sourceNode = canvasNodes.find((item) => item.id === nodeId)
    if (!sourceNode) return
    const nextNode = {
      ...sourceNode,
      id: `${sourceNode.operatorId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: sourceNode.x + 36,
      y: sourceNode.y + 36,
      config: { ...sourceNode.config },
    }
    setCanvasNodes((current) => [...current, nextNode])
    setSelectedNodeId(nextNode.id)
  }

  const clearWorkflow = () => {
    setCanvasNodes([])
    setEdges([])
    setSelectedPresetId('')
    setSelectedNodeId('')
    setConnectSourceId('')
    setJobSpec(null)
  }

  const onLibraryDragStart = (event, item) => {
    event.dataTransfer.setData('application/operator-id', item.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  const onCanvasDrop = (event) => {
    event.preventDefault()
    const operatorId = event.dataTransfer.getData('application/operator-id')
    const operator = libraryMap.get(operatorId)
    if (!operator || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    addNodeToCanvas(operator, {
      x: Math.max(24, event.clientX - rect.left - 96),
      y: Math.max(24, event.clientY - rect.top - 42),
    })
  }

  const onNodeMouseDown = (event, node) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    dragStateRef.current = {
      nodeId: node.id,
      offsetX: event.clientX - rect.left - node.x,
      offsetY: event.clientY - rect.top - node.y,
    }
    setSelectedNodeId(node.id)
  }

  const createEdge = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    setEdges((current) => {
      const exists = current.some((edge) => edge.source === sourceId && edge.target === targetId)
      if (exists) return current
      return [...current, { id: `edge-${sourceId}-${targetId}`, source: sourceId, target: targetId }]
    })
  }

  const onInputHandleClick = (nodeId) => {
    if (connectSourceId && connectSourceId !== nodeId) {
      createEdge(connectSourceId, nodeId)
      setConnectSourceId('')
      return
    }
    setSelectedNodeId(nodeId)
  }

  const onOutputHandleClick = (nodeId) => {
    setConnectSourceId((current) => (current === nodeId ? '' : nodeId))
    setSelectedNodeId(nodeId)
  }

  const updateSelectedNodeConfig = (patch) => {
    if (!selectedNodeId) return
    setCanvasNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? { ...node, config: { ...node.config, ...patch } }
          : node
      )
    )
  }

  const removeEdge = (edgeId) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId))
  }

  const copyEntrypoint = async () => {
    const entrypoint = String(jobSpec?.entrypoint || '').trim()
    if (!entrypoint) return
    try {
      await navigator.clipboard.writeText(entrypoint)
      onBanner?.('success', '已复制工作流命令')
    } catch (copyError) {
      setError(getErrorMessage(copyError, '复制工作流命令失败'))
    }
  }

  const copyGraphSpec = async () => {
    if (!jobSpec?.graph) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(jobSpec.graph, null, 2))
      onBanner?.('success', '已复制工作流图定义')
    } catch (copyError) {
      setError(getErrorMessage(copyError, '复制工作流图定义失败'))
    }
  }

  const paramsValidationMessage = useMemo(() => {
    if (!selectedNode?.config?.paramsText) return ''
    try {
      parseParams(selectedNode.config.paramsText)
      return '参数 JSON 合法'
    } catch {
      return '参数 JSON 不合法'
    }
  }, [selectedNode])

  const nodeStats = useMemo(() => {
    return {
      total: canvasNodes.length,
      edges: edges.length,
      connected: new Set(edges.flatMap((edge) => [edge.source, edge.target])).size,
    }
  }, [canvasNodes.length, edges])

  if (loading) {
    return <div className="loading-state compact">工作流模板加载中...</div>
  }

  return (
    <section className="glass-card workflow-studio-card workflow-editor-shell">
      <div className="card-header workflow-editor-header">
        <div>
          <h2>可视化工作流编排</h2>
          <p>从左侧拖入算子，在中间画布布置节点并建立依赖关系，右侧维护节点参数、资源配置和任务预览。</p>
        </div>
        <div className="workflow-head-badges">
          <span className="badge">{nodeStats.total} 个节点</span>
          <span className="badge subtle">{nodeStats.edges} 条连线</span>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="workflow-studio-layout workflow-editor-layout">
        <aside className="workflow-library-column workflow-panel">
          <div className="workflow-panel-head">
            <div>
              <div className="panel-title">算子库</div>
              <div className="panel-copy">拖到画布即可生成节点，也可以先套用预设工作流。</div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="workflow_preset">预设模板</label>
            <select
              id="workflow_preset"
              className="select"
              value={selectedPresetId}
              onChange={(event) => applyPreset(event.target.value)}
            >
              <option value="">选择模板</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="workflow_search">筛选算子</label>
            <input
              id="workflow_search"
              className="input"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="按名称、类型或描述搜索"
            />
          </div>

          <div className="workflow-library-grid">
            {filteredLibrary.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                className={`workflow-library-item kind-${item.kind || 'transform'}`}
                onDragStart={(event) => onLibraryDragStart(event, item)}
                onClick={() => addNodeToCanvas(item, { x: 72, y: 72 + canvasNodes.length * 26 })}
              >
                <div className="workflow-library-topline">
                  <span className="workflow-library-name">{item.label}</span>
                  <span className="workflow-kind-chip">{kindLabels[item.kind] || '节点'}</span>
                </div>
                <span className="workflow-library-copy">{item.description}</span>
                <span className="workflow-library-copy">
                  {`${item.runtime || 'Runtime N/A'} | ${getHealthStateLabel(item?.health?.state)}`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="workflow-canvas-column workflow-panel">
          <div className="workflow-panel-head">
            <div>
              <div className="panel-title">工作流画布</div>
              <div className="panel-copy">
                蓝色输出点用于发起连线，节点左侧输入点用于接收连线。拖拽节点可以调整布局。
              </div>
            </div>
            <div className="toolbar-group">
              <button type="button" className="button button-small button-secondary" onClick={clearWorkflow} disabled={!canvasNodes.length}>
                清空画布
              </button>
            </div>
          </div>

          <div className="toolbar workflow-inline-toolbar">
            <div className="toolbar-group">
              <div className="field grow-field">
                <label htmlFor="workflow_name">工作流名称</label>
                <input
                  id="workflow_name"
                  className="input"
                  value={workflowName}
                  onChange={(event) => setWorkflowName(event.target.value)}
                  placeholder="multimodal_workflow"
                />
              </div>
            </div>
            <div className="workflow-inline-metrics">
              <span>已连接节点 {nodeStats.connected}</span>
              {connectSourceId ? <span className="linking-state">连线中</span> : null}
            </div>
          </div>

          <div
            ref={canvasRef}
            className="workflow-node-canvas"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onCanvasDrop}
          >
            <svg className="workflow-edge-layer" aria-hidden="true">
              {edges.map((edge) => {
                const source = canvasNodes.find((node) => node.id === edge.source)
                const target = canvasNodes.find((node) => node.id === edge.target)
                if (!source || !target) return null
                const x1 = source.x + 188
                const y1 = source.y + 44
                const x2 = target.x
                const y2 = target.y + 44
                const curve = `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`
                return <path key={edge.id} d={curve} className="workflow-edge-path" />
              })}
            </svg>

            {canvasNodes.length ? (
              canvasNodes.map((node) => (
                <div
                  key={node.id}
                  className={`workflow-graph-node kind-${node.kind || 'transform'} ${selectedNodeId === node.id ? 'is-selected' : ''}`}
                  style={{ left: node.x, top: node.y }}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  <button
                    type="button"
                    className={`workflow-handle workflow-handle-input ${connectSourceId && connectSourceId !== node.id ? 'is-ready' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onInputHandleClick(node.id)
                    }}
                    title="接入上游"
                  />

                  <div className="workflow-graph-node-header" onMouseDown={(event) => onNodeMouseDown(event, node)}>
                    <div className="workflow-graph-node-meta">
                      <div className="workflow-graph-node-title">{node.config?.alias || node.label}</div>
                      <div className="workflow-graph-node-subtitle">{node.description}</div>
                    </div>
                    <span className="workflow-kind-chip">{kindLabels[node.kind] || '节点'}</span>
                  </div>

                  <div className="workflow-graph-node-body">
                    <div className="workflow-node-code">{node.operatorId}</div>
                    <div className="workflow-node-notes">{node.config?.notes || '未配置节点备注'}</div>
                  </div>

                  <div className="workflow-graph-node-actions">
                    <button type="button" className="button button-mini button-ghost" onClick={() => duplicateNode(node.id)}>复制</button>
                    <button type="button" className="button button-mini button-danger" onClick={() => removeNode(node.id)}>删除</button>
                  </div>

                  <button
                    type="button"
                    className={`workflow-handle workflow-handle-output ${connectSourceId === node.id ? 'is-linking' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onOutputHandleClick(node.id)
                    }}
                    title="连接下游"
                  />
                </div>
              ))
            ) : (
              <div className="empty-state small workflow-empty-state">
                从左侧拖入算子开始搭建工作流，当前画布支持节点拖拽、连线和参数配置。
              </div>
            )}
          </div>
        </main>

        <aside className="workflow-summary-column workflow-panel">
          <div className="workflow-panel-head">
            <div>
              <div className="panel-title">节点与运行配置</div>
              <div className="panel-copy">右侧负责参数、资源和 Ray Job 预览，不再把这些信息挤到画布里。</div>
            </div>
          </div>

          <div className="workflow-inspector-block">
            <div className="kpi-label">当前节点</div>
            {selectedNode ? (
              <>
                <div className="workflow-selected-title">{selectedNode.label}</div>
                <pre className="workflow-code-block mono" style={{ marginBottom: 12 }}>
                  {[
                    `Operator: ${selectedNode.operatorId}`,
                    `Runtime: ${selectedNode.runtime || 'N/A'}`,
                    `Health: ${getHealthStateLabel(selectedNode?.health?.state)}`,
                    `Modality: ${selectedNode.modality || 'N/A'}`,
                    `Category: ${selectedNode.category || 'N/A'}`,
                  ].join('\n')}
                </pre>
                <div className="field">
                  <label htmlFor="node_alias">节点别名</label>
                  <input
                    id="node_alias"
                    className="input"
                    value={selectedNode.config?.alias || ''}
                    onChange={(event) => updateSelectedNodeConfig({ alias: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="node_notes">节点备注</label>
                  <textarea
                    id="node_notes"
                    className="textarea"
                    value={selectedNode.config?.notes || ''}
                    onChange={(event) => updateSelectedNodeConfig({ notes: event.target.value })}
                    rows={3}
                  />
                </div>
                <div className="field">
                  <label htmlFor="node_params">节点参数 JSON</label>
                  <textarea
                    id="node_params"
                    className="textarea mono"
                    value={selectedNode.config?.paramsText || ''}
                    onChange={(event) => updateSelectedNodeConfig({ paramsText: event.target.value })}
                    rows={6}
                    placeholder='{"batch_size": 32}'
                  />
                  {paramsValidationMessage ? (
                    <div className={`workflow-validation-note ${paramsValidationMessage.includes('不合法') ? 'is-error' : 'is-success'}`}>
                      {paramsValidationMessage}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="empty-state small">先在画布中选中一个节点，再编辑参数和备注。</div>
            )}
          </div>

          <div className="workflow-resource-grid">
            <div className="field compact-field">
              <label htmlFor="workflow_cpu">CPU</label>
              <input
                id="workflow_cpu"
                className="input"
                type="number"
                min="1"
                value={resources.cpu}
                onChange={(event) => setResources((current) => ({ ...current, cpu: Number(event.target.value || 1) }))}
              />
            </div>
            <div className="field compact-field">
              <label htmlFor="workflow_gpu">GPU</label>
              <input
                id="workflow_gpu"
                className="input"
                type="number"
                min="0"
                value={resources.gpu}
                onChange={(event) => setResources((current) => ({ ...current, gpu: Number(event.target.value || 0) }))}
              />
            </div>
            <div className="field compact-field">
              <label htmlFor="workflow_memory">内存 GB</label>
              <input
                id="workflow_memory"
                className="input"
                type="number"
                min="1"
                value={resources.memory_gb}
                onChange={(event) => setResources((current) => ({ ...current, memory_gb: Number(event.target.value || 1) }))}
              />
            </div>
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">拓扑顺序</div>
            <div className="workflow-node-order">
              {orderedNodes.map((node, index) => (
                <div key={node.id} className={`workflow-node-order-item ${selectedNodeIndex === index ? 'is-active' : ''}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{node.config?.alias || node.label}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">连线清单</div>
            {edges.length ? (
              <div className="workflow-edge-list">
                {edges.map((edge) => (
                  <div key={edge.id} className="workflow-edge-row">
                    <span>{canvasNodes.find((node) => node.id === edge.source)?.label || edge.source}</span>
                    <span className="workflow-edge-arrow">→</span>
                    <span>{canvasNodes.find((node) => node.id === edge.target)?.label || edge.target}</span>
                    <button type="button" className="button button-mini button-ghost" onClick={() => removeEdge(edge.id)}>
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state small">还没有建立节点依赖关系。</div>
            )}
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">Execution Readiness</div>
            <div className="workflow-code-block mono">
              {jobSpec?.summary || 'Build the graph to inspect workflow readiness.'}
            </div>
            {jobSpec?.blocked_nodes?.length ? (
              <div className="workflow-edge-list">
                {jobSpec.blocked_nodes.map((item) => (
                  <div key={item.id} className="workflow-edge-row">
                    <span>{item.label}</span>
                    <span className="workflow-edge-arrow">{getHealthStateLabel(item.health_state)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">Ray Job Entrypoint</div>
            <div className="workflow-code-block mono">
              {building ? '生成中...' : (jobSpec?.entrypoint || '画布上至少放置一个节点后自动生成 Ray Job 预览。')}
            </div>
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">Runtime Env</div>
            <pre className="workflow-code-block mono">
              {jobSpec ? JSON.stringify(jobSpec.runtime_env, null, 2) : '{}'}
            </pre>
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">工作流图定义</div>
            <pre className="workflow-code-block mono">
              {jobSpec?.graph ? JSON.stringify(jobSpec.graph, null, 2) : '{}'}
            </pre>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-small button-primary" onClick={copyEntrypoint} disabled={!jobSpec?.entrypoint}>
              复制命令
            </button>
            <button type="button" className="button button-small button-secondary" onClick={copyGraphSpec} disabled={!jobSpec?.graph}>
              复制图定义
            </button>
          </div>
        </aside>
      </div>
    </section>
  )
}
