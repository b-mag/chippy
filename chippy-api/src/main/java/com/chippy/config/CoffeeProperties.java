package com.chippy.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "chippy.coffee")
public class CoffeeProperties {

    private boolean enabled = false;
    private String url = "";
    private int delayMinutes = 5;
    private String title = "Hey! If you are enjoying this please consider buying me a coffee...";
    private String body = "It will help pay server costs to keep this running and free for everyone!!!";
    private String acceptLabel = "Alright!";
    private String dismissLabel = "Maybe Later";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url == null ? "" : url;
    }

    public int getDelayMinutes() {
        return delayMinutes;
    }

    public void setDelayMinutes(int delayMinutes) {
        this.delayMinutes = Math.max(1, delayMinutes);
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title == null ? "" : title;
    }

    public String getBody() {
        return body;
    }

    public void setBody(String body) {
        this.body = body == null ? "" : body;
    }

    public String getAcceptLabel() {
        return acceptLabel;
    }

    public void setAcceptLabel(String acceptLabel) {
        this.acceptLabel = acceptLabel == null ? "Alright!" : acceptLabel;
    }

    public String getDismissLabel() {
        return dismissLabel;
    }

    public void setDismissLabel(String dismissLabel) {
        this.dismissLabel = dismissLabel == null ? "Maybe Later" : dismissLabel;
    }
}
