package com.logbook360.facerec.dto.response;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class TokenResponse {
    private String token;
    private String tokenType;
    private long expiresIn;
}
