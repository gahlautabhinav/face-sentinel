package com.logbook360.facerec.service;

import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
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
    @Mock private FaceIdentificationService identificationService;

    private LivenessService service;

    @BeforeEach
    void setUp() {
        service = new LivenessService(rekognitionService, enrollmentService, identificationService, 80.0f);
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

        assertThatThrownBy(() -> service.enrollFromSession(UUID.randomUUID(), "sess-3", "Test User", null, null))
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
        when(enrollmentService.enrollFaceFromBytes(eq(tenantId), eq(fakeBytes), eq("John Doe"), isNull(), isNull()))
                .thenReturn(expected);

        FaceEnrollResponse result = service.enrollFromSession(tenantId, "sess-4", "John Doe", null, null);
        assertThat(result.getMessage()).contains("liveness");
    }

    private static final byte[] REFERENCE = {1, 2, 3};
    private static final byte[] FRAME = {9, 8, 7};
    private static final FaceIdentifyResponse NO_MATCH = FaceIdentifyResponse.builder().matched(false).build();
    private static final FaceIdentifyResponse MATCH =
            FaceIdentifyResponse.builder().matched(true).visitorName("Jane").similarity(97.0).build();

    private void livePassed(String sessionId) {
        when(rekognitionService.getFaceLivenessSessionResults(sessionId))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(95.0f)
                        .status(LivenessSessionStatus.SUCCEEDED)
                        .referenceImage(AuditImage.builder().bytes(SdkBytes.fromByteArray(REFERENCE)).build())
                        .build());
    }

    @Test
    void getResultFailedWhenStatusNotSucceeded() {
        when(rekognitionService.getFaceLivenessSessionResults("sess-5"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(99.0f)
                        .status(LivenessSessionStatus.FAILED)
                        .build());

        assertThat(service.getResult("sess-5").isPassed()).isFalse();
    }

    @Test
    void identifyFromSessionThrowsWhenStatusNotSucceeded() {
        when(rekognitionService.getFaceLivenessSessionResults("sess-6"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(99.0f)
                        .status(LivenessSessionStatus.EXPIRED)
                        .build());

        assertThatThrownBy(() -> service.identifyFromSession(UUID.randomUUID(), "sess-6", FRAME))
                .isInstanceOf(LivenessCheckFailedException.class);
        verifyNoInteractions(identificationService);
    }

    @Test
    void identifyFromSessionThrowsWhenConfidenceMissing() {
        when(rekognitionService.getFaceLivenessSessionResults("sess-7"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .status(LivenessSessionStatus.SUCCEEDED)
                        .build());

        assertThatThrownBy(() -> service.identifyFromSession(UUID.randomUUID(), "sess-7", FRAME))
                .isInstanceOf(LivenessCheckFailedException.class);
        verifyNoInteractions(identificationService);
    }

    @Test
    void identifyFromSessionThrowsWhenConfidenceBelowThresholdEvenWithFrame() {
        when(rekognitionService.getFaceLivenessSessionResults("sess-8"))
                .thenReturn(GetFaceLivenessSessionResultsResponse.builder()
                        .confidence(20.0f)
                        .status(LivenessSessionStatus.SUCCEEDED)
                        .build());

        assertThatThrownBy(() -> service.identifyFromSession(UUID.randomUUID(), "sess-8", FRAME))
                .isInstanceOf(LivenessCheckFailedException.class);
        verifyNoInteractions(identificationService);
    }

    @Test
    void identifyFromSessionUsesReferenceMatchWithoutTouchingFrame() {
        UUID tenantId = UUID.randomUUID();
        livePassed("sess-9");
        when(identificationService.identifyFaceFromBytes(tenantId, REFERENCE)).thenReturn(MATCH);

        assertThat(service.identifyFromSession(tenantId, "sess-9", FRAME).isMatched()).isTrue();
        verify(rekognitionService, never()).compareFaces(any(), any(), anyFloat());
        verify(identificationService, never()).identifyFaceFromBytes(tenantId, FRAME);
    }

    @Test
    void frameOfDifferentPersonIsIgnored() {
        UUID tenantId = UUID.randomUUID();
        livePassed("sess-10");
        when(identificationService.identifyFaceFromBytes(tenantId, REFERENCE)).thenReturn(NO_MATCH);
        when(rekognitionService.compareFaces(eq(REFERENCE), eq(FRAME), anyFloat()))
                .thenReturn(CompareFacesResponse.builder()
                        .unmatchedFaces(ComparedFace.builder().build())
                        .build());

        assertThat(service.identifyFromSession(tenantId, "sess-10", FRAME).isMatched()).isFalse();
        verify(identificationService, never()).identifyFaceFromBytes(tenantId, FRAME);
    }

    @Test
    void frameWithAnExtraFaceIsIgnored() {
        UUID tenantId = UUID.randomUUID();
        livePassed("sess-11");
        when(identificationService.identifyFaceFromBytes(tenantId, REFERENCE)).thenReturn(NO_MATCH);
        when(rekognitionService.compareFaces(eq(REFERENCE), eq(FRAME), anyFloat()))
                .thenReturn(CompareFacesResponse.builder()
                        .faceMatches(CompareFacesMatch.builder().similarity(99.0f).build())
                        .unmatchedFaces(ComparedFace.builder().build())
                        .build());

        assertThat(service.identifyFromSession(tenantId, "sess-11", FRAME).isMatched()).isFalse();
        verify(identificationService, never()).identifyFaceFromBytes(tenantId, FRAME);
    }

    @Test
    void unusableFrameIsIgnored() {
        UUID tenantId = UUID.randomUUID();
        livePassed("sess-12");
        when(identificationService.identifyFaceFromBytes(tenantId, REFERENCE)).thenReturn(NO_MATCH);
        when(rekognitionService.compareFaces(eq(REFERENCE), eq(FRAME), anyFloat()))
                .thenThrow(InvalidParameterException.builder().message("no face").build());

        assertThat(service.identifyFromSession(tenantId, "sess-12", FRAME).isMatched()).isFalse();
        verify(identificationService, never()).identifyFaceFromBytes(tenantId, FRAME);
    }

    @Test
    void frameOfSamePersonRescuesAReferenceMiss() {
        UUID tenantId = UUID.randomUUID();
        livePassed("sess-13");
        when(identificationService.identifyFaceFromBytes(tenantId, REFERENCE)).thenReturn(NO_MATCH);
        when(rekognitionService.compareFaces(eq(REFERENCE), eq(FRAME), anyFloat()))
                .thenReturn(CompareFacesResponse.builder()
                        .faceMatches(CompareFacesMatch.builder().similarity(99.0f).build())
                        .build());
        when(identificationService.identifyFaceFromBytes(tenantId, FRAME)).thenReturn(MATCH);

        FaceIdentifyResponse result = service.identifyFromSession(tenantId, "sess-13", FRAME);
        assertThat(result.isMatched()).isTrue();
        assertThat(result.getVisitorName()).isEqualTo("Jane");
    }

    @Test
    void referenceMissWithoutFrameIsNoMatch() {
        UUID tenantId = UUID.randomUUID();
        livePassed("sess-14");
        when(identificationService.identifyFaceFromBytes(tenantId, REFERENCE)).thenReturn(NO_MATCH);

        assertThat(service.identifyFromSession(tenantId, "sess-14", null).isMatched()).isFalse();
        verify(rekognitionService, never()).compareFaces(any(), any(), anyFloat());
    }
}
