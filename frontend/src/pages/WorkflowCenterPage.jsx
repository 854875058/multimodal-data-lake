import { useEffect, useState } from 'react'
import { Spin, Message } from '@arco-design/web-react'
import api, { getErrorMessage } from '@/api'
import WorkflowStudio from '@/components/WorkflowStudio.jsx'

export default function WorkflowCenterPage() {
  const [platformSettings, setPlatformSettings] = useState(null)
  const [workbenchSettings, setWorkbenchSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [p, w] = await Promise.all([
          api.getPlatformSettings(),
          api.getWorkbenchSettings(),
        ])
        setPlatformSettings(p?.data || null)
        setWorkbenchSettings(w?.data || null)
      } catch (e) {
        Message.error(getErrorMessage(e, '加载编排中心失败'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const sourceHint = workbenchSettings?.source_type === 'sftp'
    ? (workbenchSettings?.sftp_path || '/')
    : (workbenchSettings?.prefix || '/')

  if (loading) {
    return <div style={{ padding: 64, textAlign: 'center' }}><Spin size={32} /></div>
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <WorkflowStudio
        sourceHint={sourceHint}
        platformSettings={platformSettings}
        onBanner={(type, message) => {
          if (type === 'error') Message.error(message)
          else if (type === 'success') Message.success(message)
          else Message.info(message)
        }}
      />
    </div>
  )
}
