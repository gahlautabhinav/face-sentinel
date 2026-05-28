package com.logbook360.facerec.service;

import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.dto.response.LivenessResultResponse;
import com.logbook360.facerec.dto.response.LivenessSessionResponse;
import com.logbook360.facerec.exception.LivenessCheckFailedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.rekognition.model.*;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LivenessServiceTest {

    @Mock private RekognitionService rekognitionService;
    @Mock private FaceEnrollmentService enrollmentService;

    private LivenessService service;

    @BeforeEach
    void setUp() {
        service = new LivenessService(rekognitionService, enrollmentService, 80.0f);
    }

    @Test
    void createSessionReturnsSessionId() {
        when(rekognitionService.createFaceLivenessSession())
                .thenReturn(CreateFaceLivenessSessionResponse.builder().sessionId("sess-abc").build());

        LivenessSessionResponse resp = service.createSession();
        assertThat(resp.getSessionId()).isEqualTo("sess-abc");
    }

    @Test
    void getResultPassedWhenConfidenceAboveThreshold() {
        when(rekognitionService.getFaceLivenessSessionResults("sess-1"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(95.0f)
                        .status(LivenessSessionStatus.SUCCEEDED)
                        .build());

        LivenessResultResponse resp = service.getResult("sess-1");
        assertThat(resp.isPassed()).isTrue();
        assertThat(resp.getConfidence()).isEqualTo(95.0f);
    }

    @Test
    void getResultFailedWhenConfidenceBelowThreshold() {
        when(rekognitionService.getFaceLivenessSessionResults("sess-2"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(60.0f)
                        .status(LivenessSessionStatus.SUCCEEDED)
                        .build());

        LivenessResultResponse resp = service.getResult("sess-2");
        assertThat(resp.isPassed()).isFalse();
    }

    @Test
    void enrollFromSessionThrowsWhenLowConfidence() {
        when(rekognitionService.getFaceLivenessSessionResults("sess-3"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(50.0f)
                        .status(LivenessSessionStatus.SUCCEEDED)
                        .build());

        assertThatThrownBy(() -> service.enrollFromSession(UUID.randomUUID(), UUID.randomUUID(), "sess-3"))
                .isInstanceOf(LivenessCheckFailedException.class)
                .hasMessageContaining("Liveness confidence");
    }

    @Test
    void enrollFromSessionDelegatesToEnrollmentServiceWhenConfidenceAboveThreshold() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        byte[] fakeBytes = new byte[]{1, 2, 3};

        AuditImage referenceImage = AuditImage.builder()
                .bytes(SdkBytes.fromByteArray(fakeBytes))
                .build();

        when(rekognitionService.getFaceLivenessSessionResults("sess-4"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(90.0f)
                        .status(LivenessSessionStatus.SUCCEEDED)
                        .referenceImage(referenceImage)
                        .build());

        FaceEnrollResponse expected = FaceEnrollResponse.builder()
                .visitorId(visitorId)
                .rekognitionFaceId("face-123")
                .confidence(99.0)
                .message("Face enrolled successfully via liveness")
                .build();
        when(enrollmentService.enrollFaceFromBytes(tenantId, visitorId, fakeBytes)).thenReturn(expected);

        FaceEnrollResponse result = service.enrollFromSession(tenantId, visitorId, "sess-4");
        assertThat(result.getMessage()).contains("liveness");
    }
}
