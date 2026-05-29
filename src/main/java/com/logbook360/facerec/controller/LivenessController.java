package com.logbook360.facerec.controller;

import com.logbook360.facerec.dto.response.ApiResponse;
import com.logbook360.facerec.dto.response.LivenessResultResponse;
import com.logbook360.facerec.dto.response.LivenessSessionResponse;
import com.logbook360.facerec.service.LivenessService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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
}
