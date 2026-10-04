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

// Parses a response, throwing an Error that carries the HTTP status so callers can tell
// a rejected request (422) from a server or network failure.
async function okJson(res) {
  if (res.ok) return res.json()
  const body = await res.json().catch(() => ({}))
  const err = new Error(body.message || `HTTP ${res.status}`)
  err.status = res.status
  throw err
}

const blobToBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result.split(',')[1])
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

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
  return okJson(res)
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
  return okJson(res)
}

export async function deleteFace({ tenantId, visitorId }) {
  const res = await authFetch('ADMIN', `${BASE}/${visitorId}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': tenantId },
  })
  return res.json()
}

export async function createLivenessSession(role = 'KIOSK') {
  const res = await authFetch(role, '/api/liveness/session', { method: 'POST' })
  return okJson(res)
}

export async function getLivenessResult(sessionId, role = 'KIOSK') {
  const res = await authFetch(role, `/api/liveness/session/${sessionId}/result`)
  return okJson(res)
}

export async function enrollLive({ tenantId, sessionId, visitorName, email, mobile }) {
  const res = await authFetch('ADMIN', '/api/face/enroll-live', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
    body: JSON.stringify({ sessionId, visitorName, email, mobile }),
  })
  return res.json()
}

export async function listEnrollments({ tenantId }) {
  const res = await authFetch('ADMIN', `${BASE}/enrollments`, {
    headers: { 'X-Tenant-Id': tenantId },
  })
  return okJson(res)
}

// frameBlob (optional): a kiosk frame taken before the challenge. The server only uses it
// when it shows the same person who passed liveness. Throws with status 422 when liveness failed.
export async function identifyLive({ tenantId, sessionId, frameBlob }) {
  const frameImage = frameBlob ? await blobToBase64(frameBlob) : undefined
  const res = await authFetch('KIOSK', '/api/liveness/identify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
    body: JSON.stringify({ sessionId, frameImage }),
  })
  return okJson(res)
}
