package com.chippy.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "chippy.presets")
public class PresetsProperties {

    /** When true, premium instrument packs are unlocked (local/dev default). */
    private boolean unlockAll = false;

    public boolean isUnlockAll() {
        return unlockAll;
    }

    public void setUnlockAll(boolean unlockAll) {
        this.unlockAll = unlockAll;
    }
}
