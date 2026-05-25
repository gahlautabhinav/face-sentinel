package com.logbook360.facerec.service.liveness;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "face-recognition.liveness.enabled", havingValue = "false", matchIfMissing = true)
@Slf4j
public class NoOpLivenessProvider implements LivenessProvider {

    @Override
    public void checkLiveness(byte[] imageBytes) {
        log.debug("Liveness check skipped (face-recognition.liveness.enabled=false)");
    }
}
