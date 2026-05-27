package com.logbook360.facerec.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class FaceVerifyResponse {
    private boolean verified;
    private boolean positionError;
    private UUID visitorId;
    private String visitorName;
    private Double similarity;
    private String message;
}
