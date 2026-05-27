package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.Visitor;
import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.dto.response.FaceVerifyResponse;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import com.logbook360.facerec.repository.VisitorRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import software.amazon.awssdk.services.rekognition.model.*;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FaceVerificationServiceTest {

    @Mock private RekognitionService rekognitionService;
    @Mock private VisitorFaceRepository visitorFaceRepository;
    @Mock private VisitorRepository visitorRepository;
    @Mock private RecognitionLogRepository recognitionLogRepository;

    private FaceVerificationService service;

    @BeforeEach
    void setUp() {
        service = new FaceVerificationService(
            rekognitionService, visitorFaceRepository, visitorRepository,
            recognitionLogRepository, "logbook360", 90.0f, 0.15f, 0.25f);
    }

    // Helper: single centered face, large enough (width=0.30, center X=0.50, Y=0.50)
    private DetectFacesResponse singleCenteredFace() {
        return DetectFacesResponse.builder()
            .faceDetails(FaceDetail.builder()
                .boundingBox(BoundingBox.builder()
                    .left(0.35f).top(0.25f)
                    .width(0.30f).height(0.50f)
                    .build())
                .build())
            .build();
    }

    // --- Existing verification tests (detectFaces mocked to pass position check) ---

    @Test
    void verifiedWhenFaceMatchesQrVisitor() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        VisitorFace face = new VisitorFace();
        face.setVisitorId(visitorId);
        face.setTenantId(tenantId);
        face.setRekognitionFaceId("rek-face-abc");

        Visitor visitor = new Visitor();
        visitor.setId(visitorId);
        visitor.setName("Abhinav Gahlaut");
        visitor.setTenantId(tenantId);

        when(rekognitionService.detectFaces(any())).thenReturn(singleCenteredFace());
        when(rekognitionService.searchFacesByImage(anyString(), any(), anyFloat()))
            .thenReturn(SearchFacesByImageResponse.builder()
                .faceMatches(FaceMatch.builder()
                    .similarity(96.5f)
                    .face(Face.builder().faceId("rek-face-abc").build())
                    .build())
                .build());
        when(visitorFaceRepository.findByRekognitionFaceIdAndTenantId("rek-face-abc", tenantId))
            .thenReturn(Optional.of(face));
        when(visitorRepository.findById(visitorId)).thenReturn(Optional.of(visitor));
        when(recognitionLogRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        FaceVerifyResponse response = service.verifyFace(tenantId, visitorId, image);

        assertThat(response.isVerified()).isTrue();
        assertThat(response.getVisitorName()).isEqualTo("Abhinav Gahlaut");
        assertThat(response.getSimilarity()).isEqualTo(96.5);
    }

    @Test
    void notVerifiedWhenMatchedVisitorDiffersFromQr() {
        UUID tenantId = UUID.randomUUID();
        UUID qrVisitorId = UUID.randomUUID();
        UUID differentVisitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        VisitorFace face = new VisitorFace();
        face.setVisitorId(differentVisitorId);
        face.setTenantId(tenantId);
        face.setRekognitionFaceId("rek-face-other");

        when(rekognitionService.detectFaces(any())).thenReturn(singleCenteredFace());
        when(rekognitionService.searchFacesByImage(anyString(), any(), anyFloat()))
            .thenReturn(SearchFacesByImageResponse.builder()
                .faceMatches(FaceMatch.builder()
                    .similarity(95.0f)
                    .face(Face.builder().faceId("rek-face-other").build())
                    .build())
                .build());
        when(visitorFaceRepository.findByRekognitionFaceIdAndTenantId("rek-face-other", tenantId))
            .thenReturn(Optional.of(face));
        when(recognitionLogRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        FaceVerifyResponse response = service.verifyFace(tenantId, qrVisitorId, image);

        assertThat(response.isVerified()).isFalse();
        assertThat(response.getMessage()).contains("does not match");
    }

    @Test
    void notVerifiedWhenNoFaceMatch() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        when(rekognitionService.detectFaces(any())).thenReturn(singleCenteredFace());
        when(rekognitionService.searchFacesByImage(anyString(), any(), anyFloat()))
            .thenReturn(SearchFacesByImageResponse.builder()
                .faceMatches(Collections.emptyList())
                .build());
        when(recognitionLogRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        FaceVerifyResponse response = service.verifyFace(tenantId, visitorId, image);

        assertThat(response.isVerified()).isFalse();
    }

    // --- Position validation tests (searchFacesByImage never called) ---

    @Test
    void rejectedWhenNoFaceDetected() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        when(rekognitionService.detectFaces(any()))
            .thenReturn(DetectFacesResponse.builder()
                .faceDetails(Collections.emptyList())
                .build());

        FaceVerifyResponse response = service.verifyFace(tenantId, visitorId, image);

        assertThat(response.isVerified()).isFalse();
        assertThat(response.getMessage()).contains("No face detected");
        verify(rekognitionService, never()).searchFacesByImage(any(), any(), anyFloat());
    }

    @Test
    void rejectedWhenMultipleFacesDetected() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        when(rekognitionService.detectFaces(any()))
            .thenReturn(DetectFacesResponse.builder()
                .faceDetails(List.of(
                    FaceDetail.builder().boundingBox(BoundingBox.builder()
                        .left(0.10f).top(0.20f).width(0.25f).height(0.50f).build()).build(),
                    FaceDetail.builder().boundingBox(BoundingBox.builder()
                        .left(0.60f).top(0.20f).width(0.25f).height(0.50f).build()).build()
                ))
                .build());

        FaceVerifyResponse response = service.verifyFace(tenantId, visitorId, image);

        assertThat(response.isVerified()).isFalse();
        assertThat(response.getMessage()).contains("Multiple people");
        verify(rekognitionService, never()).searchFacesByImage(any(), any(), anyFloat());
    }

    @Test
    void rejectedWhenFaceTooSmall() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        // width=0.08 < minFaceCoverage=0.15 — person too far
        when(rekognitionService.detectFaces(any()))
            .thenReturn(DetectFacesResponse.builder()
                .faceDetails(FaceDetail.builder()
                    .boundingBox(BoundingBox.builder()
                        .left(0.46f).top(0.40f)
                        .width(0.08f).height(0.15f)
                        .build())
                    .build())
                .build());

        FaceVerifyResponse response = service.verifyFace(tenantId, visitorId, image);

        assertThat(response.isVerified()).isFalse();
        assertThat(response.getMessage()).contains("Move closer");
        verify(rekognitionService, never()).searchFacesByImage(any(), any(), anyFloat());
    }

    @Test
    void rejectedWhenFaceOffCenter() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        // face center X = 0.70 + 0.20/2 = 0.80, offset = |0.80 - 0.50| = 0.30 > maxCenterOffset=0.25
        when(rekognitionService.detectFaces(any()))
            .thenReturn(DetectFacesResponse.builder()
                .faceDetails(FaceDetail.builder()
                    .boundingBox(BoundingBox.builder()
                        .left(0.70f).top(0.25f)
                        .width(0.20f).height(0.50f)
                        .build())
                    .build())
                .build());

        FaceVerifyResponse response = service.verifyFace(tenantId, visitorId, image);

        assertThat(response.isVerified()).isFalse();
        assertThat(response.getMessage()).contains("Center your face");
        verify(rekognitionService, never()).searchFacesByImage(any(), any(), anyFloat());
    }
}
