package com.chippy.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "chippy.rate-limit")
public class RateLimitProperties {

    /** Max validate uploads per IP per minute. */
    private int validatePerMinute = 30;
    /** Max non-health API requests per IP per minute. */
    private int apiPerMinute = 120;

    public int getValidatePerMinute() {
        return validatePerMinute;
    }

    public void setValidatePerMinute(int validatePerMinute) {
        this.validatePerMinute = Math.max(1, validatePerMinute);
    }

    public int getApiPerMinute() {
        return apiPerMinute;
    }

    public void setApiPerMinute(int apiPerMinute) {
        this.apiPerMinute = Math.max(1, apiPerMinute);
    }
}
