import { useState } from 'react'
import ImagePicker from './ImagePicker.jsx'
import ResultBox from './ResultBox.jsx'
import { enrollFace } from '../api/faceApi.js'

export default function EnrollPage() {
  const [tenantId, setTenantId] = useState('')
  const [visitorId, setVisitorId] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tenantId || !visitorId || !imageFile) return
    setLoading(true)
    setResult(null)
    try {
      const data = await enrollFace({ tenantId, visitorId, imageFile })
      setResult(data)
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1>Enroll Visitor</h1>
      <p className="subtitle">Register a visitor's face into the Rekognition collection.</p>
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
          <ImagePicker onFile={setImageFile} />
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !tenantId || !visitorId || !imageFile}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Enrolling…' : 'Enroll Face'}
          </button>
        </form>
        <ResultBox result={result} />
      </div>
    </div>
  )
}
