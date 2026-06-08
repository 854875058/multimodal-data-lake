import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import PageScaffold, { MetricStrip } from './PageScaffold'

describe('PageScaffold', () => {
  it('renders title, subtitle, actions, metrics, and children', () => {
    render(
      <PageScaffold
        title="湖查询"
        subtitle="统一 SQL、向量与多模态检索能力"
        actions={<button type="button">新建查询</button>}
        metrics={[
          { label: '今日查询', value: '1,284', trend: '+12%' },
          { label: '平均耗时', value: '320ms', status: 'good' },
        ]}
      >
        <div>查询工作区</div>
      </PageScaffold>
    )

    expect(screen.getByText('湖查询')).toBeInTheDocument()
    expect(screen.getByText('统一 SQL、向量与多模态检索能力')).toBeInTheDocument()
    expect(screen.getByText('新建查询')).toBeInTheDocument()
    expect(screen.getByText('今日查询')).toBeInTheDocument()
    expect(screen.getByText('1,284')).toBeInTheDocument()
    expect(screen.getByText('查询工作区')).toBeInTheDocument()
  })

  it('renders MetricStrip without a page shell', () => {
    render(<MetricStrip metrics={[{ label: '运行中', value: 8 }]} />)
    expect(screen.getByText('运行中')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })
})
