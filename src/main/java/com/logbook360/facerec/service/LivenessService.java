package com.logbook360.facerec.service;

import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
import com.logbook360.facerec.dto.response.LivenessResultResponse;
import com.logbook360.facerec.dto.response.LivenessSessionResponse;
import com.logbook360.facerec.exception.LivenessCheckFailedException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.rekognition.model.GetFaceLivenessSessionResultsResponse;

import java.util.UUID;

@Service
@Slf4j
public class LivenessService {

    private final RekognitionService rekognitionService;
    private final FaceEnrollmentService enrollmentService;
    private final FaceIdentificationService identificationService;
    private final float confidenceThreshold;

    public LivenessService(
            RekognitionService rekognitionService,
            FaceEnrollmentService enrollmentService,
            FaceIdentificationService identificationService,
            @Value("${aws.rekognition.liveness-confidence-threshold:80.0}") float confidenceThreshold) {
        this.rekognitionService = rekognitionService;
        this.enrollmentService = enrollmentService;
        this.identificationService = identificationService;
        this.confidenceThreshold = confidenceThreshold;
    }

    public LivenessSessionResponse createSession() {
        var response = rekognitionService.createFaceLivenessSession();
        log.info("Created liveness session: {}", response.sessionId());
        return LivenessSessionResponse.builder().sessionId(response.sessionId()).build();
    }

    public LivenessResultResponse getResult(String sessionId) {
        GetFaceLivenessSessionResultsResponse response =
                rekognitionService.getFaceLivenessSessionResults(sessionId);
        boolean passed = response.confidence() >= confidenceThreshold;
        return LivenessResultResponse.builder()
                .passed(passed)
                .confidence(response.confidence())
                .build();
    }

    public FaceIdentifyResponse identifyFromSession(UUID tenantId, String sessionId) {
        GetFaceLivenessSessionResultsResponse response =
                rekognitionService.getFaceLivenessSessionResults(sessionId);
        if (response.confidence() < confidenceThreshold) {
            throw new LivenessCheckFailedException(
                    String.format("Liveness confidence %.1f%% below threshold %.1f%%",
                            response.confidence(), confidenceThreshold));
        }
        byte[] imageBytes = response.referenceImage().bytes().asByteArray();
        return identificationService.identifyFaceFromBytes(tenantId, imageBytes);
    }

    public FaceEnrollResponse enrollFromSession(UUID tenantId, String sessionId,
                                                String visitorName, String email, String mobile) {
        GetFaceLivenessSessionResultsResponse response =
                rekognitionService.getFaceLivenessSessionResults(sessionId);

        if (response.confidence() < confidenceThreshold) {
            throw new LivenessCheckFailedException(
                    String.format("Liveness confidence %.1f%% below threshold %.1f%%",
                            response.confidence(), confidenceThreshold));
        }

        byte[] imageBytes = response.referenceImage().bytes().asByteArray();
        return enrollmentService.enrollFaceFromBytes(tenantId, imageBytes, visitorName, email, mobile);
    }
}
