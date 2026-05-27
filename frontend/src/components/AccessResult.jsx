export default function AccessResult({ result, onReset }) {
  const granted = result?.data?.verified === true

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: granted ? '#14532d' : '#7f1d1d',
      color: '#fff', zIndex: 100,
    }}>
      <div style={{ fontSize: 96 }}>{granted ? '✓' : '✗'}</div>
      <div style={{ fontSize: 48, fontWeight: 700, marginTop: 16 }}>
        {granted ? 'Access Granted' : 'Access Denied'}
      </div>
      {granted && result.data.visitorName && (
        <div style={{ fontSize: 28, marginTop: 12, opacity: 0.85 }}>
          {result.data.visitorName}
        </div>
      )}
      {granted && result.data.similarity && (
        <div style={{ fontSize: 18, marginTop: 8, opacity: 0.6 }}>
          Match: {result.data.similarity.toFixed(1)}%
        </div>
      )}
      <button
        onClick={onReset}
        style={{
          marginTop: 40, padding: '12px 32px', fontSize: 18,
          background: 'rgba(255,255,255,0.2)', color: '#fff',
          border: '2px solid rgba(255,255,255,0.5)', borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Reset
      </button>
    </div>
  )
}
