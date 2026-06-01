package com.logbook360.facerec.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.logbook360.facerec.domain.Visitor;
import com.logbook360.facerec.domain.VisitorFace;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Builder
public class EnrollmentDto {

    private UUID visitorId;
    private String rekognitionFaceId;
    private String name;
    private String email;
    private String phone;
    private Double confidence;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime enrolledAt;

    public static EnrollmentDto from(VisitorFace vf, Visitor v) {
        return EnrollmentDto.builder()
                .visitorId(vf.getVisitorId())
                .rekognitionFaceId(vf.getRekognitionFaceId())
                .name(v != null ? v.getName() : "Unknown")
                .email(v != null ? v.getEmail() : null)
                .phone(v != null ? v.getPhone() : null)
                .confidence(vf.getConfidence())
                .enrolledAt(vf.getEnrolledAt())
                .build();
    }
}
