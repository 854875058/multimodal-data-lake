export const DEFAULT_LAKE_QUERY_PATH = '/lake-query/copilot'

export const PRIMARY_LAKE_QUERY_TABS = ['copilot', 'sql', 'retrieval', 'annotation']

export const LEGACY_RETRIEVAL_TAB_STRATEGY = {
  vector: 'vector',
  multimodal: 'multimodal',
  hybrid: 'hybrid',
}

export const RETRIEVAL_STRATEGIES = ['auto', 'semantic', 'vector', 'multimodal', 'hybrid']

export function isPrimaryLakeQueryTab(tab) {
  return PRIMARY_LAKE_QUERY_TABS.includes(tab)
}

export function normalizeRetrievalStrategy(strategy) {
  return RETRIEVAL_STRATEGIES.includes(strategy) ? strategy : 'auto'
}

export function getRetrievalPath(strategy = 'auto') {
  const normalized = normalizeRetrievalStrategy(strategy)
  return normalized === 'auto' ? '/lake-query/retrieval' : `/lake-query/retrieval?strategy=${normalized}`
}

export function getLakeQueryRouteState(tab) {
  if (!tab) {
    return { activeTab: 'copilot', retrievalStrategy: 'auto', redirectTo: null }
  }

  if (tab === 'nl2sql') {
    return { activeTab: 'sql', retrievalStrategy: 'auto', redirectTo: '/lake-query/sql' }
  }

  if (LEGACY_RETRIEVAL_TAB_STRATEGY[tab]) {
    const retrievalStrategy = LEGACY_RETRIEVAL_TAB_STRATEGY[tab]
    return {
      activeTab: 'retrieval',
      retrievalStrategy,
      redirectTo: getRetrievalPath(retrievalStrategy),
    }
  }

  if (isPrimaryLakeQueryTab(tab)) {
    return { activeTab: tab, retrievalStrategy: 'auto', redirectTo: null }
  }

  return { activeTab: 'copilot', retrievalStrategy: 'auto', redirectTo: DEFAULT_LAKE_QUERY_PATH }
}
