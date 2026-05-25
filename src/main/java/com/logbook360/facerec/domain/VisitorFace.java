package com.logbook360.facerec.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "visitor_faces")
@Getter
@Setter
public class VisitorFace {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "visitor_id", nullable = false)
    private UUID visitorId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "rekognition_face_id", nullable = false)
    private String rekognitionFaceId;

    @Column(name = "s3_image_key", nullable = false)
    private String s3ImageKey;

    private Double confidence;

    @CreationTimestamp
    private LocalDateTime enrolledAt;
}
