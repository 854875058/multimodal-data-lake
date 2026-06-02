const DORIS_BASE = '/api/doris'

function buildUrl(path, params = {}) {
  const url = new URL(DORIS_BASE + path, window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  return url.toString()
}

export async function dorisGet(path, params = {}) {
  const res = await fetch(buildUrl(path, params), { credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

export async function dorisPost(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

export async function dorisPut(path, body = {}) {
  const res = await fetch(DORIS_BASE + path, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}

export async function dorisDelete(path, params = {}) {
  const res = await fetch(buildUrl(path, params), { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`请求失败: ${res.status}`)
  return res.json()
}
