package com.chippy.web;

import com.chippy.audit.AuditLog;
import com.chippy.config.RateLimitProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RateLimitFilterTest {

    @Test
    void validateEndpointReturns429AfterLimit() throws Exception {
        RateLimitProperties properties = new RateLimitProperties();
        properties.setValidatePerMinute(2);
        properties.setApiPerMinute(100);
        RateLimitFilter filter = new RateLimitFilter(properties, new AuditLog());
        filter.clear();

        for (int i = 0; i < 2; i++) {
            MockHttpServletResponse ok = new MockHttpServletResponse();
            filter.doFilter(request("/api/projects/validate", "1.2.3.4"), ok, new MockFilterChain());
            assertEquals(200, ok.getStatus());
        }
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(request("/api/projects/validate", "1.2.3.4"), blocked, new MockFilterChain());
        assertEquals(429, blocked.getStatus());
        assertEquals("60", blocked.getHeader("Retry-After"));
        assertTrue(blocked.getContentAsString().contains("Too many requests"));
    }

    @Test
    void apiBucketIsSeparateFromValidate() throws Exception {
        RateLimitProperties properties = new RateLimitProperties();
        properties.setValidatePerMinute(100);
        properties.setApiPerMinute(1);
        RateLimitFilter filter = new RateLimitFilter(properties, new AuditLog());
        filter.clear();
        MockHttpServletResponse first = new MockHttpServletResponse();
        filter.doFilter(request("/api/other", "9.9.9.9"), first, new MockFilterChain());
        assertEquals(200, first.getStatus());
        MockHttpServletResponse second = new MockHttpServletResponse();
        filter.doFilter(request("/api/other", "9.9.9.9"), second, new MockFilterChain());
        assertEquals(429, second.getStatus());
    }

    @Test
    void shouldNotFilterHealthAndNonApi() {
        RateLimitFilter filter = new RateLimitFilter(new RateLimitProperties(), new AuditLog());
        assertTrue(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/api/health")));
        assertTrue(filter.shouldNotFilter(new MockHttpServletRequest("GET", "/index.html")));
        MockHttpServletRequest nullPath = new MockHttpServletRequest();
        nullPath.setRequestURI(null);
        assertTrue(filter.shouldNotFilter(nullPath));
        assertFalse(filter.shouldNotFilter(new MockHttpServletRequest("POST", "/api/ym/validate")));
    }

    @Test
    void clientIpFallbacks() {
        MockHttpServletRequest single = new MockHttpServletRequest("GET", "/api/x");
        single.addHeader("X-Forwarded-For", "10.0.0.8");
        assertEquals("10.0.0.8", RateLimitFilter.clientIp(single));

        MockHttpServletRequest multi = new MockHttpServletRequest("GET", "/api/x");
        multi.addHeader("X-Forwarded-For", "10.0.0.8, 10.0.0.9");
        assertEquals("10.0.0.8", RateLimitFilter.clientIp(multi));

        MockHttpServletRequest blankForward = new MockHttpServletRequest("GET", "/api/x");
        blankForward.addHeader("X-Forwarded-For", "  ");
        blankForward.setRemoteAddr("7.7.7.7");
        assertEquals("7.7.7.7", RateLimitFilter.clientIp(blankForward));

        MockHttpServletRequest unknown = new MockHttpServletRequest("GET", "/api/x");
        unknown.setRemoteAddr("");
        assertEquals("unknown", RateLimitFilter.clientIp(unknown));
    }

    private static MockHttpServletRequest request(String path, String ip) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
        request.setRemoteAddr(ip);
        return request;
    }
}
