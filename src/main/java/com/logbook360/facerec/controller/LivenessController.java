package com.logbook360.facerec.controller;

import com.logbook360.facerec.dto.request.LivenessIdentifyRequest;
import com.logbook360.facerec.dto.response.ApiResponse;
import com.logbook360.facerec.dto.response.FaceIdentifyResponse;
import com.logbook360.facerec.dto.response.LivenessResultResponse;
import com.logbook360.facerec.dto.response.LivenessSessionResponse;
import com.logbook360.facerec.service.LivenessService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/liveness")
@RequiredArgsConstructor
public class LivenessController {

    private final LivenessService livenessService;

    @PostMapping("/session")
    public ResponseEntity<ApiResponse<LivenessSessionResponse>> createSession() {
        LivenessSessionResponse response = livenessService.createSession();
        return ResponseEntity.ok(ApiResponse.success(response, "Liveness session created"));
    }

    @GetMapping("/session/{sessionId}/result")
    public ResponseEntity<ApiResponse<LivenessResultResponse>> getResult(
            @PathVariable String sessionId) {
        LivenessResultResponse response = livenessService.getResult(sessionId);
        return ResponseEntity.ok(ApiResponse.success(response,
                response.isPassed() ? "Liveness passed" : "Liveness failed"));
    }

    @PostMapping("/identify")
    public ResponseEntity<ApiResponse<FaceIdentifyResponse>> identifyLive(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestBody @Valid LivenessIdentifyRequest request) {
        FaceIdentifyResponse response = livenessService.identifyFromSession(tenantId, request.getSessionId());
        return ResponseEntity.ok(ApiResponse.success(response,
                response.isMatched() ? "Visitor identified" : "No matching visitor found"));
    }
}
