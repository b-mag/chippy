package com.chippy.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PropertiesTest {

    @Test
    void coffeeDefaultsAndClamps() {
        CoffeeProperties coffee = new CoffeeProperties();
        assertFalse(coffee.isEnabled());
        coffee.setEnabled(true);
        coffee.setUrl(null);
        coffee.setDelayMinutes(0);
        coffee.setTitle(null);
        coffee.setBody(null);
        coffee.setAcceptLabel(null);
        coffee.setDismissLabel(null);
        assertEquals("", coffee.getUrl());
        assertEquals(1, coffee.getDelayMinutes());
        assertEquals("", coffee.getTitle());
        assertEquals("", coffee.getBody());
        assertEquals("Alright!", coffee.getAcceptLabel());
        assertEquals("Maybe Later", coffee.getDismissLabel());
        assertTrue(coffee.isEnabled());
    }

    @Test
    void adsDefaults() {
        AdsProperties ads = new AdsProperties();
        assertFalse(ads.isEnabled());
        ads.setProvider(null);
        ads.setClientId(null);
        ads.setSlotId(null);
        assertEquals("adsense", ads.getProvider());
        assertEquals("", ads.getClientId());
        assertEquals("", ads.getSlotId());
        ads.setProvider("  ");
        assertEquals("adsense", ads.getProvider());
        ads.setEnabled(true);
        ads.setClientId("ca-pub-1");
        ads.setSlotId("9");
        assertEquals("ca-pub-1", ads.getClientId());
        assertEquals("9", ads.getSlotId());
    }

    @Test
    void rateLimitClamps() {
        RateLimitProperties limit = new RateLimitProperties();
        limit.setValidatePerMinute(0);
        limit.setApiPerMinute(0);
        assertEquals(1, limit.getValidatePerMinute());
        assertEquals(1, limit.getApiPerMinute());
    }

    @Test
    void splashToggle() {
        SplashProperties splash = new SplashProperties();
        assertTrue(splash.isEnabled());
        splash.setEnabled(false);
        assertFalse(splash.isEnabled());
    }
}
