package com.ecoroute.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed view of the "ecoroute.*" settings in application.properties. */
@ConfigurationProperties(prefix = "ecoroute")
public record AppProperties(String frontendDir, Auth auth, Location location, Geocoding geocoding, Demo demo, List<String> corsOrigins) {

    public record Auth(int tokenTtlDays, int maxLoginFailures, int lockoutMinutes) {}

    public record Location(int retentionDays, int maxBatch) {}

    public record Geocoding(boolean enabled, String url, String userAgent, long minIntervalMs, int timeoutMs) {}

    public record Demo(boolean enabled, String email, String password) {}
}
