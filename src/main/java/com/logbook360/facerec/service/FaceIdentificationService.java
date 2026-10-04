package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.RecognitionLog;
import com.logbook360.facerec.domain.Visitor;
import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
import com.logbook360.facerec.exception.FaceNotFoundException;
import com.logbook360.facerec.exception.FaceRecognitionException;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import com.logbook360.facerec.repository.VisitorRepository;
import com.logbook360.facerec.service.liveness.LivenessProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.services.rekognition.model.*;

import java.io.IOException;
import java.util.UUID;

@Service
@Slf4j
public class FaceIdentificationService {

    private final RekognitionService rekognitionService;
    private final VisitorFaceRepository visitorFaceRepository;
    private final VisitorRepository visitorRepository;
    private final RecognitionLogRepository recognitionLogRepository;
    private final LivenessProvider livenessProvider;
    private final String collectionPrefix;
    private final float similarityThreshold;

    public FaceIdentificationService(
            RekognitionService rekognitionService,
            VisitorFaceRepository visitorFaceRepository,
            VisitorRepository visitorRepository,
            RecognitionLogRepository recognitionLogRepository,
            LivenessProvider livenessProvider,
            @Value("${aws.rekognition.collection-prefix}") String collectionPrefix,
            @Value("${aws.rekognition.similarity-threshold:90.0}") float similarityThreshold) {
        this.rekognitionService = rekognitionService;
        this.visitorFaceRepository = visitorFaceRepository;
        this.visitorRepository = visitorRepository;
        this.recognitionLogRepository = recognitionLogRepository;
        this.livenessProvider = livenessProvider;
        this.collectionPrefix = collectionPrefix;
        this.similarityThreshold = similarityThreshold;
    }

    public FaceIdentifyResponse identifyFace(UUID tenantId, MultipartFile imageFile) {
        byte[] imageBytes;
        try {
            imageBytes = imageFile.getBytes();
        } catch (IOException e) {
            throw new FaceRecognitionException("Failed to read image bytes", e);
        }

        livenessProvider.checkLiveness(imageBytes);

        return identifyFaceFromBytes(tenantId, imageBytes);
    }

    public FaceIdentifyResponse identifyFaceFromBytes(UUID tenantId, byte[] imageBytes) {
        String collectionId = collectionPrefix + "-" + tenantId;

        SearchFacesByImageResponse searchResponse;
        try {
            searchResponse = rekognitionService.searchFacesByImage(collectionId, imageBytes, similarityThreshold);
        } catch (InvalidParameterException | ResourceNotFoundException e) {
            saveLog(tenantId, null, RecognitionLog.RecognitionAction.IDENTIFY,
                RecognitionLog.RecognitionStatus.FAILURE, null, e.getMessage());
            throw new FaceRecognitionException("Face identification failed: " + e.getMessage(), e);
        }

        if (searchResponse.faceMatches().isEmpty()) {
            saveLog(tenantId, null, RecognitionLog.RecognitionAction.IDENTIFY,
                RecognitionLog.RecognitionStatus.NO_MATCH, null, null);
            return FaceIdentifyResponse.builder()
                .matched(false)
                .message("No matching visitor found")
                .build();
        }

        // Matches come best first. The collection can still hold faces whose database record is
        // gone (left behind by an earlier enrollment of the same person). Such a stale copy can
        // outrank the current enrollment, so skip it and keep looking instead of reporting no match.
        Double staleSimilarity = null;
        for (FaceMatch match : searchResponse.faceMatches()) {
            String rekognitionFaceId = match.face().faceId();
            double similarity = match.similarity();

            VisitorFace visitorFace = visitorFaceRepository
                .findByRekognitionFaceIdAndTenantId(rekognitionFaceId, tenantId)
                .orElse(null);
            Visitor visitor = visitorFace == null ? null
                : visitorRepository.findById(visitorFace.getVisitorId()).orElse(null);
            if (visitor == null) {
                log.warn("Rekognition face {} matched at {}% but has no visitor record for tenant {}; skipping",
                    rekognitionFaceId, similarity, tenantId);
                if (staleSimilarity == null) staleSimilarity = similarity;
                continue;
            }

            saveLog(tenantId, visitor.getId(), RecognitionLog.RecognitionAction.IDENTIFY,
                RecognitionLog.RecognitionStatus.SUCCESS, similarity, null);

            return FaceIdentifyResponse.builder()
                .matched(true)
                .visitorId(visitor.getId())
                .visitorName(visitor.getName())
                .similarity(similarity)
                .message("Visitor identified successfully")
                .build();
        }

        saveLog(tenantId, null, RecognitionLog.RecognitionAction.IDENTIFY,
            RecognitionLog.RecognitionStatus.NO_MATCH, staleSimilarity, "Orphaned Rekognition face ID");
        return FaceIdentifyResponse.builder().matched(false).message("No matching visitor found").build();
    }

    private void saveLog(UUID tenantId, UUID visitorId,
                         RecognitionLog.RecognitionAction action,
                         RecognitionLog.RecognitionStatus status,
                         Double similarity, String error) {
        RecognitionLog logEntry = new RecognitionLog();
        logEntry.setTenantId(tenantId);
        logEntry.setVisitorId(visitorId);
        logEntry.setAction(action);
        logEntry.setStatus(status);
        logEntry.setSimilarity(similarity);
        logEntry.setErrorMessage(error);
        recognitionLogRepository.save(logEntry);
    }
}
