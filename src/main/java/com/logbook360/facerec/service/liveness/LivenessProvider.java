package com.logbook360.facerec.service.liveness;

public interface LivenessProvider {
    void checkLiveness(byte[] imageBytes);
}
