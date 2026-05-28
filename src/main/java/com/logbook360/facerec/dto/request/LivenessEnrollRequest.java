package com.logbook360.facerec.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
public class LivenessEnrollRequest {
    @NotNull private UUID visitorId;
    @NotNull private String sessionId;
}
