package com.chippy.upload;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ValidatorsTest {

    @Test
    void projectRejectsEmptyUnknownChipAndMissingCollections() {
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse(new byte[0]));
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse(oversized()));
        String badChip = "{\"version\":1,\"name\":\"A\",\"chip\":\"zx\",\"tempo\":120,\"order\":[\"pat-1\"],\"patterns\":[{\"id\":\"pat-1\"}],\"instruments\":[{\"id\":\"ins-1\"}],\"armedInstrumentId\":\"ins-1\"}";
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse(badChip.getBytes(StandardCharsets.UTF_8)));
        String badVersion = badChip.replace("\"version\":1", "\"version\":2").replace("zx", "gameboy");
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse(badVersion.getBytes(StandardCharsets.UTF_8)));
        String noPatterns = "{\"version\":1,\"name\":\"A\",\"chip\":\"gameboy\",\"tempo\":120,\"order\":[],\"patterns\":[],\"instruments\":[{\"id\":\"ins-1\"}],\"armedInstrumentId\":\"ins-1\"}";
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse(noPatterns.getBytes(StandardCharsets.UTF_8)));
        String noInstruments = "{\"version\":1,\"name\":\"A\",\"chip\":\"gameboy\",\"tempo\":120,\"order\":[\"pat-1\"],\"patterns\":[{\"id\":\"pat-1\"}],\"instruments\":[],\"armedInstrumentId\":\"ins-1\"}";
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse(noInstruments.getBytes(StandardCharsets.UTF_8)));
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse("not-json".getBytes(StandardCharsets.UTF_8)));
        String v3 = "{\"version\":3,\"name\":\"A\",\"chip\":\"nes\",\"instruments\":[{\"id\":\"ins-1\"}],\"armedInstrumentId\":\"ins-1\",\"songs\":[{\"id\":\"song-1\",\"name\":\"Song 1\",\"tempo\":120,\"order\":[\"pat-1\"],\"patterns\":[{\"id\":\"pat-1\"}]}],\"activeSongId\":\"song-1\",\"customPresets\":[]}";
        byte[] rewritten = ProjectValidator.reparse(v3.getBytes(StandardCharsets.UTF_8));
        assertTrue(new String(rewritten, StandardCharsets.UTF_8).contains("\"version\":4"));
        String v2 = v3.replace("\"version\":3", "\"version\":2").replace(",\"customPresets\":[]", "");
        byte[] migrated = ProjectValidator.reparse(v2.getBytes(StandardCharsets.UTF_8));
        String migratedText = new String(migrated, StandardCharsets.UTF_8);
        assertTrue(migratedText.contains("\"version\":4"));
        assertTrue(migratedText.contains("customPresets"));
        String v4 = v3.replace("\"version\":3", "\"version\":4");
        byte[] kept = ProjectValidator.reparse(v4.getBytes(StandardCharsets.UTF_8));
        assertTrue(new String(kept, StandardCharsets.UTF_8).contains("\"version\":4"));
    }

    @Test
    void ymRejectsEmptyMissingCheckAndCompressedLha() {
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(new byte[0]));
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(new byte[YmValidator.MAX_UPLOAD + 1]));
        byte[] noCheck = "YM6!........".getBytes(StandardCharsets.US_ASCII);
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(noCheck));
        byte[] ym = "YM5!LeOnArD!".getBytes(StandardCharsets.US_ASCII);
        assertEquals("YM5!", new String(YmValidator.canonicalize(ym), 0, 4, StandardCharsets.US_ASCII));
        byte[] lh5 = storedLha(ym);
        lh5[5] = '5';
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(lh5));
        assertTrue(YmValidator.isYmMagic(ym));
        assertFalse(YmValidator.isYmMagic(new byte[] {'Y', 'M'}));
        byte[] truncatedLha = storedLha(ym);
        truncatedLha[0] = (byte) 100;
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(truncatedLha));
        byte[] shortClaim = storedLha(ym);
        writeUint32(shortClaim, 7, ym.length + 50);
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(shortClaim));
    }

    private static byte[] oversized() {
        return new byte[ProjectValidator.MAX_BYTES + 1];
    }

    private static byte[] storedLha(byte[] payload) {
        int headerBody = 22;
        byte[] archive = new byte[2 + headerBody + payload.length];
        archive[0] = (byte) headerBody;
        archive[2] = '-';
        archive[3] = 'l';
        archive[4] = 'h';
        archive[5] = '0';
        archive[6] = '-';
        writeUint32(archive, 7, payload.length);
        writeUint32(archive, 11, payload.length);
        archive[21] = 1;
        archive[22] = 'a';
        System.arraycopy(payload, 0, archive, 2 + headerBody, payload.length);
        return archive;
    }

    private static void writeUint32(byte[] data, int offset, int value) {
        data[offset] = (byte) (value & 0xff);
        data[offset + 1] = (byte) ((value >> 8) & 0xff);
        data[offset + 2] = (byte) ((value >> 16) & 0xff);
        data[offset + 3] = (byte) ((value >> 24) & 0xff);
    }
}
