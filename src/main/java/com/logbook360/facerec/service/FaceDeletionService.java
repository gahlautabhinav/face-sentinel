package com.logbook360.facerec.service;

import com.logbook360.facerec.domain.RecognitionLog;
import com.logbook360.facerec.domain.VisitorFace;
import com.logbook360.facerec.exception.FaceNotFoundException;
import com.logbook360.facerec.repository.RecognitionLogRepository;
import com.logbook360.facerec.repository.VisitorFaceRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Slf4j
public class FaceDeletionService {

    private final RekognitionService rekognitionService;
    private final S3Service s3Service;
    private final VisitorFaceRepository visitorFaceRepository;
    private final RecognitionLogRepository recognitionLogRepository;
    private final String collectionPrefix;

    public FaceDeletionService(
            RekognitionService rekognitionService,
            S3Service s3Service,
            VisitorFaceRepository visitorFaceRepository,
            RecognitionLogRepository recognitionLogRepository,
            @Value("${aws.rekognition.collection-prefix}") String collectionPrefix) {
        this.rekognitionService = rekognitionService;
        this.s3Service = s3Service;
        this.visitorFaceRepository = visitorFaceRepository;
        this.recognitionLogRepository = recognitionLogRepository;
        this.collectionPrefix = collectionPrefix;
    }

    @Transactional
    public void deleteFace(UUID tenantId, UUID visitorId) {
        List<VisitorFace> faces = visitorFaceRepository.findByVisitorIdAndTenantId(visitorId, tenantId);

        if (faces.isEmpty()) {
            throw new FaceNotFoundException("No enrolled faces found for visitor: " + visitorId);
        }

        String collectionId = collectionPrefix + "-" + tenantId;

        for (VisitorFace face : faces) {
            rekognitionService.deleteFace(collectionId, face.getRekognitionFaceId());
            s3Service.deleteObject(face.getS3ImageKey());
        }

        visitorFaceRepository.deleteByVisitorIdAndTenantId(visitorId, tenantId);

        RecognitionLog logEntry = new RecognitionLog();
        logEntry.setTenantId(tenantId);
        logEntry.setVisitorId(visitorId);
        logEntry.setAction(RecognitionLog.RecognitionAction.DELETE);
        logEntry.setStatus(RecognitionLog.RecognitionStatus.SUCCESS);
        recognitionLogRepository.save(logEntry);
    }
}
