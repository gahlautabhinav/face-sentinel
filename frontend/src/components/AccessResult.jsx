export default function AccessResult({ result, onReset }) {
  const granted = result?.data?.verified === true

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: granted
        ? 'linear-gradient(160deg, #071a10 0%, #0a2418 100%)'
        : 'linear-gradient(160deg, #1a0707 0%, #200d0d 100%)',
      animation: 'scaleIn 0.25s ease-out',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', width: 400, height: 400,
        borderRadius: '50%',
        background: granted
          ? 'radial-gradient(circle, rgba(22,163,74,0.15) 0%, transparent 70%)'
          : 'radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Icon */}
      <div style={{ position: 'relative', marginBottom: 32 }}>
        <div style={{
          position: 'absolute', inset: -16,
          borderRadius: '50%',
          border: `2px solid ${granted ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.3)'}`,
          animation: 'pulse-ring 2s ease-out infinite',
        }} />
        <svg
          width="96" height="96" viewBox="0 0 96 96" fill="none"
          style={{ filter: `drop-shadow(0 0 16px ${granted ? '#16a34a' : '#dc2626'})` }}
        >
          <circle cx="48" cy="48" r="44" stroke={granted ? '#16a34a' : '#dc2626'} strokeWidth="3"/>
          {granted
            ? <path d="M30 48l12 12 24-24" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            : <path d="M34 34l28 28M62 34L34 62" stroke="#dc2626" strokeWidth="4" strokeLinecap="round"/>
          }
        </svg>
      </div>

      {/* Title */}
      <div style={{
        fontSize: 36, fontWeight: 800, letterSpacing: -0.5,
        color: granted ? '#4ade80' : '#f87171',
        marginBottom: 8,
      }}>
        {granted ? 'Access Granted' : 'Access Denied'}
      </div>

      {/* Visitor info */}
      {granted && result.data.visitorName && (
        <div style={{ fontSize: 20, color: '#e8edf5', fontWeight: 500, marginBottom: 4 }}>
          {result.data.visitorName}
        </div>
      )}
      {granted && result.data.similarity && (
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.4)',
          fontVariantNumeric: 'tabular-nums', letterSpacing: 0.5,
        }}>
          Match confidence: {result.data.similarity.toFixed(1)}%
        </div>
      )}
      {!granted && (
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
          Face not recognised in this tenant
        </div>
      )}

      {/* Reset */}
      <button
        onClick={onReset}
        style={{
          marginTop: 48,
          padding: '12px 36px',
          fontSize: 14, fontWeight: 600,
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.color = '#fff'; }}
        onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.color = 'rgba(255,255,255,0.6)'; }}
      >
        Scan Next Visitor
      </button>
    </div>
  )
}
