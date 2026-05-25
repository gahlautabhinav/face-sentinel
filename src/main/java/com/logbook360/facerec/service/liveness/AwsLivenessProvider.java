package com.logbook360.facerec.service.liveness;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "face-recognition.liveness.enabled", havingValue = "true")
public class AwsLivenessProvider implements LivenessProvider {

    @Override
    public void checkLiveness(byte[] imageBytes) {
        // Phase 2: implement AWS CreateFaceLivenessSession + GetFaceLivenessSessionResults
        throw new UnsupportedOperationException(
            "AWS Face Liveness not yet implemented. Set face-recognition.liveness.enabled=false.");
    }
}
