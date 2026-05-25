package com.logbook360.facerec;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import com.logbook360.facerec.config.FaceRecognitionProperties;

@SpringBootApplication
@EnableConfigurationProperties(FaceRecognitionProperties.class)
public class FaceRecognitionApplication {
    public static void main(String[] args) {
        SpringApplication.run(FaceRecognitionApplication.class, args);
    }
}
