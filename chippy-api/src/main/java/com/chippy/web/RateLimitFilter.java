package com.chippy.web;

import com.chippy.audit.AuditLog;
import com.chippy.config.RateLimitProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * In-memory per-IP token buckets for API abuse resistance.
 * Fine for a single Liberty/ARM instance. Multi-replica OpenShift needs a shared store later.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MS = 60_000L;

    private final RateLimitProperties properties;
    private final AuditLog auditLog;
    private final ConcurrentHashMap<String, WindowCounter> validateBuckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, WindowCounter> apiBuckets = new ConcurrentHashMap<>();

    public RateLimitFilter(RateLimitProperties properties, AuditLog auditLog) {
        this.properties = properties;
        this.auditLog = auditLog;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null || !path.startsWith("/api/") || "/api/health".equals(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String ip = clientIp(request);
        String path = request.getRequestURI();
        boolean validate = "/api/projects/validate".equals(path) || "/api/ym/validate".equals(path);
        int limit = validate ? properties.getValidatePerMinute() : properties.getApiPerMinute();
        ConcurrentHashMap<String, WindowCounter> buckets = validate ? validateBuckets : apiBuckets;
        WindowCounter counter = buckets.compute(ip, (key, existing) -> WindowCounter.touch(existing));
        if (!counter.tryAcquire(limit)) {
            auditLog.reject(validate ? "rate-limit-validate" : "rate-limit-api", ip);
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setHeader("Retry-After", "60");
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Too many requests. Try again in a minute.\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma < 0 ? forwarded : forwarded.substring(0, comma)).trim();
        }
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote;
    }

    /** Clears buckets between tests. */
    public void clear() {
        validateBuckets.clear();
        apiBuckets.clear();
    }

    static final class WindowCounter {
        private long windowStartMs;
        private final AtomicInteger count = new AtomicInteger();

        static WindowCounter touch(WindowCounter existing) {
            long now = System.currentTimeMillis();
            if (existing == null || now - existing.windowStartMs >= WINDOW_MS) {
                WindowCounter fresh = new WindowCounter();
                fresh.windowStartMs = now;
                return fresh;
            }
            return existing;
        }

        boolean tryAcquire(int limit) {
            return count.incrementAndGet() <= limit;
        }

        int value() {
            return count.get();
        }
    }
}
