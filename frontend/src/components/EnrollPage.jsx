import { useState } from 'react'

export default function EnrollPage() {
  const [name, setName]     = useState('')
  const [email, setEmail]   = useState('')
  const [mobile, setMobile] = useState('')
  const [link, setLink]     = useState(null)
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
    setTimeout(() => setCopied(false), 2200)
  }

  function handleReset() {
    setName(''); setEmail(''); setMobile(''); setLink(null); setCopied(false)
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div className="page-title" style={{ margin: 0 }}>Enroll Visitor</div>
      </div>
      <div className="page-sub">
        Fill in visitor details and generate a registration link. Send it via WhatsApp, email, or SMS — the visitor completes their photo capture on their own device.
      </div>

      <div className="card">
        {link ? (
          <div style={{ animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
            {/* Success header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: 'rgba(16,185,129,0.10)',
                border: '1px solid rgba(16,185,129,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M4 11l5 5 9-9" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="22" style={{ animation: 'draw-check 0.45s ease-out both' }}/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: '#34d399', marginBottom: 2 }}>
                  Link generated
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>
                  {name.trim()}
                </div>
              </div>
            </div>

            {/* Link field */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontSize: 10.5, fontWeight: 700,
                color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase',
                marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', opacity: 0.5, display: 'inline-block' }} />
                Registration Link
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div style={{
                  flex: 1, background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, padding: '11px 14px',
                  fontSize: 12, color: 'rgba(255,255,255,0.45)',
                  fontFamily: "'JetBrains Mono', monospace",
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  cursor: 'text', userSelect: 'all',
                  display: 'flex', alignItems: 'center',
                }}>
                  {link}
                </div>
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                    background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(6,182,212,0.10)',
                    border: `1px solid ${copied ? 'rgba(16,185,129,0.28)' : 'rgba(6,182,212,0.25)'}`,
                    color: copied ? '#34d399' : 'var(--primary-h)',
                    fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                    transition: 'all 0.18s',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: "'Manrope', sans-serif",
                    minHeight: 46,
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

            {/* Info note */}
            <div style={{
              background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.12)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 22,
              fontSize: 12.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7,
            }}>
              Send to <strong style={{ color: 'rgba(255,255,255,0.58)' }}>{name.trim()}</strong> via WhatsApp, email, or SMS. They'll complete photo registration on their own device.
            </div>

            <button className="btn-primary" onClick={handleReset} style={{ width: '100%' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12 2v4H8M2 12V8h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 7A5 5 0 0 1 11.5 4.2M12 7a5 5 0 0 1-9.5 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              Enroll Another Visitor
            </button>
          </div>
        ) : (
          <form onSubmit={handleGenerate}>
            <div className="field">
              <label>
                Full Name
                <span style={{ color: 'var(--danger)', marginLeft: 1, fontFamily: 'sans-serif', letterSpacing: 0 }}>*</span>
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Doe"
                required
                autoFocus
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
            <div className="field" style={{ marginBottom: 24 }}>
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
                <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Generate Link
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
