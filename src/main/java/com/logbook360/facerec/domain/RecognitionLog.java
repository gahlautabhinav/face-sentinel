package com.logbook360.facerec.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "recognition_logs")
@Getter
@Setter
public class RecognitionLog {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "visitor_id")
    private UUID visitorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecognitionAction action;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecognitionStatus status;

    private Double similarity;

    @Column(name = "s3_image_key")
    private String s3ImageKey;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "ip_address")
    private String ipAddress;

    @CreationTimestamp
    private LocalDateTime createdAt;

    public enum RecognitionAction { ENROLL, IDENTIFY, DELETE }
    public enum RecognitionStatus { SUCCESS, FAILURE, NO_MATCH }
}
