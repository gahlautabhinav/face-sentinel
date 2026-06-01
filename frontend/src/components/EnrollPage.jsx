import { useState } from 'react'

export default function EnrollPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)

  function handleGenerate(e) {
    e.preventDefault()
    if (!name.trim()) return
    const params = new URLSearchParams({ name: name.trim(), email: email.trim(), mobile: mobile.trim() })
    setLink(`${window.location.origin}/register?${params}`)
    setCopied(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleReset() {
    setName('')
    setEmail('')
    setMobile('')
    setLink(null)
    setCopied(false)
  }

  return (
    <div className="page">
      <div className="page-title">Enroll Visitor</div>
      <div className="page-sub">Enter visitor details to generate a registration link. Send the link to the visitor to complete their photo capture.</div>

      <div className="card">
        {link ? (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'rgba(22,163,74,0.12)',
                border: '2px solid rgba(22,163,74,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M4 11l5 5 9-9" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#4ade80', marginBottom: 2 }}>Link Generated</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>{name.trim()}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Registration Link
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  readOnly
                  value={link}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '10px 12px',
                    fontSize: 12, color: 'rgba(255,255,255,0.55)',
                    fontFamily: 'monospace', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  onClick={e => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '10px 16px',
                    background: copied ? 'rgba(22,163,74,0.15)' : 'rgba(37,99,235,0.15)',
                    border: `1px solid ${copied ? 'rgba(22,163,74,0.3)' : 'rgba(37,99,235,0.3)'}`,
                    color: copied ? '#4ade80' : '#93c5fd',
                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {copied ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 6.5l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M8.5 4.5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v4.5a1 1 0 0 0 1 1H4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div style={{
              background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20,
              fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6,
            }}>
              Send this link to <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{name.trim()}</strong> via WhatsApp, email, or SMS. They'll complete their photo registration on their own device.
            </div>

            <button className="btn-primary" onClick={handleReset} style={{ width: '100%' }}>
              Generate for Another Visitor
            </button>
          </div>
        ) : (
          <form onSubmit={handleGenerate}>
            <div className="field">
              <label>
                Full Name
                <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="field">
              <label>Mobile Number</label>
              <input
                type="tel"
                value={mobile}
                onChange={e => setMobile(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={!name.trim()}
              style={{ width: '100%' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Generate Link
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
