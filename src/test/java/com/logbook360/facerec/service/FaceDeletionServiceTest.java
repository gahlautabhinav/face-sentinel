package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.exception.FaceNotFoundException;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FaceDeletionServiceTest {

    @Mock private RekognitionService rekognitionService;
    @Mock private S3Service s3Service;
    @Mock private VisitorFaceRepository visitorFaceRepository;
    @Mock private RecognitionLogRepository recognitionLogRepository;

    private FaceDeletionService service;

    @BeforeEach
    void setUp() {
        service = new FaceDeletionService(
            rekognitionService, s3Service, visitorFaceRepository,
            recognitionLogRepository, "logbook360");
    }

    @Test
    void deletesFaceFromRekognitionAndS3AndDb() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();

        VisitorFace face = new VisitorFace();
        face.setTenantId(tenantId);
        face.setVisitorId(visitorId);
        face.setRekognitionFaceId("rek-face-del");
        face.setS3ImageKey("tenants/t/visitors/v/faces/f.jpg");

        when(visitorFaceRepository.findByVisitorIdAndTenantId(visitorId, tenantId))
            .thenReturn(List.of(face));
        when(recognitionLogRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        service.deleteFace(tenantId, visitorId);

        verify(rekognitionService).deleteFace("logbook360-" + tenantId, "rek-face-del");
        verify(s3Service).deleteObject("tenants/t/visitors/v/faces/f.jpg");
        verify(visitorFaceRepository).deleteByVisitorIdAndTenantId(visitorId, tenantId);
    }

    @Test
    void throwsFaceNotFoundWhenNoEnrolledFace() {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();

        when(visitorFaceRepository.findByVisitorIdAndTenantId(visitorId, tenantId))
            .thenReturn(Collections.emptyList());

        assertThatThrownBy(() -> service.deleteFace(tenantId, visitorId))
            .isInstanceOf(FaceNotFoundException.class);
    }
}
