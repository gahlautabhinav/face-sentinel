package com.logbook360.facerec.exception;

import com.logbook360.facerec.dto.response.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(NoFaceDetectedException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoFace(NoFaceDetectedException ex) {
        return ResponseEntity.badRequest().body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(MultipleFacesDetectedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMultipleFaces(MultipleFacesDetectedException ex) {
        return ResponseEntity.badRequest().body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(LowQualityImageException.class)
    public ResponseEntity<ApiResponse<Void>> handleLowQuality(LowQualityImageException ex) {
        return ResponseEntity.badRequest().body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(InvalidImageException.class)
    public ResponseEntity<ApiResponse<Void>> handleInvalidImage(InvalidImageException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(DuplicateEnrollmentException.class)
    public ResponseEntity<ApiResponse<Void>> handleDuplicate(DuplicateEnrollmentException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(FaceNotFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotFound(FaceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(ex.getMessage()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Void>> handleFileTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(ApiResponse.error("Image file exceeds maximum allowed size of 10MB"));
    }

    @ExceptionHandler(FaceRecognitionException.class)
    public ResponseEntity<ApiResponse<Void>> handleGeneral(FaceRecognitionException ex) {
        log.error("Face recognition error: {}", ex.getMessage(), ex);
        return ResponseEntity.internalServerError().body(ApiResponse.error("Face recognition operation failed"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception ex) {
        log.error("Unexpected error: {}", ex.getMessage(), ex);
        return ResponseEntity.internalServerError().body(ApiResponse.error("An unexpected error occurred"));
    }
}
