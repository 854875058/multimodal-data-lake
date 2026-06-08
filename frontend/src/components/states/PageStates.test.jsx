import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { EmptyState, ErrorState, LoadingState, PermissionState } from './PageStates'

describe('PageStates', () => {
  it('renders loading state', () => {
    render(<LoadingState text="正在加载资产目录" />)
    expect(screen.getByText('正在加载资产目录')).toBeInTheDocument()
  })

  it('renders empty state with action', () => {
    const onAction = vi.fn()
    render(<EmptyState title="暂无数据集" description="上传文件后会在这里生成数据集。" actionText="去上传" onAction={onAction} />)
    fireEvent.click(screen.getByText('去上传'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders error state with retry', () => {
    const onRetry = vi.fn()
    render(<ErrorState title="加载失败" description="服务暂时不可用，请稍后重试。" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('重试'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders permission state', () => {
    render(<PermissionState role="平台用户" />)
    expect(screen.getByText('当前账号无权访问')).toBeInTheDocument()
    expect(screen.getByText(/平台用户/)).toBeInTheDocument()
  })
})
