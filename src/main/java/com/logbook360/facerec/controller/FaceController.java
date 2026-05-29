package com.logbook360.facerec.controller;

import com.logbook360.facerec.dto.request.LivenessEnrollRequest;
import com.logbook360.facerec.dto.response.ApiResponse;
import com.logbook360.facerec.dto.response.FaceEnrollResponse;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
import com.logbook360.facerec.dto.response.FaceVerifyResponse;
import com.logbook360.facerec.service.FaceDeletionService;
import com.logbook360.facerec.service.FaceEnrollmentService;
import com.logbook360.facerec.service.FaceIdentificationService;
import com.logbook360.facerec.service.FaceVerificationService;
import com.logbook360.facerec.service.LivenessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/face")
@RequiredArgsConstructor
public class FaceController {

    private final FaceEnrollmentService enrollmentService;
    private final FaceIdentificationService identificationService;
    private final FaceDeletionService deletionService;
    private final FaceVerificationService verificationService;
    private final LivenessService livenessService;

    @PostMapping("/enroll")
    public ResponseEntity<ApiResponse<FaceEnrollResponse>> enroll(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestParam("visitorId") UUID visitorId,
            @RequestPart("image") MultipartFile image) {
        FaceEnrollResponse response = enrollmentService.enrollFace(tenantId, visitorId, image);
        return ResponseEntity.ok(ApiResponse.success(response, response.getMessage()));
    }

    @PostMapping("/identify")
    public ResponseEntity<ApiResponse<FaceIdentifyResponse>> identify(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestPart("image") MultipartFile image) {
        FaceIdentifyResponse response = identificationService.identifyFace(tenantId, image);
        return ResponseEntity.ok(ApiResponse.success(response, response.getMessage()));
    }

    @PostMapping("/verify")
    public ResponseEntity<ApiResponse<FaceVerifyResponse>> verify(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestParam("visitorId") UUID visitorId,
            @RequestPart("image") MultipartFile image) {
        FaceVerifyResponse response = verificationService.verifyFace(tenantId, visitorId, image);
        return ResponseEntity.ok(ApiResponse.success(response, response.getMessage()));
    }

    @PostMapping("/enroll-live")
    public ResponseEntity<ApiResponse<FaceEnrollResponse>> enrollLive(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestBody @Valid LivenessEnrollRequest request) {
        FaceEnrollResponse response = livenessService.enrollFromSession(
                tenantId, request.getSessionId(),
                request.getVisitorName(), request.getEmail(), request.getMobile());
        return ResponseEntity.ok(ApiResponse.success(response, response.getMessage()));
    }

    @DeleteMapping("/{visitorId}")
    public ResponseEntity<ApiResponse<Void>> delete(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @PathVariable UUID visitorId) {
        deletionService.deleteFace(tenantId, visitorId);
        return ResponseEntity.ok(ApiResponse.success(null, "Face deleted successfully"));
    }
}
