package com.logbook360.facerec.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.rekognition.model.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class RekognitionService {

    private final RekognitionClient rekognitionClient;

    public void createCollectionIfNotExists(String collectionId) {
        try {
            rekognitionClient.describeCollection(DescribeCollectionRequest.builder()
                    .collectionId(collectionId).build());
            log.debug("Collection exists: {}", collectionId);
        } catch (ResourceNotFoundException e) {
            rekognitionClient.createCollection(CreateCollectionRequest.builder()
                    .collectionId(collectionId).build());
            log.info("Created Rekognition collection: {}", collectionId);
        }
    }

    public IndexFacesResponse indexFace(String collectionId, String s3Bucket, String s3Key, String externalImageId) {
        return rekognitionClient.indexFaces(IndexFacesRequest.builder()
                .collectionId(collectionId)
                .image(Image.builder()
                        .s3Object(S3Object.builder().bucket(s3Bucket).name(s3Key).build())
                        .build())
                .externalImageId(externalImageId)
                .qualityFilter(QualityFilter.AUTO)
                .maxFaces(1)
                .detectionAttributes(Attribute.DEFAULT)
                .build());
    }

    public SearchFacesByImageResponse searchFacesByImage(String collectionId, byte[] imageBytes, float threshold) {
        return rekognitionClient.searchFacesByImage(SearchFacesByImageRequest.builder()
                .collectionId(collectionId)
                .image(Image.builder().bytes(SdkBytes.fromByteArray(imageBytes)).build())
                .faceMatchThreshold(threshold)
                .maxFaces(1)
                .build());
    }

    public DetectFacesResponse detectFaces(byte[] imageBytes) {
        return rekognitionClient.detectFaces(DetectFacesRequest.builder()
                .image(Image.builder().bytes(SdkBytes.fromByteArray(imageBytes)).build())
                .attributes(Attribute.ALL)
                .build());
    }

    public void deleteFace(String collectionId, String faceId) {
        rekognitionClient.deleteFaces(DeleteFacesRequest.builder()
                .collectionId(collectionId)
                .faceIds(faceId)
                .build());
        log.info("Deleted face {} from collection {}", faceId, collectionId);
    }

    public CreateFaceLivenessSessionResponse createFaceLivenessSession() {
        return rekognitionClient.createFaceLivenessSession(
                CreateFaceLivenessSessionRequest.builder().build());
    }

    public GetFaceLivenessSessionResultsResponse getFaceLivenessSessionResults(String sessionId) {
        return rekognitionClient.getFaceLivenessSessionResults(
                GetFaceLivenessSessionResultsRequest.builder()
                        .sessionId(sessionId)
                        .build());
    }
}
