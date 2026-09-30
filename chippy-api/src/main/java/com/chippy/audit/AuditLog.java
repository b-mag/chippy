package com.chippy.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Structured accept and reject events. No song bytes are written here. */
@Component
public class AuditLog {

    private static final Logger LOG = LoggerFactory.getLogger(AuditLog.class);

    public void accept(String kind, int bytes) {
        LOG.info("audit event=upload.accept kind={} bytes={}", kind, bytes);
    }

    public void reject(String kind, String reason) {
        LOG.info("audit event=upload.reject kind={} reason={}", kind, reason);
    }

    public void export(String kind) {
        LOG.info("audit event=export kind={}", kind);
    }
}
