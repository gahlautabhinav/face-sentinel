import { useState } from 'react'
import ImagePicker from './ImagePicker.jsx'
import ResultBox from './ResultBox.jsx'
import { identifyFace } from '../api/faceApi.js'

export default function IdentifyPage() {
  const [tenantId, setTenantId] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tenantId || !imageFile) return
    setLoading(true)
    setResult(null)
    try {
      const data = await identifyFace({ tenantId, imageFile })
      setResult(data)
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const matched = result?.data?.matched
  const matchBadge = result?.data
    ? matched
      ? <span className="badge green">✓ MATCHED</span>
      : <span className="badge red">✗ NO MATCH</span>
    : null

  return (
    <div className="page">
      <h1>Identify Visitor {matchBadge}</h1>
      <p className="subtitle">Search Rekognition for a matching face. Simulates kiosk flow.</p>
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
          <ImagePicker onFile={setImageFile} />
          <button
            type="submit"
            className="btn-success"
            disabled={loading || !tenantId || !imageFile}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Identifying…' : 'Identify Face'}
          </button>
        </form>
        <ResultBox result={result} />
      </div>
    </div>
  )
}
