package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.RecognitionLog;
import com.logbook360.facerec.domain.Visitor;
import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.dto.response.FaceVerifyResponse;
import com.logbook360.facerec.exception.FaceRecognitionException;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import com.logbook360.facerec.repository.VisitorRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.services.rekognition.model.*;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class FaceVerificationService {

    private final RekognitionService rekognitionService;
    private final VisitorFaceRepository visitorFaceRepository;
    private final VisitorRepository visitorRepository;
    private final RecognitionLogRepository recognitionLogRepository;
    private final String collectionPrefix;
    private final float similarityThreshold;
    private final float minFaceCoverage;
    private final float maxCenterOffset;

    public FaceVerificationService(
            RekognitionService rekognitionService,
            VisitorFaceRepository visitorFaceRepository,
            VisitorRepository visitorRepository,
            RecognitionLogRepository recognitionLogRepository,
            @Value("${aws.rekognition.collection-prefix}") String collectionPrefix,
            @Value("${aws.rekognition.similarity-threshold:90.0}") float similarityThreshold,
            @Value("${aws.rekognition.min-face-coverage:0.15}") float minFaceCoverage,
            @Value("${aws.rekognition.max-center-offset:0.25}") float maxCenterOffset) {
        this.rekognitionService = rekognitionService;
        this.visitorFaceRepository = visitorFaceRepository;
        this.visitorRepository = visitorRepository;
        this.recognitionLogRepository = recognitionLogRepository;
        this.collectionPrefix = collectionPrefix;
        this.similarityThreshold = similarityThreshold;
        this.minFaceCoverage = minFaceCoverage;
        this.maxCenterOffset = maxCenterOffset;
    }

    public FaceVerifyResponse verifyFace(UUID tenantId, UUID visitorId, MultipartFile imageFile) {
        byte[] imageBytes;
        try {
            imageBytes = imageFile.getBytes();
        } catch (IOException e) {
            throw new FaceRecognitionException("Failed to read image bytes", e);
        }

        FaceVerifyResponse positionError = validateFacePosition(visitorId, imageBytes);
        if (positionError != null) {
            return positionError;
        }

        String collectionId = collectionPrefix + "-" + tenantId;

        SearchFacesByImageResponse searchResponse;
        try {
            searchResponse = rekognitionService.searchFacesByImage(collectionId, imageBytes, similarityThreshold);
        } catch (InvalidParameterException | ResourceNotFoundException e) {
            saveLog(tenantId, visitorId, RecognitionLog.RecognitionStatus.FAILURE, null, e.getMessage());
            throw new FaceRecognitionException("Face verification failed: " + e.getMessage(), e);
        }

        if (searchResponse.faceMatches().isEmpty()) {
            saveLog(tenantId, visitorId, RecognitionLog.RecognitionStatus.NO_MATCH, null, null);
            return FaceVerifyResponse.builder()
                    .verified(false)
                    .visitorId(visitorId)
                    .message("No face match found in collection")
                    .build();
        }

        FaceMatch bestMatch = searchResponse.faceMatches().get(0);
        String matchedRekFaceId = bestMatch.face().faceId();
        double similarity = bestMatch.similarity();

        VisitorFace matchedFace = visitorFaceRepository
                .findByRekognitionFaceIdAndTenantId(matchedRekFaceId, tenantId)
                .orElse(null);

        if (matchedFace == null || !matchedFace.getVisitorId().equals(visitorId)) {
            saveLog(tenantId, visitorId, RecognitionLog.RecognitionStatus.NO_MATCH, similarity, null);
            return FaceVerifyResponse.builder()
                    .verified(false)
                    .visitorId(visitorId)
                    .similarity(similarity)
                    .message("Face does not match the visitor from QR code")
                    .build();
        }

        Visitor visitor = visitorRepository.findById(visitorId).orElse(null);
        String visitorName = visitor != null ? visitor.getName() : "Unknown";

        saveLog(tenantId, visitorId, RecognitionLog.RecognitionStatus.SUCCESS, similarity, null);

        return FaceVerifyResponse.builder()
                .verified(true)
                .visitorId(visitorId)
                .visitorName(visitorName)
                .similarity(similarity)
                .message("Identity verified")
                .build();
    }

    // Returns a rejection response if the frame fails position checks, null if OK to proceed.
    private FaceVerifyResponse validateFacePosition(UUID visitorId, byte[] imageBytes) {
        DetectFacesResponse detectResponse = rekognitionService.detectFaces(imageBytes);
        List<FaceDetail> faces = detectResponse.faceDetails();

        if (faces.isEmpty()) {
            return FaceVerifyResponse.builder()
                    .verified(false)
                    .visitorId(visitorId)
                    .message("No face detected — look at the camera")
                    .build();
        }

        if (faces.size() > 1) {
            return FaceVerifyResponse.builder()
                    .verified(false)
                    .visitorId(visitorId)
                    .message("Multiple people detected — only one person allowed")
                    .build();
        }

        BoundingBox box = faces.get(0).boundingBox();

        if (box.width() < minFaceCoverage) {
            return FaceVerifyResponse.builder()
                    .verified(false)
                    .visitorId(visitorId)
                    .message("Move closer to the camera")
                    .build();
        }

        float faceCenterX = box.left() + box.width() / 2.0f;
        float faceCenterY = box.top() + box.height() / 2.0f;

        if (Math.abs(faceCenterX - 0.5f) > maxCenterOffset || Math.abs(faceCenterY - 0.5f) > maxCenterOffset) {
            return FaceVerifyResponse.builder()
                    .verified(false)
                    .visitorId(visitorId)
                    .message("Center your face in the frame")
                    .build();
        }

        return null;
    }

    private void saveLog(UUID tenantId, UUID visitorId,
                         RecognitionLog.RecognitionStatus status,
                         Double similarity, String error) {
        RecognitionLog log = new RecognitionLog();
        log.setTenantId(tenantId);
        log.setVisitorId(visitorId);
        log.setAction(RecognitionLog.RecognitionAction.IDENTIFY);
        log.setStatus(status);
        log.setSimilarity(similarity);
        log.setErrorMessage(error);
        recognitionLogRepository.save(log);
    }
}
