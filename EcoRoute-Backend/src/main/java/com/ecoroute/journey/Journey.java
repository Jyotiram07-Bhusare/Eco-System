package com.ecoroute.journey;

import java.time.LocalDateTime;

/** A row of the "journeys" table. */
public record Journey(
        long id,
        long userId,
        String clientRef,
        String fromId,
        String toId,
        String fromName,
        String toName,
        String vehicleId,
        String vehicleType,
        String vehicleLabel,
        String routeKind,
        String source,
        LocalDateTime startedAt,
        double distanceKm,
        int durationMin,
        int co2G,
        int savedG,
        int ecoScore,
        String status,
        Double startLat,
        Double startLon,
        String startAddress,
        Double endLat,
        Double endLon) {
}
