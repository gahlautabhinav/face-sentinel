package com.logbook360.facerec.service;

import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
import com.logbook360.facerec.dto.response.LivenessResultResponse;
import com.logbook360.facerec.dto.response.LivenessSessionResponse;
import com.logbook360.facerec.exception.LivenessCheckFailedException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.rekognition.model.CompareFacesResponse;
import software.amazon.awssdk.services.rekognition.model.GetFaceLivenessSessionResultsResponse;
import software.amazon.awssdk.services.rekognition.model.ImageTooLargeException;
import software.amazon.awssdk.services.rekognition.model.InvalidImageFormatException;
import software.amazon.awssdk.services.rekognition.model.InvalidParameterException;
import software.amazon.awssdk.services.rekognition.model.LivenessSessionStatus;

import java.util.UUID;

@Service
@Slf4j
public class LivenessService {

    // A kiosk frame may stand in for the liveness image only when it is clearly the same person.
    private static final float SAME_PERSON_THRESHOLD = 90.0f;

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
        return LivenessResultResponse.builder()
                .passed(isLive(response))
                .confidence(response.confidence() == null ? 0f : response.confidence())
                .build();
    }

    /**
     * Identifies the person who passed the liveness session. The liveness reference image decides;
     * {@code frameBytes} (a better-angle kiosk frame, may be null) is only used when the reference
     * image finds no match and the frame shows that same person and nobody else.
     */
    public FaceIdentifyResponse identifyFromSession(UUID tenantId, String sessionId, byte[] frameBytes) {
        byte[] referenceBytes = requireLiveReferenceImage(sessionId);
        FaceIdentifyResponse fromReference = identificationService.identifyFaceFromBytes(tenantId, referenceBytes);
        if (fromReference.isMatched() || frameBytes == null || frameBytes.length == 0) {
            return fromReference;
        }
        if (!frameShowsOnlyLivePerson(referenceBytes, frameBytes)) {
            log.warn("Kiosk frame rejected for liveness session {}: not the person who passed liveness", sessionId);
            return fromReference;
        }
        return identificationService.identifyFaceFromBytes(tenantId, frameBytes);
    }

    public FaceEnrollResponse enrollFromSession(UUID tenantId, String sessionId,
                                                String visitorName, String email, String mobile) {
        byte[] imageBytes = requireLiveReferenceImage(sessionId);
        return enrollmentService.enrollFaceFromBytes(tenantId, imageBytes, visitorName, email, mobile);
    }

    private boolean isLive(GetFaceLivenessSessionResultsResponse response) {
        return response.status() == LivenessSessionStatus.SUCCEEDED
                && response.confidence() != null
                && response.confidence() >= confidenceThreshold;
    }

    private byte[] requireLiveReferenceImage(String sessionId) {
        GetFaceLivenessSessionResultsResponse response =
                rekognitionService.getFaceLivenessSessionResults(sessionId);
        if (!isLive(response)) {
            throw new LivenessCheckFailedException(response.confidence() == null
                    ? "Liveness session did not complete (status " + response.status() + ")"
                    : String.format("Liveness confidence %.1f%% below threshold %.1f%% (status %s)",
                            response.confidence(), confidenceThreshold, response.status()));
        }
        if (response.referenceImage() == null || response.referenceImage().bytes() == null) {
            throw new LivenessCheckFailedException("Liveness reference image unavailable");
        }
        return response.referenceImage().bytes().asByteArray();
    }

    private boolean frameShowsOnlyLivePerson(byte[] referenceBytes, byte[] frameBytes) {
        try {
            CompareFacesResponse comparison =
                    rekognitionService.compareFaces(referenceBytes, frameBytes, SAME_PERSON_THRESHOLD);
            // Any other face in the frame could be the one identification picks, so reject it.
            return !comparison.faceMatches().isEmpty() && comparison.unmatchedFaces().isEmpty();
        } catch (InvalidParameterException | InvalidImageFormatException | ImageTooLargeException e) {
            // Unusable frame (no face, not an image, too big): same as no frame.
            return false;
        }
    }
}
