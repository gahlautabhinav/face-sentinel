package com.logbook360.facerec.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

// Public, credential-free "is the server up" answer for uptime monitors and keep-alive pings.
// Reveals nothing and touches neither the database nor AWS.
@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }
}
