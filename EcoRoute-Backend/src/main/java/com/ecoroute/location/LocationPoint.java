package com.ecoroute.location;

import java.time.LocalDateTime;

/** A row of the "location_points" table. */
public record LocationPoint(
        long id,
        long userId,
        Long journeyId,
        String sessionId,
        double lat,
        double lon,
        Double accuracyM,
        Double speedMps,
        Double headingDeg,
        LocalDateTime recordedAt) {
}
