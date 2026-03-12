import { useEffect, useRef } from 'react'
import { echarts } from '@/lib/echarts'

export default function ChartPanel({ option, height = 320, loading = false, empty = false, emptyText = '暂无数据' }) {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || loading || empty || !option) {
      return undefined
    }

    const instance = echarts.getInstanceByDom(chartRef.current) || echarts.init(chartRef.current)
    instance.setOption(option, true)

    const handleResize = () => {
      instance.resize()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      instance.dispose()
    }
  }, [option, loading, empty])

  if (loading) {
    return <div className="loading-state" style={{ minHeight: `${height}px` }}>图表加载中...</div>
  }

  if (empty) {
    return <div className="empty-state" style={{ minHeight: `${height}px` }}>{emptyText}</div>
  }

  return <div ref={chartRef} style={{ width: '100%', height: `${height}px` }} />
}
