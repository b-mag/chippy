package com.chippy.web;

import com.chippy.config.AdsProperties;
import com.chippy.config.CoffeeProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Browser hardening for every response. HSTS is sent only when the request
 * is already on HTTPS, so a local HTTP session is not pinned.
 * Styles and scripts are external files. Critical CSS is not inlined,
 * because style-src and script-src do not allow unsafe-inline unless ads need it.
 */
@Component
public class SecurityHeadersFilter extends OncePerRequestFilter {

    public static final String BASE_CONTENT_SECURITY_POLICY = String.join("; ",
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "font-src 'self'",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'");

    /** Prefer {@link #buildContentSecurityPolicy(boolean, boolean)}. Kept for callers that expect a constant. */
    public static final String CONTENT_SECURITY_POLICY = BASE_CONTENT_SECURITY_POLICY;

    private final CoffeeProperties coffeeProperties;
    private final AdsProperties adsProperties;

    public SecurityHeadersFilter(CoffeeProperties coffeeProperties, AdsProperties adsProperties) {
        this.coffeeProperties = coffeeProperties;
        this.adsProperties = adsProperties;
    }

    public static String buildContentSecurityPolicy(boolean coffeeEnabled, boolean adsEnabled) {
        List<String> script = new ArrayList<>(List.of("'self'"));
        List<String> style = new ArrayList<>(List.of("'self'"));
        List<String> img = new ArrayList<>(List.of("'self'", "data:"));
        List<String> connect = new ArrayList<>(List.of("'self'"));
        List<String> frame = new ArrayList<>();
        List<String> font = new ArrayList<>(List.of("'self'"));

        if (coffeeEnabled) {
            frame.add("https://www.buymeacoffee.com");
            frame.add("https://ko-fi.com");
            connect.add("https://www.buymeacoffee.com");
            connect.add("https://ko-fi.com");
        }
        if (adsEnabled) {
            script.add("https://pagead2.googlesyndication.com");
            script.add("https://www.googletagservices.com");
            script.add("'unsafe-inline'");
            style.add("'unsafe-inline'");
            img.add("https://pagead2.googlesyndication.com");
            img.add("https://googleads.g.doubleclick.net");
            img.add("https://tpc.googlesyndication.com");
            connect.add("https://pagead2.googlesyndication.com");
            connect.add("https://googleads.g.doubleclick.net");
            connect.add("https://fundingchoicesmessages.google.com");
            frame.add("https://googleads.g.doubleclick.net");
            frame.add("https://tpc.googlesyndication.com");
            frame.add("https://www.google.com");
            font.add("https://fonts.gstatic.com");
        }

        String frameSrc = frame.isEmpty() ? "'none'" : String.join(" ", frame);
        return String.join("; ",
                "default-src 'self'",
                "script-src " + String.join(" ", script),
                "style-src " + String.join(" ", style),
                "img-src " + String.join(" ", img),
                "connect-src " + String.join(" ", connect),
                "font-src " + String.join(" ", font),
                "frame-src " + frameSrc,
                "object-src 'none'",
                "base-uri 'self'",
                "frame-ancestors 'none'");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String policy = buildContentSecurityPolicy(coffeeProperties.isEnabled(), adsProperties.isEnabled());
        response.setHeader("Content-Security-Policy", policy);
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (request.isSecure() || "https".equalsIgnoreCase(request.getHeader("X-Forwarded-Proto"))) {
            response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        }
        filterChain.doFilter(request, response);
    }
}
