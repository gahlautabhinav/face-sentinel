package com.logbook360.facerec.repository;

import com.logbook360.facerec.domain.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {}
