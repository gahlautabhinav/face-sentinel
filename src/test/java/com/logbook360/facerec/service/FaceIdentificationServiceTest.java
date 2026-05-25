package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.Visitor;
import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import com.logbook360.facerec.repository.VisitorRepository;
import com.logbook360.facerec.service.liveness.LivenessProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import software.amazon.awssdk.services.rekognition.model.*;

import java.util.Collections;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FaceIdentificationServiceTest {

    @Mock private RekognitionService rekognitionService;
    @Mock private VisitorFaceRepository visitorFaceRepository;
    @Mock private VisitorRepository visitorRepository;
    @Mock private RecognitionLogRepository recognitionLogRepository;
    @Mock private LivenessProvider livenessProvider;

    private FaceIdentificationService service;

    @BeforeEach
    void setUp() {
        service = new FaceIdentificationService(
            rekognitionService, visitorFaceRepository, visitorRepository,
            recognitionLogRepository, livenessProvider, "logbook360", 90.0f);
    }

    @Test
    void identifiesVisitorSuccessfully() {
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
        visitor.setName("Ravi Kumar");
        visitor.setTenantId(tenantId);

        when(rekognitionService.searchFacesByImage(anyString(), any(), anyFloat()))
            .thenReturn(SearchFacesByImageResponse.builder()
                .faceMatches(FaceMatch.builder()
                    .similarity(97.5f)
                    .face(Face.builder().faceId("rek-face-abc").build())
                    .build())
                .build());
        when(visitorFaceRepository.findByRekognitionFaceIdAndTenantId("rek-face-abc", tenantId))
            .thenReturn(Optional.of(face));
        when(visitorRepository.findById(visitorId)).thenReturn(Optional.of(visitor));
        when(recognitionLogRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        FaceIdentifyResponse response = service.identifyFace(tenantId, image);

        assertThat(response.isMatched()).isTrue();
        assertThat(response.getVisitorName()).isEqualTo("Ravi Kumar");
        assertThat(response.getSimilarity()).isEqualTo(97.5);
        verify(livenessProvider).checkLiveness(any());
    }

    @Test
    void returnsNoMatchWhenNoFacesFound() {
        UUID tenantId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[1024]);

        when(rekognitionService.searchFacesByImage(anyString(), any(), anyFloat()))
            .thenReturn(SearchFacesByImageResponse.builder()
                .faceMatches(Collections.emptyList())
                .build());
        when(recognitionLogRepository.save(any())).thenAnswer(i -> i.getArgument(0));

        FaceIdentifyResponse response = service.identifyFace(tenantId, image);

        assertThat(response.isMatched()).isFalse();
    }
}
