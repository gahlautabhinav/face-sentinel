package com.logbook360.facerec.exception;

public class FaceRecognitionException extends RuntimeException {
    public FaceRecognitionException(String message) { super(message); }
    public FaceRecognitionException(String message, Throwable cause) { super(message, cause); }
}
