package com.logbook360.facerec.repository;

import com.logbook360.facerec.domain.RecognitionLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface RecognitionLogRepository extends JpaRepository<RecognitionLog, UUID> {}
