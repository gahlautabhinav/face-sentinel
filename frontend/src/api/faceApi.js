import { getToken, clearToken } from './authApi.js'

const BASE = '/api/face'

async function authFetch(role, url, init = {}) {
  const token = await getToken(role)
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    clearToken(role)
    const fresh = await getToken(role)
    return fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${fresh}` },
    })
  }
  return res
}

export async function enrollFace({ tenantId, visitorId, imageFile }) {
  const form = new FormData()
  form.append('visitorId', visitorId)
  form.append('image', imageFile)
  const res = await authFetch('ADMIN', `${BASE}/enroll`, {
    method: 'POST',
    headers: { 'X-Tenant-Id': tenantId },
    body: form,
  })
  return res.json()
}

export async function identifyFace({ tenantId, imageFile }) {
  const form = new FormData()
  form.append('image', imageFile)
  const res = await authFetch('KIOSK', `${BASE}/identify`, {
    method: 'POST',
    headers: { 'X-Tenant-Id': tenantId },
    body: form,
  })
  return res.json()
}

export async function verifyFace({ tenantId, visitorId, imageBlob }) {
  const form = new FormData()
  form.append('visitorId', visitorId)
  form.append('image', imageBlob, 'kiosk.jpg')
  const res = await authFetch('KIOSK', `${BASE}/verify`, {
    method: 'POST',
    headers: { 'X-Tenant-Id': tenantId },
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteFace({ tenantId, visitorId }) {
  const res = await authFetch('ADMIN', `${BASE}/${visitorId}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': tenantId },
  })
  return res.json()
}
