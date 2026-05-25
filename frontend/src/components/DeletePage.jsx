import { useState } from 'react'
import ResultBox from './ResultBox.jsx'
import { deleteFace } from '../api/faceApi.js'

export default function DeletePage() {
  const [tenantId, setTenantId] = useState('')
  const [visitorId, setVisitorId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tenantId || !visitorId) return
    setLoading(true)
    setResult(null)
    try {
      const data = await deleteFace({ tenantId, visitorId })
      setResult(data)
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1>Delete Face</h1>
      <p className="subtitle">Remove enrolled face from Rekognition, S3, and database.</p>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Tenant ID (UUID)</label>
            <input
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
              required
            />
          </div>
          <div className="field">
            <label>Visitor ID (UUID)</label>
            <input
              value={visitorId}
              onChange={e => setVisitorId(e.target.value)}
              placeholder="660e8400-e29b-41d4-a716-446655440001"
              required
            />
          </div>
          <button
            type="submit"
            className="btn-danger"
            disabled={loading || !tenantId || !visitorId}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Deleting…' : 'Delete Enrolled Face'}
          </button>
        </form>
        <ResultBox result={result} />
      </div>
    </div>
  )
}
