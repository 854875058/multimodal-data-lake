import { useEffect, useMemo, useState } from 'react'
import api, { getErrorMessage } from '@/api'

const defaultResources = {
  cpu: 4,
  gpu: 0,
  memory_gb: 16
}

export default function WorkflowStudio({ sourceHint = '', onBanner }) {
  const [library, setLibrary] = useState([])
  const [presets, setPresets] = useState([])
  const [workflowName, setWorkflowName] = useState('multimodal_workflow')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [nodes, setNodes] = useState([])
  const [resources, setResources] = useState(defaultResources)
  const [jobSpec, setJobSpec] = useState(null)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')

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
          setSelectedPresetId(firstPreset.id)
          setWorkflowName(firstPreset.id)
          setNodes(Array.isArray(firstPreset.nodes) ? firstPreset.nodes : [])
          setResources(firstPreset.resources || defaultResources)
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError, '加载工作流预设失败。'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  useEffect(() => {
    if (!nodes.length) {
      setJobSpec(null)
      return
    }

    const build = async () => {
      setBuilding(true)
      try {
        const response = await api.buildWorkflowJob({
          name: workflowName || 'multimodal_workflow',
          nodes,
          source_hint: sourceHint,
          ...resources
        })
        setJobSpec(response?.data || null)
      } catch (requestError) {
        setError(getErrorMessage(requestError, '生成工作流任务预览失败。'))
      } finally {
        setBuilding(false)
      }
    }

    build()
  }, [nodes, resources, sourceHint, workflowName])

  const nodeMap = useMemo(() => {
    const map = new Map()
    library.forEach((item) => {
      map.set(item.id, item)
    })
    return map
  }, [library])

  const applyPreset = (presetId) => {
    const preset = presets.find((item) => item.id === presetId)
    if (!preset) {
      return
    }
    setSelectedPresetId(presetId)
    setWorkflowName(preset.id)
    setNodes(Array.isArray(preset.nodes) ? preset.nodes : [])
    setResources(preset.resources || defaultResources)
    setError('')
    if (typeof onBanner === 'function') {
      onBanner('success', `已应用工作流预设：${preset.name}`)
    }
  }

  const addNode = (nodeId) => {
    setNodes((current) => [...current, nodeId])
  }

  const removeNode = (index) => {
    setNodes((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const moveNode = (index, delta) => {
    setNodes((current) => {
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current
      }
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
  }

  const clearWorkflow = () => {
    setNodes([])
    setSelectedPresetId('')
    setJobSpec(null)
  }

  const copyEntrypoint = async () => {
    const entrypoint = String(jobSpec?.entrypoint || '').trim()
    if (!entrypoint) {
      return
    }
    try {
      await navigator.clipboard.writeText(entrypoint)
      if (typeof onBanner === 'function') {
        onBanner('success', '工作流命令已复制到剪贴板。')
      }
    } catch (copyError) {
      setError(getErrorMessage(copyError, '复制工作流命令失败。'))
    }
  }

  if (loading) {
    return <div className="loading-state compact">工作流模板加载中...</div>
  }

  return (
    <section className="glass-card workflow-studio-card">
      <div className="card-header">
        <div>
          <h2>Daft ETL 工作流</h2>
          <p>参考文档中的 Ray + Daft 编排方向，在当前工作台中提供可视化节点组合与 Ray Job 预览。</p>
        </div>
        <span className="badge">{nodes.length ? `${nodes.length} 个节点` : '待编排'}</span>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="workflow-studio-layout">
        <div className="workflow-library-column">
          <div className="field">
            <label htmlFor="workflow_preset">官方预设</label>
            <select
              id="workflow_preset"
              className="select"
              value={selectedPresetId}
              onChange={(event) => applyPreset(event.target.value)}
            >
              <option value="">选择预设</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          <div className="workflow-library-grid">
            {library.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`workflow-library-item kind-${item.kind || 'transform'}`}
                onClick={() => addNode(item.id)}
              >
                <span className="workflow-library-name">{item.label}</span>
                <span className="workflow-library-copy">{item.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="workflow-canvas-column">
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
            <div className="toolbar-group">
              <button type="button" className="button button-small button-secondary" onClick={clearWorkflow} disabled={!nodes.length}>
                清空流程
              </button>
            </div>
          </div>

          {nodes.length ? (
            <div className="workflow-canvas">
              {nodes.map((nodeId, index) => {
                const node = nodeMap.get(nodeId) || { label: nodeId, description: '自定义节点', kind: 'transform' }
                return (
                  <div className="workflow-canvas-node-wrap" key={`${nodeId}-${index}`}>
                    <div className={`workflow-canvas-node kind-${node.kind || 'transform'}`}>
                      <div className="workflow-canvas-node-head">
                        <span className="workflow-canvas-node-index">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <div className="workflow-canvas-node-title">{node.label}</div>
                          <div className="workflow-canvas-node-copy">{node.description}</div>
                        </div>
                      </div>
                      <div className="table-actions">
                        <button type="button" className="button button-small button-ghost" onClick={() => moveNode(index, -1)} disabled={index === 0}>
                          上移
                        </button>
                        <button type="button" className="button button-small button-ghost" onClick={() => moveNode(index, 1)} disabled={index === nodes.length - 1}>
                          下移
                        </button>
                        <button type="button" className="button button-small button-danger" onClick={() => removeNode(index)}>
                          删除
                        </button>
                      </div>
                    </div>
                    {index < nodes.length - 1 ? <div className="workflow-connector" /> : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty-state small">从左侧节点库或预设模板中添加节点，开始编排 Daft ETL 工作流。</div>
          )}
        </div>

        <div className="workflow-summary-column">
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
            <div className="kpi-label">Job Entrypoint</div>
            <div className="workflow-code-block mono">
              {building ? '生成中...' : (jobSpec?.entrypoint || '添加节点后自动生成 Ray Job 命令预览。')}
            </div>
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">Runtime Env</div>
            <pre className="workflow-code-block mono">
              {jobSpec ? JSON.stringify(jobSpec.runtime_env, null, 2) : '{}'}
            </pre>
          </div>

          <div className="workflow-summary-panel">
            <div className="kpi-label">执行摘要</div>
            <div className="kpi-sub">{jobSpec?.summary || '待生成工作流摘要。'}</div>
          </div>

          <div className="toolbar-group">
            <button type="button" className="button button-small button-primary" onClick={copyEntrypoint} disabled={!jobSpec?.entrypoint}>
              复制命令
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
