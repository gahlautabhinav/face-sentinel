package com.logbook360.facerec.dto.response;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class LivenessResultResponse {
    private boolean passed;
    private float confidence;
}
