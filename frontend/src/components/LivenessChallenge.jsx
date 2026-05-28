import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import '@aws-amplify/ui-react/styles.css'

export default function LivenessChallenge({ sessionId, region, onComplete, onError }) {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <FaceLivenessDetector
        sessionId={sessionId}
        region={region}
        onAnalysisComplete={onComplete}
        onError={onError}
      />
    </div>
  )
}
