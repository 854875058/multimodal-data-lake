import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LAKE_QUERY_PATH,
  getLakeQueryRouteState,
  getRetrievalPath,
  isPrimaryLakeQueryTab,
} from './queryRouting'

describe('queryRouting', () => {
  it('uses AI copilot as the lake query default', () => {
    expect(DEFAULT_LAKE_QUERY_PATH).toBe('/lake-query/copilot')
    expect(getLakeQueryRouteState()).toEqual({ activeTab: 'copilot', retrievalStrategy: 'auto', redirectTo: null })
  })

  it('keeps only product-level lake query tabs as primary tabs', () => {
    expect(isPrimaryLakeQueryTab('copilot')).toBe(true)
    expect(isPrimaryLakeQueryTab('sql')).toBe(true)
    expect(isPrimaryLakeQueryTab('retrieval')).toBe(true)
    expect(isPrimaryLakeQueryTab('annotation')).toBe(true)
    expect(isPrimaryLakeQueryTab('vector')).toBe(false)
    expect(isPrimaryLakeQueryTab('multimodal')).toBe(false)
    expect(isPrimaryLakeQueryTab('hybrid')).toBe(false)
  })

  it('maps legacy retrieval routes to the unified retrieval workspace', () => {
    expect(getLakeQueryRouteState('vector')).toEqual({
      activeTab: 'retrieval',
      retrievalStrategy: 'vector',
      redirectTo: '/lake-query/retrieval?strategy=vector',
    })
    expect(getLakeQueryRouteState('multimodal')).toEqual({
      activeTab: 'retrieval',
      retrievalStrategy: 'multimodal',
      redirectTo: '/lake-query/retrieval?strategy=multimodal',
    })
    expect(getLakeQueryRouteState('hybrid')).toEqual({
      activeTab: 'retrieval',
      retrievalStrategy: 'hybrid',
      redirectTo: '/lake-query/retrieval?strategy=hybrid',
    })
  })

  it('maps nl2sql to SQL and unknown tabs to AI copilot', () => {
    expect(getLakeQueryRouteState('nl2sql')).toEqual({
      activeTab: 'sql',
      retrievalStrategy: 'auto',
      redirectTo: '/lake-query/sql',
    })
    expect(getLakeQueryRouteState('unknown')).toEqual({
      activeTab: 'copilot',
      retrievalStrategy: 'auto',
      redirectTo: '/lake-query/copilot',
    })
  })

  it('builds unified retrieval strategy paths', () => {
    expect(getRetrievalPath('auto')).toBe('/lake-query/retrieval')
    expect(getRetrievalPath('vector')).toBe('/lake-query/retrieval?strategy=vector')
    expect(getRetrievalPath('multimodal')).toBe('/lake-query/retrieval?strategy=multimodal')
    expect(getRetrievalPath('hybrid')).toBe('/lake-query/retrieval?strategy=hybrid')
  })
})
