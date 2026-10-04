package com.logbook360.facerec.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class LivenessIdentifyRequest {
    @NotNull
    @NotBlank
    private String sessionId;

    // Optional kiosk frame, base64 in JSON. Only used if it shows the person who passed liveness.
    private byte[] frameImage;
}
