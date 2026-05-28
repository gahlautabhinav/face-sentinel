import { useState } from 'react'
import ResultBox from './ResultBox.jsx'
import LivenessChallenge from './LivenessChallenge.jsx'
import { createLivenessSession, enrollLive } from '../api/faceApi.js'

export default function EnrollPage() {
  const [tenantId, setTenantId] = useState('')
  const [visitorId, setVisitorId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [livenessSessionId, setLivenessSessionId] = useState(null)
  const [showLiveness, setShowLiveness] = useState(false)

  async function handleStartLiveness(e) {
    e.preventDefault()
    if (!tenantId || !visitorId) return
    setLoading(true)
    setResult(null)
    try {
      const res = await createLivenessSession('ADMIN')
      setLivenessSessionId(res.data.sessionId)
      setShowLiveness(true)
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleLivenessComplete() {
    setShowLiveness(false)
    setLoading(true)
    try {
      const data = await enrollLive({ tenantId, visitorId, sessionId: livenessSessionId })
      setResult(data)
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally {
      setLoading(false)
      setLivenessSessionId(null)
    }
  }

  function handleLivenessError(err) {
    setShowLiveness(false)
    setLivenessSessionId(null)
    setResult({ success: false, message: err?.toString() || 'Liveness check failed' })
  }

  if (showLiveness && livenessSessionId) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <LivenessChallenge
          sessionId={livenessSessionId}
          region={import.meta.env.VITE_AWS_REGION || 'ap-south-1'}
          onComplete={handleLivenessComplete}
          onError={handleLivenessError}
        />
        <button
          onClick={() => { setShowLiveness(false); setLivenessSessionId(null) }}
          style={{ marginTop: 16, color: '#fff', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Enroll Visitor</h1>
      <p className="subtitle">Register a visitor's face into the Rekognition collection via liveness check.</p>
      <div className="card">
        <form onSubmit={handleStartLiveness}>
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
            className="btn-primary"
            disabled={loading || !tenantId || !visitorId}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? 'Starting…' : 'Start Liveness Check'}
          </button>
        </form>
        <ResultBox result={result} />
      </div>
    </div>
  )
}
