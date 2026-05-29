import { FaceLivenessDetector } from '@aws-amplify/ui-react-liveness'
import '@aws-amplify/ui-react/styles.css'

export default function LivenessChallenge({ sessionId, region, onComplete, onError }) {
  return (
    <div style={{ width: '100%', maxWidth: 640, padding: '0 16px' }}>
      <FaceLivenessDetector
        sessionId={sessionId}
        region={region}
        onAnalysisComplete={onComplete}
        onError={onError}
        disableStartScreen
      />
    </div>
  )
}
