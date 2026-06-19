export default function AccessResult({ result, onReset }) {
  const granted = result?.data?.verified === true
  const notEnrolled = result?.data?.notEnrolled === true
  const color = granted ? '#34d399' : notEnrolled ? '#fbbf24' : '#fb7185'
  const colorDim = granted ? 'rgba(52,211,153,' : notEnrolled ? 'rgba(251,191,36,' : 'rgba(251,113,133,'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: granted
        ? 'radial-gradient(ellipse 130% 90% at 50% 55%, #031a0e 0%, #020917 100%)'
        : notEnrolled
          ? 'radial-gradient(ellipse 130% 90% at 50% 55%, #1a1200 0%, #020917 100%)'
          : 'radial-gradient(ellipse 130% 90% at 50% 55%, #1a0309 0%, #020917 100%)',
      animation: 'scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      overflow: 'hidden',
    }}>

      {/* Dot grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />

      {/* Large ambient glow */}
      <div style={{
        position: 'absolute',
        width: 640, height: 640,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${colorDim}0.10) 0%, transparent 65%)`,
        pointerEvents: 'none',
        animation: 'glow-pulse 3.5s ease-in-out infinite',
      }} />

      {/* Animated outer rings */}
      <div style={{
        position: 'absolute', width: 340, height: 340, borderRadius: '50%',
        border: `1px solid ${colorDim}0.12)`,
        animation: 'pulse-ring 3.2s ease-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 240, height: 240, borderRadius: '50%',
        border: `1px solid ${colorDim}0.20)`,
        animation: 'pulse-ring 3.2s ease-out 0.6s infinite',
        pointerEvents: 'none',
      }} />

      {/* Icon — face scan reticle with check/cross */}
      <div style={{ position: 'relative', marginBottom: 38, zIndex: 1 }}>
        <svg width="108" height="108" viewBox="0 0 108 108" fill="none"
          style={{ filter: `drop-shadow(0 0 28px ${color}) drop-shadow(0 0 10px ${colorDim}0.45))` }}
        >
          {/* Corner bracket reticle */}
          <path d="M18 40V24a6 6 0 0 1 6-6h16" stroke={color} strokeWidth="3" strokeLinecap="round"/>
          <path d="M68 18h16a6 6 0 0 1 6 6v16" stroke={color} strokeWidth="3" strokeLinecap="round"/>
          <path d="M90 68v16a6 6 0 0 1-6 6H68" stroke={color} strokeWidth="3" strokeLinecap="round"/>
          <path d="M40 90H24a6 6 0 0 1-6-6V68" stroke={color} strokeWidth="3" strokeLinecap="round"/>
          {/* Central symbol */}
          {granted ? (
            <path
              d="M34 54l14 14 26-28"
              stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="60" strokeDashoffset="0"
              style={{ animation: 'draw-check 0.5s ease-out 0.2s both' }}
            />
          ) : (
            <>
              <path d="M38 38l32 32" stroke={color} strokeWidth="4.5" strokeLinecap="round"/>
              <path d="M70 38L38 70" stroke={color} strokeWidth="4.5" strokeLinecap="round"/>
            </>
          )}
        </svg>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Syne', sans-serif",
        fontSize: 44, fontWeight: 800, letterSpacing: -1.5,
        color,
        marginBottom: 12, zIndex: 1,
        textAlign: 'center',
        textShadow: `0 0 48px ${colorDim}0.35)`,
        lineHeight: 1,
      }}>
        {granted ? 'Access Granted' : notEnrolled ? 'Not Enrolled' : 'Access Denied'}
      </div>

      {/* Visitor info */}
      {granted && result.data.visitorName && (
        <div style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 22, fontWeight: 700,
          color: '#e2e8f0', marginBottom: 6, zIndex: 1, textAlign: 'center',
        }}>
          {result.data.visitorName}
        </div>
      )}
      {granted && result.data.similarity && (
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,0.3)',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: 1.5, zIndex: 1,
          textTransform: 'uppercase',
        }}>
          Match · {result.data.similarity.toFixed(1)}%
        </div>
      )}
      {!granted && (
        <div style={{
          fontSize: 14, color: 'rgba(255,255,255,0.28)',
          marginTop: 4, zIndex: 1,
          fontFamily: "'Manrope', sans-serif",
          textAlign: 'center', maxWidth: 280,
        }}>
          {notEnrolled ? 'Please register at the reception desk' : 'Face not recognised in this tenant'}
        </div>
      )}

      {/* Reset */}
      <button
        onClick={onReset}
        style={{
          marginTop: 52, zIndex: 1,
          padding: '12px 44px', fontSize: 13, fontWeight: 700,
          fontFamily: "'Manrope', sans-serif",
          background: 'rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.45)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 10,
          cursor: 'pointer', transition: 'all 0.2s',
          letterSpacing: 0.3,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
          e.currentTarget.style.color = '#e2e8f0'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
        }}
      >
        Scan Next Visitor
      </button>
    </div>
  )
}
