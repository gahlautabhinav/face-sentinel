package com.logbook360.facerec.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class TokenRequest {
    @NotBlank
    private String clientId;
    @NotBlank
    private String clientSecret;
}
