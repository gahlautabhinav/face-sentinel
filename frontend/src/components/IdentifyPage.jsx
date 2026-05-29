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
      ? <span className="badge green">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 4.5l2 2 4-4" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          MATCHED
        </span>
      : <span className="badge red">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M2 2l5 5M7 2L2 7" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          NO MATCH
        </span>
    : null

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div className="page-title" style={{ margin: 0 }}>Identify Visitor</div>
        {matchBadge}
      </div>
      <div className="page-sub">Search Rekognition collection for a matching face. Admin testing tool.</div>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Tenant ID</label>
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
            {loading
              ? <><div className="spinner" /><span>Identifying…</span></>
              : <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M1.5 12.5c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Identify Face
                </>
            }
          </button>
        </form>
        <ResultBox result={result} />
      </div>
    </div>
  )
}
