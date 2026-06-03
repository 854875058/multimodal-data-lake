import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dorisGet, dorisPost, dorisPut, dorisDelete } from './doris'

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
})

function mockJsonResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  })
}

describe('dorisGet', () => {
  it('builds URL with params', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ ok: true }))
    await dorisGet('/clusters', { limit: 10 })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/api/doris/clusters')
    expect(url).toContain('limit=10')
  })

  it('filters null/undefined/empty params', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ ok: true }))
    await dorisGet('/test', { a: 'val', b: null, c: undefined, d: '' })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('a=val')
    expect(url).not.toContain('b=')
    expect(url).not.toContain('c=')
    expect(url).not.toContain('d=')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ error: 'not found' }, 404))
    await expect(dorisGet('/missing')).rejects.toThrow('请求失败: 404')
  })

  it('sends credentials', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({}))
    await dorisGet('/test')
    expect(mockFetch.mock.calls[0][1]).toEqual({ credentials: 'include' })
  })
})

describe('dorisPost', () => {
  it('sends POST with JSON body', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ ok: true }))
    await dorisPost('/sql/execute', { sql: 'SELECT 1' })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/doris/sql/execute')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(opts.body)).toEqual({ sql: 'SELECT 1' })
  })
})

describe('dorisPut', () => {
  it('sends PUT with JSON body', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ ok: true }))
    await dorisPut('/config', { key: 'value' })
    expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
  })
})

describe('dorisDelete', () => {
  it('sends DELETE with params', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ ok: true }))
    await dorisDelete('/history', { cluster_id: 'c1' })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/doris/history')
    expect(url).toContain('cluster_id=c1')
    expect(opts.method).toBe('DELETE')
  })
})
