package com.ecoroute.vehicle;

/** Values for inserting a vehicle. */
public record NewVehicle(
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
