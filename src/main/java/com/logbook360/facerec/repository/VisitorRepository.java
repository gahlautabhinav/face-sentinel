package com.logbook360.facerec.repository;

import com.logbook360.facerec.domain.Visitor;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface VisitorRepository extends JpaRepository<Visitor, UUID> {}
