import { describe, expect, it } from 'vitest'
import { allNavItems, findCurrentNav, getVisibleNavGroups, navGroups } from './navConfig.jsx'

describe('navConfig', () => {
  it('preserves first-level sidebar group names', () => {
    expect(navGroups.map((group) => group.title)).toEqual([
      '湖总览',
      '湖查询',
      '湖计算',
      '湖存储',
      '湖治理',
      '湖运维',
      '系统配置',
      '管理入口',
    ])
  })

  it('hides admin group for non-admin users', () => {
    const visible = getVisibleNavGroups({ isAdmin: false })
    expect(visible.map((group) => group.title)).not.toContain('管理入口')
    expect(visible.flatMap((group) => group.items).map((item) => item.path)).not.toContain('/settings/users')
  })

  it('shows admin group for admin users', () => {
    const visible = getVisibleNavGroups({ isAdmin: true })
    expect(visible.map((group) => group.title)).toContain('管理入口')
    expect(visible.flatMap((group) => group.items).map((item) => item.path)).toContain('/settings/users')
  })

  it('finds the longest matching route for nested pages', () => {
    const current = findCurrentNav('/lake-query/sql/history')
    expect(current.path).toBe('/lake-query/sql')
    expect(current.label).toBe('SQL 查询')
  })

  it('shows only product-level lake query entries in the sidebar', () => {
    const lakeQueryGroup = navGroups.find((group) => group.key === 'lake-query')
    expect(lakeQueryGroup.items.map((item) => item.path)).toEqual([
      '/lake-query/copilot',
      '/lake-query/sql',
      '/lake-query/retrieval',
      '/lake-query/annotation',
    ])
    expect(lakeQueryGroup.items.map((item) => item.label)).toEqual([
      'AI 数据副驾驶',
      'SQL 查询',
      '统一检索',
      '自动化标注',
    ])
  })

  it('does not expose retrieval strategies as sidebar entries', () => {
    expect(allNavItems.map((item) => item.path)).not.toContain('/lake-query/vector')
    expect(allNavItems.map((item) => item.path)).not.toContain('/lake-query/multimodal')
    expect(allNavItems.map((item) => item.path)).not.toContain('/lake-query/hybrid')
  })

  it('exposes every second-level item through allNavItems', () => {
    const itemCount = navGroups.reduce((sum, group) => sum + group.items.length, 0)
    expect(allNavItems).toHaveLength(itemCount)
  })
})
