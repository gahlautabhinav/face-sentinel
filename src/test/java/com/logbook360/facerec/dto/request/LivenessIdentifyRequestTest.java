package com.logbook360.facerec.dto.request;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

class LivenessIdentifyRequestTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void frameImageIsDecodedFromBase64() throws Exception {
        byte[] jpegHeader = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};
        String json = "{\"sessionId\":\"s1\",\"frameImage\":\""
                + Base64.getEncoder().encodeToString(jpegHeader) + "\"}";

        LivenessIdentifyRequest request = mapper.readValue(json, LivenessIdentifyRequest.class);

        assertThat(request.getSessionId()).isEqualTo("s1");
        assertThat(request.getFrameImage()).isEqualTo(jpegHeader);
    }

    @Test
    void frameImageIsOptional() throws Exception {
        LivenessIdentifyRequest request =
                mapper.readValue("{\"sessionId\":\"s1\"}", LivenessIdentifyRequest.class);

        assertThat(request.getFrameImage()).isNull();
    }
}
