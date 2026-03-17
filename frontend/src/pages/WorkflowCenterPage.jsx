import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { getErrorMessage } from '@/api'
import WorkflowStudio from '@/components/WorkflowStudio.jsx'
import { formatNumber } from '@/utils/format'

export default function WorkflowCenterPage() {
  const navigate = useNavigate()
  const [platformSettings, setPlatformSettings] = useState(null)
  const [workbenchSettings, setWorkbenchSettings] = useState(null)
  const [jobs, setJobs] = useState([])
  const [banner, setBanner] = useState({ type: '', message: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setError('')
      try {
        const [platformResponse, workbenchResponse, jobsResponse] = await Promise.all([
          api.getPlatformSettings(),
          api.getWorkbenchSettings(),
          api.getWorkbenchJobs(20)
        ])

        setPlatformSettings(platformResponse?.data || null)
        setWorkbenchSettings(workbenchResponse?.data || null)
        setJobs(Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : [])
      } catch (requestError) {
        setError(getErrorMessage(requestError, '加载编排中心失败。'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const activeJobs = jobs.filter((job) => ['pending', 'running', 'cancelling'].includes(job.status)).length
  const sourceHint = workbenchSettings?.source_type === 'sftp'
    ? (workbenchSettings?.sftp_path || '/')
    : (workbenchSettings?.prefix || '/')

  if (loading) {
    return <div className="loading-state">编排中心加载中...</div>
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">编排中心</h1>
          <p className="page-subtitle">把 Daft ETL 工作流、Ray Job 资源约束和执行模板独立出来，形成真正的平台编排入口。</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-secondary" onClick={() => navigate('/workbench')}>
            返回 AI 工作台
          </button>
        </div>
      </div>

      {banner.message ? <div className={`${banner.type}-banner`}>{banner.message}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="workbench-strategy-grid">
        <section className="glass-card workbench-platform-card">
          <div className="card-header">
            <div>
              <h2>编排依赖矩阵</h2>
              <p>工作流只是平台控制面的一部分，编排中心强调依赖关系、资源约束和模板化执行。</p>
            </div>
            <span className="badge">Workflow</span>
          </div>

          <div className="platform-service-grid compact-grid">
            <div className="platform-service-card compact-card">
              <div className="platform-service-title">Ray Dashboard</div>
              <div className="platform-service-meta mono">{platformSettings?.ray_dashboard_url || '--'}</div>
              <div className="platform-service-note">批量任务编排与执行目标</div>
            </div>
            <div className="platform-service-card compact-card">
              <div className="platform-service-title">SeaweedFS / Lance</div>
              <div className="platform-service-meta mono">{platformSettings?.seaweedfs_s3_url || '--'}</div>
              <div className="platform-service-note">工作流输入输出的数据承载层</div>
            </div>
            <div className="platform-service-card compact-card">
              <div className="platform-service-title">当前来源</div>
              <div className="platform-service-meta mono">{sourceHint}</div>
              <div className="platform-service-note">使用工作台最近一次保存的来源范围</div>
            </div>
            <div className="platform-service-card compact-card">
              <div className="platform-service-title">活动任务</div>
              <div className="platform-service-meta">{formatNumber(activeJobs)}</div>
              <div className="platform-service-note">若过多，建议先去任务治理中心查看负载</div>
            </div>
          </div>
        </section>

        <section className="glass-card workbench-playbook-card">
          <div className="card-header">
            <div>
              <h2>使用建议</h2>
              <p>让编排中心更像平台，而不是单次任务配置器。</p>
            </div>
          </div>

          <div className="platform-roadmap-list">
            <div className="platform-roadmap-item">
              <div className="platform-roadmap-title">先定模板，再调资源</div>
              <div className="platform-roadmap-copy">优先从预设工作流开始，减少每次重新手拼节点导致的平台运行不稳定。</div>
            </div>
            <div className="platform-roadmap-item">
              <div className="platform-roadmap-title">任务治理和编排分离</div>
              <div className="platform-roadmap-copy">编排中心只负责定义任务和资源，不负责承载大批量日志与运行明细。</div>
            </div>
            <div className="platform-roadmap-item">
              <div className="platform-roadmap-title">配置回到工作台复用</div>
              <div className="platform-roadmap-copy">来源配置仍在 AI 工作台维护，编排中心读取最近一次保存的来源范围作为默认输入。</div>
            </div>
          </div>
        </section>
      </div>

      <WorkflowStudio
        sourceHint={sourceHint}
        onBanner={(type, message) => setBanner({ type, message })}
      />
    </div>
  )
}
