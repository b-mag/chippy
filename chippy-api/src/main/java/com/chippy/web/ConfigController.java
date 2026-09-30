package com.chippy.web;

import com.chippy.config.SplashProperties;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ConfigController {

    private final SplashProperties splashProperties;

    public ConfigController(SplashProperties splashProperties) {
        this.splashProperties = splashProperties;
    }

    /** Overrides the static config.json when Spring is the page server. */
    @GetMapping(value = "/config.json", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Boolean> config() {
        return Map.of("splashEnabled", splashProperties.isEnabled());
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "up");
    }
}
