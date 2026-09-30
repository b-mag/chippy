package com.chippy.upload;

import com.chippy.audit.AuditLog;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;
import java.util.Map;

@RestController
public class UploadController {

    private final AuditLog auditLog;

    public UploadController(AuditLog auditLog) {
        this.auditLog = auditLog;
    }

    @PostMapping(value = "/api/projects/validate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> validateProject(@RequestParam("file") MultipartFile file) throws Exception {
        byte[] raw = file.getBytes();
        try {
            byte[] clean = ProjectValidator.reparse(raw);
            auditLog.accept("project", clean.length);
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(clean);
        } catch (UploadRejectedException exception) {
            auditLog.reject("project", exception.getMessage());
            throw exception;
        }
    }

    @PostMapping(value = "/api/ym/validate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, String> validateYm(@RequestParam("file") MultipartFile file) throws Exception {
        byte[] raw = file.getBytes();
        try {
            byte[] clean = YmValidator.canonicalize(raw);
            auditLog.accept("ym", clean.length);
            return Map.of("ymBase64", Base64.getEncoder().encodeToString(clean));
        } catch (UploadRejectedException exception) {
            auditLog.reject("ym", exception.getMessage());
            throw exception;
        }
    }

    @ExceptionHandler(UploadRejectedException.class)
    public ResponseEntity<Map<String, String>> rejected(UploadRejectedException exception) {
        return ResponseEntity.badRequest().body(Map.of("error", exception.getMessage()));
    }
}
