package com.ecoroute.user;

/** A partial update of the settings: only the non-null fields are written. */
public record SettingsPatch(
        String theme,
        Boolean notifTrip,
        Boolean notifTips,
        Boolean notifCharging,
        Boolean notifWeekly,
        String moveMode,
        Integer gpsScale,
        Integer demoScale,
        Integer goalKg,
        Integer batteryPct,
        String activeVehicleId,
        Boolean notifRead,
        Boolean shareLocation) {
}
