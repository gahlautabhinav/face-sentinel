package com.logbook360.facerec.dto.response;

import lombok.Builder;
import lombok.Getter;

import java.util.UUID;

@Getter
@Builder
public class FaceEnrollResponse {
    private UUID visitorId;
    private String rekognitionFaceId;
    private Double confidence;
    private String message;
}
