package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.exception.DuplicateEnrollmentException;
import com.logbook360.facerec.exception.NoFaceDetectedException;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import software.amazon.awssdk.services.rekognition.model.*;

import java.util.Collections;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FaceEnrollmentServiceTest {

    @Mock private RekognitionService rekognitionService;
    @Mock private S3Service s3Service;
    @Mock private VisitorFaceRepository visitorFaceRepository;
    @Mock private RecognitionLogRepository recognitionLogRepository;

    private FaceEnrollmentService service;

    @BeforeEach
    void setUp() {
        service = new FaceEnrollmentService(
            rekognitionService, s3Service, visitorFaceRepository,
            recognitionLogRepository, "logbook360", "test-bucket");
    }

    @Test
    void enrollSuccessfully() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "face.jpg", "image/jpeg", new byte[1024]);

        when(visitorFaceRepository.existsByVisitorIdAndTenantId(visitorId, tenantId)).thenReturn(false);
        when(rekognitionService.detectFaces(any())).thenReturn(
            DetectFacesResponse.builder()
                .faceDetails(FaceDetail.builder().confidence(99.0f).build())
                .build());
        when(s3Service.buildVisitorImageKey(tenantId, visitorId)).thenReturn("tenants/t/visitors/v/faces/x.jpg");
        when(s3Service.uploadImage(any(), anyString(), anyString())).thenReturn("key");
        when(rekognitionService.indexFace(anyString(), anyString(), anyString(), anyString()))
            .thenReturn(IndexFacesResponse.builder()
                .faceRecords(FaceRecord.builder()
                    .face(Face.builder().faceId("rek-face-123").confidence(99.0f).build())
                    .build())
                .build());
        when(visitorFaceRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        when(recognitionLogRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        FaceEnrollResponse response = service.enrollFace(tenantId, visitorId, image);

        assertThat(response.getRekognitionFaceId()).isEqualTo("rek-face-123");
        assertThat(response.getVisitorId()).isEqualTo(visitorId);
        verify(visitorFaceRepository).save(any(VisitorFace.class));
    }

    @Test
    void throwsDuplicateWhenAlreadyEnrolled() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "face.jpg", "image/jpeg", new byte[1024]);

        when(visitorFaceRepository.existsByVisitorIdAndTenantId(visitorId, tenantId)).thenReturn(true);

        assertThatThrownBy(() -> service.enrollFace(tenantId, visitorId, image))
            .isInstanceOf(DuplicateEnrollmentException.class);

        verifyNoInteractions(rekognitionService);
    }

    @Test
    void throwsNoFaceDetectedWhenImageHasNoFace() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "face.jpg", "image/jpeg", new byte[1024]);

        when(visitorFaceRepository.existsByVisitorIdAndTenantId(visitorId, tenantId)).thenReturn(false);
        when(rekognitionService.detectFaces(any())).thenReturn(
            DetectFacesResponse.builder().faceDetails(Collections.emptyList()).build());

        assertThatThrownBy(() -> service.enrollFace(tenantId, visitorId, image))
            .isInstanceOf(NoFaceDetectedException.class);
    }
}
