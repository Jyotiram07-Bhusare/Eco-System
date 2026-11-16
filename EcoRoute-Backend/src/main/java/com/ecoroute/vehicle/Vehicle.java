package com.ecoroute.vehicle;

/** A row of the "vehicles" table. g/km and Wh/km are calculated by the server (EmissionMath). */
public record Vehicle(
        long id,
        long userId,
        String type,
        String company,
        String model,
        String fuel,
        Double mileage,
        Double batteryKwh,
        int rangeKm,
        int gPerKm,
        Double whPerKm) {
}
