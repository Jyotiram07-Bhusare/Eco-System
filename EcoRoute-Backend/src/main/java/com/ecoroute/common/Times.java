package com.ecoroute.common;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;

/** Everything is stored as UTC DATETIME(3) and sent to the browser as ISO-8601 ("...Z"). */
public final class Times {

    private Times() {}

    public static LocalDateTime nowUtc() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }

    public static String iso(LocalDateTime t) {
        return t == null ? null : t.toInstant(ZoneOffset.UTC).toString();
    }

    public static LocalDateTime fromEpochMs(long ms) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(ms), ZoneOffset.UTC);
    }

    /** Parses an ISO instant such as 2026-11-16T12:21:24.705Z. Returns null for blank input, throws ApiException for junk. */
    public static LocalDateTime parseIso(String text, String field) {
        if (text == null || text.isBlank()) return null;
        try {
            return LocalDateTime.ofInstant(Instant.parse(text.trim()), ZoneOffset.UTC);
        } catch (DateTimeParseException e) {
            throw ApiException.invalidField(field, "Use an ISO-8601 time such as 2026-11-16T12:21:24Z");
        }
    }
}
