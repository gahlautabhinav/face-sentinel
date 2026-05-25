package com.logbook360.facerec.controller;

import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
import com.logbook360.facerec.exception.DuplicateEnrollmentException;
import com.logbook360.facerec.exception.FaceNotFoundException;
import com.logbook360.facerec.service.FaceDeletionService;
import com.logbook360.facerec.service.FaceEnrollmentService;
import com.logbook360.facerec.service.FaceIdentificationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(FaceController.class)
class FaceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean private FaceEnrollmentService enrollmentService;
    @MockBean private FaceIdentificationService identificationService;
    @MockBean private FaceDeletionService deletionService;

    @Test
    void enrollReturns200OnSuccess() throws Exception {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "face.jpg", "image/jpeg", new byte[100]);

        when(enrollmentService.enrollFace(any(), any(), any()))
            .thenReturn(FaceEnrollResponse.builder()
                .visitorId(visitorId)
                .rekognitionFaceId("rek-123")
                .confidence(99.0)
                .message("Face enrolled successfully")
                .build());

        mockMvc.perform(multipart("/api/face/enroll")
                .file(image)
                .param("visitorId", visitorId.toString())
                .header("X-Tenant-Id", tenantId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.rekognitionFaceId").value("rek-123"));
    }

    @Test
    void enrollReturns409OnDuplicate() throws Exception {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "face.jpg", "image/jpeg", new byte[100]);

        when(enrollmentService.enrollFace(any(), any(), any()))
            .thenThrow(new DuplicateEnrollmentException("Already enrolled"));

        mockMvc.perform(multipart("/api/face/enroll")
                .file(image)
                .param("visitorId", visitorId.toString())
                .header("X-Tenant-Id", tenantId.toString()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.success").value(false));
    }

    @Test
    void identifyReturns200WhenMatched() throws Exception {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();
        MockMultipartFile image = new MockMultipartFile(
            "image", "kiosk.jpg", "image/jpeg", new byte[100]);

        when(identificationService.identifyFace(any(), any()))
            .thenReturn(FaceIdentifyResponse.builder()
                .matched(true)
                .visitorId(visitorId)
                .visitorName("Ravi Kumar")
                .similarity(97.5)
                .message("Visitor identified successfully")
                .build());

        mockMvc.perform(multipart("/api/face/identify")
                .file(image)
                .header("X-Tenant-Id", tenantId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.matched").value(true))
            .andExpect(jsonPath("$.data.visitorName").value("Ravi Kumar"));
    }

    @Test
    void deleteReturns200OnSuccess() throws Exception {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();

        doNothing().when(deletionService).deleteFace(any(), any());

        mockMvc.perform(delete("/api/face/" + visitorId)
                .header("X-Tenant-Id", tenantId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void deleteReturns404WhenNotEnrolled() throws Exception {
        UUID tenantId = UUID.randomUUID();
        UUID visitorId = UUID.randomUUID();

        doThrow(new FaceNotFoundException("No face found")).when(deletionService).deleteFace(any(), any());

        mockMvc.perform(delete("/api/face/" + visitorId)
                .header("X-Tenant-Id", tenantId.toString()))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.success").value(false));
    }
}
