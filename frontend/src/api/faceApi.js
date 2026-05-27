const BASE = '/api/face'

export async function enrollFace({ tenantId, visitorId, imageFile }) {
  const form = new FormData()
  form.append('visitorId', visitorId)
  form.append('image', imageFile)

  const res = await fetch(`${BASE}/enroll`, {
    method: 'POST',
    headers: { 'X-Tenant-Id': tenantId },
    body: form,
  })
  return res.json()
}

export async function identifyFace({ tenantId, imageFile }) {
  const form = new FormData()
  form.append('image', imageFile)

  const res = await fetch(`${BASE}/identify`, {
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
  const res = await fetch(`${BASE}/verify`, {
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
  const res = await fetch(`${BASE}/${visitorId}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Id': tenantId },
  })
  return res.json()
}
