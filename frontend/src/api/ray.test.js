import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rayGet, rayPost, rayDelete } from './ray'

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

describe('rayGet', () => {
  it('builds URL with params', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ jobs: [] }))
    await rayGet('/jobs', { limit: 5 })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/api/ray/jobs')
    expect(url).toContain('limit=5')
  })

  it('filters null/undefined/empty params', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({}))
    await rayGet('/test', { a: '1', b: null, c: '' })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('a=1')
    expect(url).not.toContain('b=')
    expect(url).not.toContain('c=')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ error: 'fail' }, 500))
    await expect(rayGet('/fail')).rejects.toThrow('请求失败: 500')
  })
})

describe('rayPost', () => {
  it('sends POST with JSON body', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ ok: true }))
    await rayPost('/jobs', { name: 'test' })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/ray/jobs')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ name: 'test' })
  })
})

describe('rayDelete', () => {
  it('sends DELETE with params', async () => {
    mockFetch.mockReturnValue(mockJsonResponse({ ok: true }))
    await rayDelete('/jobs/123')
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/api/ray/jobs/123')
    expect(opts.method).toBe('DELETE')
  })
})
