const REFRESH_BUFFER_MS = 60_000

const cache = {}

const credentials = {
  ADMIN: {
    clientId: import.meta.env.VITE_ADMIN_CLIENT_ID,
    clientSecret: import.meta.env.VITE_ADMIN_CLIENT_SECRET,
  },
  KIOSK: {
    clientId: import.meta.env.VITE_KIOSK_CLIENT_ID,
    clientSecret: import.meta.env.VITE_KIOSK_CLIENT_SECRET,
  },
}

export async function getToken(role) {
  const cached = cache[role]
  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return cached.token
  }
  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials[role]),
  })
  if (!res.ok) throw new Error(`Auth failed for ${role}: HTTP ${res.status}`)
  const data = await res.json()
  cache[role] = { token: data.token, expiresAt: Date.now() + data.expiresIn * 1000 }
  return data.token
}

export function clearToken(role) {
  delete cache[role]
}
