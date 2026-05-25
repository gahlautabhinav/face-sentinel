package com.logbook360.facerec.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "face-recognition")
@Getter
@Setter
public class FaceRecognitionProperties {

    private boolean enabled = true;
    private Liveness liveness = new Liveness();

    @Getter
    @Setter
    public static class Liveness {
        private boolean enabled = false;
    }
}
