package com.chippy.upload;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

/**
 * Accepts a Chippy project only when every field is known, then writes it
 * back out so the browser never keeps the raw upload.
 */
public final class ProjectValidator {

    public static final int MAX_BYTES = 2_000_000;

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    private ProjectValidator() {
    }

    public static byte[] reparse(byte[] body) {
        if (body.length == 0 || body.length > MAX_BYTES) {
            throw new UploadRejectedException("Project file is empty or larger than 2 MB.");
        }
        try {
            ProjectDocument document = MAPPER.readValue(body, ProjectDocument.class);
            if (document.version() != 1) {
                throw new UploadRejectedException("Unsupported project version.");
            }
            if (!"gameboy".equals(document.chip()) && !"vectrex".equals(document.chip())) {
                throw new UploadRejectedException("Unknown chip.");
            }
            if (document.patterns() == null || document.patterns().isEmpty()) {
                throw new UploadRejectedException("The project has no patterns.");
            }
            if (document.instruments() == null || document.instruments().isEmpty()) {
                throw new UploadRejectedException("The project has no instruments.");
            }
            return MAPPER.writeValueAsBytes(document);
        } catch (UploadRejectedException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new UploadRejectedException("The project was rejected.");
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record ProjectDocument(
            int version,
            String name,
            String chip,
            int tempo,
            List<String> order,
            List<Object> patterns,
            List<Object> instruments,
            String armedInstrumentId
    ) {
    }
}
