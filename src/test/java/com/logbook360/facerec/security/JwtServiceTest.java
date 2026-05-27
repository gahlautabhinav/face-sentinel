package com.logbook360.facerec.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService("test-secret-key-for-jwt-that-is-at-least-32chars", 24L);
    }

    @Test
    void generatedTokenIsValid() {
        String token = jwtService.generateToken("logbook360-admin", "ADMIN");
        assertThat(jwtService.isTokenValid(token)).isTrue();
    }

    @Test
    void roleExtractedCorrectly() {
        String token = jwtService.generateToken("logbook360-admin", "ADMIN");
        assertThat(jwtService.extractRole(token)).isEqualTo("ADMIN");
    }

    @Test
    void subjectExtractedCorrectly() {
        String token = jwtService.generateToken("logbook360-kiosk", "KIOSK");
        assertThat(jwtService.extractClaims(token).getSubject()).isEqualTo("logbook360-kiosk");
    }

    @Test
    void tamperedTokenIsInvalid() {
        String token = jwtService.generateToken("logbook360-admin", "ADMIN");
        assertThat(jwtService.isTokenValid(token + "tampered")).isFalse();
    }

    @Test
    void expirySecondsMatchesHours() {
        assertThat(jwtService.getExpirySeconds()).isEqualTo(86400L);
    }
}
