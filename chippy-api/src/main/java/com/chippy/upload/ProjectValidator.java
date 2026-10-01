package com.chippy.upload;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

/**
 * Accepts a Chippy project only when every field is known, then writes it
 * back out so the browser never keeps the raw upload. Legacy v1 flat songs
 * are migrated to the v2 project shape.
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
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = MAPPER.readValue(body, Map.class);
            Object version = raw.get("version");
            if (Integer.valueOf(1).equals(version) || Integer.valueOf(1).equals(asInt(version))) {
                assertOnlyKeys(raw, "version", "name", "chip", "tempo", "order", "patterns", "instruments", "armedInstrumentId");
                ProjectDocumentV1 legacy = MAPPER.convertValue(raw, ProjectDocumentV1.class);
                validateV1(legacy);
                ProjectDocumentV2 migrated = migrateV1(legacy);
                return MAPPER.writeValueAsBytes(migrated);
            }
            if (Integer.valueOf(2).equals(version) || Integer.valueOf(2).equals(asInt(version))) {
                assertOnlyKeys(raw, "version", "name", "chip", "instruments", "armedInstrumentId", "songs", "activeSongId");
                ProjectDocumentV2 document = MAPPER.convertValue(raw, ProjectDocumentV2.class);
                validateV2(document);
                return MAPPER.writeValueAsBytes(document);
            }
            throw new UploadRejectedException("Unsupported project version.");
        } catch (UploadRejectedException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new UploadRejectedException("The project was rejected.");
        }
    }

    private static void assertOnlyKeys(Map<String, Object> raw, String... allowed) {
        java.util.Set<String> allowedKeys = java.util.Set.of(allowed);
        for (String key : raw.keySet()) {
            if (!allowedKeys.contains(key)) {
                throw new UploadRejectedException("Unknown project field \"" + key + "\".");
            }
        }
    }

    private static Integer asInt(Object value) {
        if (value instanceof Integer integer) {
            return integer;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return null;
    }

    private static void validateChip(String chip) {
        if (!"gameboy".equals(chip) && !"vectrex".equals(chip) && !"c64".equals(chip)
                && !"atarist".equals(chip) && !"nes".equals(chip)) {
            throw new UploadRejectedException("Unknown chip.");
        }
    }

    private static void validateV1(ProjectDocumentV1 document) {
        validateChip(document.chip());
        if (document.patterns() == null || document.patterns().isEmpty()) {
            throw new UploadRejectedException("The project has no patterns.");
        }
        if (document.instruments() == null || document.instruments().isEmpty()) {
            throw new UploadRejectedException("The project has no instruments.");
        }
    }

    private static void validateV2(ProjectDocumentV2 document) {
        validateChip(document.chip());
        if (document.instruments() == null || document.instruments().isEmpty()) {
            throw new UploadRejectedException("The project has no instruments.");
        }
        if (document.songs() == null || document.songs().isEmpty()) {
            throw new UploadRejectedException("The project has no songs.");
        }
        for (SongBodyDocument song : document.songs()) {
            if (song.patterns() == null || song.patterns().isEmpty()) {
                throw new UploadRejectedException("The project has no patterns.");
            }
        }
    }

    private static ProjectDocumentV2 migrateV1(ProjectDocumentV1 legacy) {
        SongBodyDocument song = new SongBodyDocument(
                "song-1",
                legacy.name() == null || legacy.name().isBlank() ? "Song 1" : legacy.name(),
                legacy.tempo(),
                legacy.order(),
                legacy.patterns()
        );
        return new ProjectDocumentV2(
                2,
                legacy.name(),
                legacy.chip(),
                legacy.instruments(),
                legacy.armedInstrumentId(),
                List.of(song),
                "song-1"
        );
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record ProjectDocumentV1(
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

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record SongBodyDocument(
            String id,
            String name,
            int tempo,
            List<String> order,
            List<Object> patterns
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record ProjectDocumentV2(
            int version,
            String name,
            String chip,
            List<Object> instruments,
            String armedInstrumentId,
            List<SongBodyDocument> songs,
            String activeSongId
    ) {
    }
}
