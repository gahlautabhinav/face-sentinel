package com.logbook360.facerec.repository;

import com.logbook360.facerec.domain.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    // Creates the tenant row under the given id. save() cannot do this: Tenant.id is a generated
    // value, so an id set by hand is ignored and the row gets a different, random id.
    @Modifying
    @Query(value = "INSERT INTO tenants (id, name, rekognition_collection_id) "
            + "VALUES (:id, :name, :collectionId) ON CONFLICT (id) DO NOTHING", nativeQuery = true)
    void insertIfAbsent(@Param("id") UUID id, @Param("name") String name,
                        @Param("collectionId") String collectionId);
}
