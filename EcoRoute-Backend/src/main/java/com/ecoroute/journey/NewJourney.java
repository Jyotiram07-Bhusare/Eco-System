package com.ecoroute.journey;

import java.time.LocalDateTime;

/** Values for inserting a journey. saved_g and eco_score are always calculated by the server. */
public record NewJourney(
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
