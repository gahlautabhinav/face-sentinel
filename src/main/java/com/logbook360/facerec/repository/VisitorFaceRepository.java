package com.logbook360.facerec.repository;

import com.logbook360.facerec.domain.VisitorFace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VisitorFaceRepository extends JpaRepository<VisitorFace, UUID> {

    boolean existsByVisitorIdAndTenantId(UUID visitorId, UUID tenantId);

    Optional<VisitorFace> findByRekognitionFaceIdAndTenantId(String rekognitionFaceId, UUID tenantId);

    List<VisitorFace> findByVisitorIdAndTenantId(UUID visitorId, UUID tenantId);

    @Modifying
    @Query("DELETE FROM VisitorFace vf WHERE vf.visitorId = :visitorId AND vf.tenantId = :tenantId")
    void deleteByVisitorIdAndTenantId(UUID visitorId, UUID tenantId);
}
