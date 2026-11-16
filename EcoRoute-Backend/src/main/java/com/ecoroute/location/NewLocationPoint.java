package com.ecoroute.location;

import java.time.LocalDateTime;

/** Values for inserting a location point. */
public record NewLocationPoint(
        long userId,
        String sessionId,
        double lat,
        double lon,
        Double accuracyM,
        Double speedMps,
        Double headingDeg,
        LocalDateTime recordedAt) {
}
