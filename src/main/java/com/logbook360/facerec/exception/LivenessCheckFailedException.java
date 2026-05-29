package com.logbook360.facerec.exception;

public class LivenessCheckFailedException extends RuntimeException {
    public LivenessCheckFailedException(String message) {
        super(message);
    }
}
