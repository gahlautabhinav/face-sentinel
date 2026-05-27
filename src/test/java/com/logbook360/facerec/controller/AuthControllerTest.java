package com.logbook360.facerec.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.logbook360.facerec.config.SecurityConfig;
import com.logbook360.facerec.dto.request.TokenRequest;
import com.logbook360.facerec.dto.response.TokenResponse;
import com.logbook360.facerec.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = {
    "auth.admin-client-id=test-admin",
    "auth.admin-client-secret=admin-secret",
    "auth.kiosk-client-id=test-kiosk",
    "auth.kiosk-client-secret=kiosk-secret",
})
class AuthControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @MockBean  private JwtService jwtService;

    @Test
    void returnsTokenForValidAdminCredentials() throws Exception {
        when(jwtService.generateToken("test-admin", "ADMIN")).thenReturn("admin.jwt.token");
        when(jwtService.getExpirySeconds()).thenReturn(86400L);

        TokenRequest req = new TokenRequest();
        req.setClientId("test-admin");
        req.setClientSecret("admin-secret");

        mockMvc.perform(post("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("admin.jwt.token"))
            .andExpect(jsonPath("$.tokenType").value("Bearer"))
            .andExpect(jsonPath("$.expiresIn").value(86400));
    }

    @Test
    void returnsTokenForValidKioskCredentials() throws Exception {
        when(jwtService.generateToken("test-kiosk", "KIOSK")).thenReturn("kiosk.jwt.token");
        when(jwtService.getExpirySeconds()).thenReturn(86400L);

        TokenRequest req = new TokenRequest();
        req.setClientId("test-kiosk");
        req.setClientSecret("kiosk-secret");

        mockMvc.perform(post("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("kiosk.jwt.token"));
    }

    @Test
    void returns401ForWrongSecret() throws Exception {
        TokenRequest req = new TokenRequest();
        req.setClientId("test-admin");
        req.setClientSecret("wrong-secret");

        mockMvc.perform(post("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void returns401ForUnknownClientId() throws Exception {
        TokenRequest req = new TokenRequest();
        req.setClientId("unknown-client");
        req.setClientSecret("any-secret");

        mockMvc.perform(post("/api/auth/token")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(req)))
            .andExpect(status().isUnauthorized());
    }
}
