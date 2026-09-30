package com.chippy;

import com.chippy.audit.AuditLog;
import com.chippy.security.PermitAllAuthorization;
import com.chippy.upload.ProjectValidator;
import com.chippy.upload.UploadRejectedException;
import com.chippy.upload.YmValidator;
import com.chippy.web.RateLimitFilter;
import com.chippy.web.SecurityHeadersFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ChippyApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @BeforeEach
    void clearRateLimits() {
        rateLimitFilter.clear();
    }

    @Test
    void securityHeadersArePresent() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy",
                        SecurityHeadersFilter.buildContentSecurityPolicy(false, false)))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void configJsonExposesDisabledSupportFlags() throws Exception {
        mockMvc.perform(get("/config.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.splashEnabled").value(true))
                .andExpect(jsonPath("$.coffee.enabled").value(false))
                .andExpect(jsonPath("$.ads.enabled").value(false))
                .andExpect(jsonPath("$.coffee.delayMinutes").value(5));
    }

    @Test
    void spaRoutesForward() throws Exception {
        mockMvc.perform(get("/listen")).andExpect(status().isOk());
    }

    @Test
    void unknownProjectFieldIsRejected() {
        String json = "{\"version\":1,\"name\":\"A\",\"chip\":\"gameboy\",\"tempo\":120,\"order\":[\"pat-1\"],\"patterns\":[{}],\"instruments\":[{}],\"armedInstrumentId\":\"ins-1\",\"virus\":true}";
        assertThrows(UploadRejectedException.class, () -> ProjectValidator.reparse(json.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void projectRoundTripDropsNothingRequired() throws Exception {
        String json = "{\"version\":1,\"name\":\"A\",\"chip\":\"vectrex\",\"tempo\":120,\"order\":[\"pat-1\"],\"patterns\":[{\"id\":\"pat-1\"}],\"instruments\":[{\"id\":\"ins-1\"}],\"armedInstrumentId\":\"ins-1\"}";
        byte[] clean = ProjectValidator.reparse(json.getBytes(StandardCharsets.UTF_8));
        MockMultipartFile file = new MockMultipartFile("file", "song.chippy.json", "application/json", clean);
        String body = mockMvc.perform(multipart("/api/projects/validate").file(file))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("\"chip\":\"vectrex\""));
    }

    @Test
    void ymValidateRejectsGarbage() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "bad.ym", "application/octet-stream", new byte[] {0x7f, 0x45, 0x4c, 0x46});
        mockMvc.perform(multipart("/api/ym/validate").file(file))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ymValidateAcceptsYm6() throws Exception {
        byte[] ym = "YM6!LeOnArD!".getBytes(StandardCharsets.US_ASCII);
        MockMultipartFile file = new MockMultipartFile("file", "song.ym", "application/octet-stream", ym);
        mockMvc.perform(multipart("/api/ym/validate").file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ymBase64").isNotEmpty());
    }

    @Test
    void projectValidateRejectsUnknownFieldViaApi() throws Exception {
        String json = "{\"version\":1,\"name\":\"A\",\"chip\":\"gameboy\",\"tempo\":120,\"order\":[\"pat-1\"],\"patterns\":[{}],\"instruments\":[{}],\"armedInstrumentId\":\"ins-1\",\"virus\":true}";
        MockMultipartFile file = new MockMultipartFile("file", "song.chippy.json", "application/json", json.getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/projects/validate").file(file))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ymRejectsAnExecutableHeader() {
        byte[] elf = new byte[] {0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0};
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(elf));
    }

    @Test
    void ymAcceptsARealHeaderAndAStoredArchive() {
        byte[] ym = "YM6!LeOnArD!".getBytes(StandardCharsets.US_ASCII);
        byte[] clean = YmValidator.canonicalize(ym);
        assertEquals("YM6!", new String(clean, 0, 4, StandardCharsets.US_ASCII));
        byte[] wrapped = storedLha(ym);
        byte[] unpacked = YmValidator.canonicalize(wrapped);
        assertEquals("YM6!", new String(unpacked, 0, 4, StandardCharsets.US_ASCII));
    }

    @Test
    void oversizedArchiveClaimIsRejected() {
        byte[] huge = storedLha(new byte[] {'Y', 'M', '6', '!'});
        huge[11] = (byte) 0xff;
        huge[12] = (byte) 0xff;
        huge[13] = (byte) 0xff;
        huge[14] = 0x01;
        assertThrows(UploadRejectedException.class, () -> YmValidator.canonicalize(huge));
    }

    @Test
    void permitAllAndAuditLogSmoke() {
        assertTrue(new PermitAllAuthorization().canAccess("startup"));
        AuditLog log = new AuditLog();
        log.accept("project", 12);
        log.reject("project", "bad");
        log.export("wav");
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
