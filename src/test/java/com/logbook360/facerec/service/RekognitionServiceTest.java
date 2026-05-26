package com.logbook360.facerec.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.rekognition.model.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RekognitionServiceTest {

    @Mock
    private RekognitionClient rekognitionClient;

    private RekognitionService rekognitionService;

    @BeforeEach
    void setUp() {
        rekognitionService = new RekognitionService(rekognitionClient);
    }

    @Test
    void createCollectionWhenNotExists() {
        when(rekognitionClient.describeCollection(any(DescribeCollectionRequest.class)))
            .thenThrow(ResourceNotFoundException.builder().message("not found").build());
        when(rekognitionClient.createCollection(any(CreateCollectionRequest.class)))
            .thenReturn(CreateCollectionResponse.builder().collectionArn("arn:test").build());

        rekognitionService.createCollectionIfNotExists("logbook360-test-tenant");

        verify(rekognitionClient).createCollection(any(CreateCollectionRequest.class));
    }

    @Test
    void skipsCreateCollectionWhenAlreadyExists() {
        when(rekognitionClient.describeCollection(any(DescribeCollectionRequest.class)))
            .thenReturn(DescribeCollectionResponse.builder().build());

        rekognitionService.createCollectionIfNotExists("logbook360-test-tenant");

        verify(rekognitionClient, never()).createCollection(any(CreateCollectionRequest.class));
    }

    @Test
    void searchFacesByImageReturnsMatchList() {
        FaceMatch match = FaceMatch.builder()
            .similarity(97.5f)
            .face(Face.builder().faceId("face-123").build())
            .build();
        when(rekognitionClient.searchFacesByImage(any(SearchFacesByImageRequest.class)))
            .thenReturn(SearchFacesByImageResponse.builder().faceMatches(match).build());

        SearchFacesByImageResponse response =
            rekognitionService.searchFacesByImage("collection-1", new byte[]{1, 2, 3}, 90.0f);

        assertThat(response.faceMatches()).hasSize(1);
        assertThat(response.faceMatches().get(0).similarity()).isEqualTo(97.5f);
    }

    @Test
    void deleteFaceCallsDeleteFaces() {
        when(rekognitionClient.deleteFaces(any(DeleteFacesRequest.class)))
            .thenReturn(DeleteFacesResponse.builder().build());

        rekognitionService.deleteFace("collection-1", "face-123");

        verify(rekognitionClient).deleteFaces(any(DeleteFacesRequest.class));
    }
}
