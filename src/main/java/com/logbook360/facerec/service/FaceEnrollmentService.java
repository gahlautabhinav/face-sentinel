package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.RecognitionLog;
import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.exception.*;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.services.rekognition.model.*;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class FaceEnrollmentService {

    private final RekognitionService rekognitionService;
    private final S3Service s3Service;
    private final VisitorFaceRepository visitorFaceRepository;
    private final RecognitionLogRepository recognitionLogRepository;
    private final String collectionPrefix;
    private final String s3Bucket;

    public FaceEnrollmentService(
            RekognitionService rekognitionService,
            S3Service s3Service,
            VisitorFaceRepository visitorFaceRepository,
            RecognitionLogRepository recognitionLogRepository,
            @Value("${aws.rekognition.collection-prefix}") String collectionPrefix,
            @Value("${aws.s3.bucket-name}") String s3Bucket) {
        this.rekognitionService = rekognitionService;
        this.s3Service = s3Service;
        this.visitorFaceRepository = visitorFaceRepository;
        this.recognitionLogRepository = recognitionLogRepository;
        this.collectionPrefix = collectionPrefix;
        this.s3Bucket = s3Bucket;
    }

    @Transactional
    public FaceEnrollResponse enrollFace(UUID tenantId, UUID visitorId, MultipartFile imageFile) {
        validateImageFile(imageFile);

        if (visitorFaceRepository.existsByVisitorIdAndTenantId(visitorId, tenantId)) {
            throw new DuplicateEnrollmentException("Visitor already has an enrolled face. Delete first to re-enroll.");
        }

        byte[] imageBytes = readImageBytes(imageFile);

        DetectFacesResponse detectResponse = rekognitionService.detectFaces(imageBytes);
        validateFaceDetection(detectResponse);

        String s3Key = s3Service.buildVisitorImageKey(tenantId, visitorId);
        s3Service.uploadImage(imageBytes, s3Key, imageFile.getContentType());

        String collectionId = collectionPrefix + "-" + tenantId;
        rekognitionService.createCollectionIfNotExists(collectionId);

        IndexFacesResponse indexResponse = rekognitionService.indexFace(
            collectionId, s3Bucket, s3Key, visitorId.toString());

        if (indexResponse.faceRecords().isEmpty()) {
            throw new FaceRecognitionException("Rekognition indexed 0 faces — image quality too low or no face found");
        }

        FaceRecord faceRecord = indexResponse.faceRecords().get(0);
        String rekognitionFaceId = faceRecord.face().faceId();
        double confidence = faceRecord.face().confidence();

        VisitorFace visitorFace = new VisitorFace();
        visitorFace.setVisitorId(visitorId);
        visitorFace.setTenantId(tenantId);
        visitorFace.setRekognitionFaceId(rekognitionFaceId);
        visitorFace.setS3ImageKey(s3Key);
        visitorFace.setConfidence(confidence);
        visitorFaceRepository.save(visitorFace);

        saveLog(tenantId, visitorId, RecognitionLog.RecognitionAction.ENROLL,
            RecognitionLog.RecognitionStatus.SUCCESS, null, s3Key, null);

        return FaceEnrollResponse.builder()
            .visitorId(visitorId)
            .rekognitionFaceId(rekognitionFaceId)
            .confidence(confidence)
            .message("Face enrolled successfully")
            .build();
    }

    private void validateImageFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidImageException("Image file is required and must not be empty");
        }
        if (file.getSize() > 5 * 1024 * 1024) {
            throw new InvalidImageException("Image must not exceed 5MB");
        }
        String contentType = file.getContentType();
        if (contentType == null || !List.of("image/jpeg", "image/png").contains(contentType)) {
            throw new InvalidImageException("Only JPEG and PNG images are supported");
        }
    }

    private byte[] readImageBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new FaceRecognitionException("Failed to read image bytes", e);
        }
    }

    private void validateFaceDetection(DetectFacesResponse response) {
        if (response.faceDetails().isEmpty()) {
            throw new NoFaceDetectedException("No face detected in image");
        }
        if (response.faceDetails().size() > 1) {
            throw new MultipleFacesDetectedException(
                "Multiple faces detected (" + response.faceDetails().size() + "). Use single-face image.");
        }
        FaceDetail face = response.faceDetails().get(0);
        if (face.confidence() < 90.0f) {
            throw new LowQualityImageException(
                String.format("Face detection confidence %.1f%% is below 90%% threshold", face.confidence()));
        }
    }

    private void saveLog(UUID tenantId, UUID visitorId,
                         RecognitionLog.RecognitionAction action,
                         RecognitionLog.RecognitionStatus status,
                         Double similarity, String s3Key, String error) {
        RecognitionLog logEntry = new RecognitionLog();
        logEntry.setTenantId(tenantId);
        logEntry.setVisitorId(visitorId);
        logEntry.setAction(action);
        logEntry.setStatus(status);
        logEntry.setSimilarity(similarity);
        logEntry.setS3ImageKey(s3Key);
        logEntry.setErrorMessage(error);
        recognitionLogRepository.save(logEntry);
    }
}
