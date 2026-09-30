package com.chippy.web;

import com.chippy.config.AdsProperties;
import com.chippy.config.CoffeeProperties;
import com.chippy.config.SplashProperties;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class ConfigController {

    private final SplashProperties splashProperties;
    private final CoffeeProperties coffeeProperties;
    private final AdsProperties adsProperties;

    public ConfigController(
            SplashProperties splashProperties,
            CoffeeProperties coffeeProperties,
            AdsProperties adsProperties) {
        this.splashProperties = splashProperties;
        this.coffeeProperties = coffeeProperties;
        this.adsProperties = adsProperties;
    }

    /** Overrides the static config.json when Spring is the page server. */
    @GetMapping(value = "/config.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> config() {
        Map<String, Object> coffee = new LinkedHashMap<>();
        coffee.put("enabled", coffeeProperties.isEnabled());
        coffee.put("url", coffeeProperties.getUrl());
        coffee.put("delayMinutes", coffeeProperties.getDelayMinutes());
        coffee.put("title", coffeeProperties.getTitle());
        coffee.put("body", coffeeProperties.getBody());
        coffee.put("acceptLabel", coffeeProperties.getAcceptLabel());
        coffee.put("dismissLabel", coffeeProperties.getDismissLabel());

        Map<String, Object> ads = new LinkedHashMap<>();
        ads.put("enabled", adsProperties.isEnabled());
        ads.put("provider", adsProperties.getProvider());
        ads.put("clientId", adsProperties.getClientId());
        ads.put("slotId", adsProperties.getSlotId());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("splashEnabled", splashProperties.isEnabled());
        body.put("coffee", coffee);
        body.put("ads", ads);
        return body;
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "up");
    }
}
