package com.logbook360.facerec.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class LivenessEnrollRequest {
    @NotNull @NotBlank private String sessionId;
    @NotNull @NotBlank private String visitorName;
    private String email;
    private String mobile;
}
