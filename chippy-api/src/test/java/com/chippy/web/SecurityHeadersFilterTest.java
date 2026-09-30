package com.chippy.web;

import com.chippy.config.AdsProperties;
import com.chippy.config.CoffeeProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SecurityHeadersFilterTest {

    @Test
    void basePolicyIsStrict() {
        String policy = SecurityHeadersFilter.buildContentSecurityPolicy(false, false);
        assertTrue(policy.contains("script-src 'self'"));
        assertTrue(policy.contains("frame-src 'none'"));
        assertFalse(policy.contains("googlesyndication"));
    }

    @Test
    void coffeeAndAdsWidenThePolicy() {
        String coffee = SecurityHeadersFilter.buildContentSecurityPolicy(true, false);
        assertTrue(coffee.contains("buymeacoffee.com"));
        String ads = SecurityHeadersFilter.buildContentSecurityPolicy(false, true);
        assertTrue(ads.contains("pagead2.googlesyndication.com"));
        assertTrue(ads.contains("'unsafe-inline'"));
        String both = SecurityHeadersFilter.buildContentSecurityPolicy(true, true);
        assertTrue(both.contains("ko-fi.com"));
        assertTrue(both.contains("doubleclick.net"));
    }

    @Test
    void filterSendsHstsOnHttpsAndUsesConfigFlags() throws Exception {
        CoffeeProperties coffee = new CoffeeProperties();
        coffee.setEnabled(true);
        AdsProperties ads = new AdsProperties();
        ads.setEnabled(true);
        SecurityHeadersFilter filter = new SecurityHeadersFilter(coffee, ads);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/");
        request.setSecure(true);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        assertTrue(response.getHeader("Content-Security-Policy").contains("googlesyndication"));
        assertNotNull(response.getHeader("Strict-Transport-Security"));

        MockHttpServletRequest forwarded = new MockHttpServletRequest("GET", "/");
        forwarded.addHeader("X-Forwarded-Proto", "https");
        MockHttpServletResponse forwardedResponse = new MockHttpServletResponse();
        filter.doFilter(forwarded, forwardedResponse, new MockFilterChain());
        assertNotNull(forwardedResponse.getHeader("Strict-Transport-Security"));
    }
}
