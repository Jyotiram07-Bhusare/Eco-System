package com.ecoroute.station;

/** A row of the "charging_stations" table (sample data of the simulated city). */
public record Station(
        String id,
        String name,
        String area,
        int x,
        int y,
        String connectors,
        int kw,
        int totalPorts,
        int freePorts,
        int seedFree) {
}
