package com.ecoroute.user;

/** A row of the "user_settings" table (one per user). */
public record UserSettings(
        long userId,
        String theme,
        boolean notifTrip,
        boolean notifTips,
        boolean notifCharging,
        boolean notifWeekly,
        String moveMode,
        int gpsScale,
        int demoScale,
        int goalKg,
        int batteryPct,
        String activeVehicleId,
        boolean notifRead,
        boolean shareLocation) {
}
