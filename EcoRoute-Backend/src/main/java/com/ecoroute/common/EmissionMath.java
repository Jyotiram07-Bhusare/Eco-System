package com.ecoroute.common;

import java.util.Map;

/**
 * The CO2 maths of EcoRoute in ONE place (the front-end uses the same constants for its live preview).
 * All values are estimates for demonstration, not measurements.
 */
public final class EmissionMath {

    private EmissionMath() {}

    /** An "average petrol car": the baseline that "carbon saved" is measured against. */
    public static final double BASELINE_G_PER_KM = 170;
    /** Grams of CO2 per litre burned. */
    public static final Map<String, Double> CO2_PER_LITRE = Map.of("Petrol", 2310.0, "Diesel", 2680.0);
    /** Sample grid mix: grams of CO2 per Wh of electricity. */
    public static final double GRID_G_PER_WH = 0.45;

    /** Vehicle type -> fuel. */
    public static final Map<String, String> FUEL_OF_TYPE = Map.of(
            "petrol-bike", "Petrol", "petrol-car", "Petrol", "diesel-car", "Diesel",
            "electric-bike", "Electric", "electric-car", "Electric");

    /** Assumed tank size (litres) used to estimate the range of a fuel vehicle. */
    public static final Map<String, Integer> TANK_LITRES = Map.of("petrol-bike", 10, "petrol-car", 40, "diesel-car", 45);

    /** Eco score 0-100 from the effective grams of CO2 per km of a trip. */
    public static int ecoScore(double co2Grams, double km) {
        double perKm = co2Grams / Math.max(km, 0.1);
        return (int) Math.max(6, Math.min(99, Math.round(100 - perKm / 3.2)));
    }

    /** Grams of CO2 saved against the baseline car over the same distance (never negative). */
    public static int savedGrams(double km, double co2Grams) {
        return (int) Math.max(0, Math.round(km * BASELINE_G_PER_KM - co2Grams));
    }

    /** Electricity use of an EV in Wh per km. */
    public static double whPerKm(double batteryKwh, int rangeKm) {
        return batteryKwh * 1000.0 / Math.max(rangeKm, 1);
    }

    /** CO2 intensity in g/km: fuel vehicles from km per litre, EVs from battery size and range. */
    public static int gramsPerKm(String fuel, Double kmPerLitre, Double batteryKwh, int rangeKm) {
        if ("Electric".equals(fuel)) {
            return (int) Math.round(whPerKm(batteryKwh, rangeKm) * GRID_G_PER_WH);
        }
        return (int) Math.round(CO2_PER_LITRE.get(fuel) / kmPerLitre);
    }
}
