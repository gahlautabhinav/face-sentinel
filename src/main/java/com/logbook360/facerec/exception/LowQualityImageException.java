package com.logbook360.facerec.exception;

public class LowQualityImageException extends FaceRecognitionException {
    public LowQualityImageException(String message) { super(message); }
}
