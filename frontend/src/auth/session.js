const AUTH_STORAGE_KEY = 'mdl_console_auth'
const AUTH_CHANGE_EVENT = 'mdl-console-auth-change'

function createEmptySession() {
  return {
    accessToken: '',
    tokenType: 'bearer',
    user: null
  }
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    return null
  }

  const username = String(user.username || '').trim()
  if (!username) {
    return null
  }

  const idValue = Number(user.id)

  return {
    id: Number.isFinite(idValue) ? idValue : null,
    username,
    email: String(user.email || '').trim(),
    full_name: String(user.full_name || '').trim(),
    is_admin: Boolean(user.is_admin)
  }
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptySession()
  }

  const accessToken = String(raw.accessToken || raw.access_token || '').trim()
  const tokenType = String(raw.tokenType || raw.token_type || 'bearer').trim() || 'bearer'
  const user = normalizeUser(raw.user)

  if (!accessToken || !user) {
    return createEmptySession()
  }

  return {
    accessToken,
    tokenType,
    user
  }
}

function notifyAuthChange(session) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: session }))
}

export function loadAuthSession() {
  if (typeof window === 'undefined') {
    return createEmptySession()
  }

  try {
    const serialized = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!serialized) {
      return createEmptySession()
    }

    return normalizeSession(JSON.parse(serialized))
  } catch {
    return createEmptySession()
  }
}

export function saveAuthSession(payload) {
  const session = normalizeSession(payload)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    notifyAuthChange(session)
  }

  return session
}

export function clearAuthSession() {
  const emptySession = createEmptySession()

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    notifyAuthChange(emptySession)
  }

  return emptySession
}

export function getAccessToken() {
  return loadAuthSession().accessToken
}

export function subscribeAuthSession(callback) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleCustomEvent = (event) => {
    callback(normalizeSession(event.detail))
  }

  const handleStorageEvent = (event) => {
    if (event.key === AUTH_STORAGE_KEY) {
      callback(loadAuthSession())
    }
  }

  window.addEventListener(AUTH_CHANGE_EVENT, handleCustomEvent)
  window.addEventListener('storage', handleStorageEvent)

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, handleCustomEvent)
    window.removeEventListener('storage', handleStorageEvent)
  }
}
