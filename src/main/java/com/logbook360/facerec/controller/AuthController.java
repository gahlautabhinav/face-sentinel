package com.logbook360.facerec.controller;

import com.logbook360.facerec.dto.request.TokenRequest;
import com.logbook360.facerec.dto.response.TokenResponse;
import com.logbook360.facerec.security.JwtService;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Slf4j
public class AuthController {

    private final JwtService jwtService;
    private final String adminClientId;
    private final String adminClientSecret;
    private final String kioskClientId;
    private final String kioskClientSecret;

    public AuthController(
            JwtService jwtService,
            @Value("${auth.admin-client-id}") String adminClientId,
            @Value("${auth.admin-client-secret}") String adminClientSecret,
            @Value("${auth.kiosk-client-id}") String kioskClientId,
            @Value("${auth.kiosk-client-secret}") String kioskClientSecret) {
        this.jwtService = jwtService;
        this.adminClientId = adminClientId;
        this.adminClientSecret = adminClientSecret;
        this.kioskClientId = kioskClientId;
        this.kioskClientSecret = kioskClientSecret;
    }

    @PostMapping("/token")
    public ResponseEntity<TokenResponse> token(@RequestBody @Valid TokenRequest request) {
        String role;
        if (request.getClientId().equals(adminClientId) && request.getClientSecret().equals(adminClientSecret)) {
            role = "ADMIN";
        } else if (request.getClientId().equals(kioskClientId) && request.getClientSecret().equals(kioskClientSecret)) {
            role = "KIOSK";
        } else {
            log.warn("Failed token request for clientId: {}", request.getClientId());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String token = jwtService.generateToken(request.getClientId(), role);
        return ResponseEntity.ok(TokenResponse.builder()
                .token(token)
                .tokenType("Bearer")
                .expiresIn(jwtService.getExpirySeconds())
                .build());
    }
}
