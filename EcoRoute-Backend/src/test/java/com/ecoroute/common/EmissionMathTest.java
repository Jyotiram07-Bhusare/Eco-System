package com.ecoroute.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class EmissionMathTest {

    @Test
    void ecoScoreFallsAsEmissionsPerKmRise() {
        assertEquals(97, EmissionMath.ecoScore(100, 10));      // 10 g/km  -> 100 - 3.1
        assertEquals(53, EmissionMath.ecoScore(1500, 10));     // 150 g/km -> 100 - 46.9
        assertEquals(6, EmissionMath.ecoScore(100000, 10));    // clamped at the bottom
        assertEquals(99, EmissionMath.ecoScore(0, 10));        // clamped at the top
    }

    @Test
    void savedGramsAreMeasuredAgainstTheBaselineCarAndNeverNegative() {
        assertEquals(1350, EmissionMath.savedGrams(10, 350));  // 10 km * 170 - 350
        assertEquals(0, EmissionMath.savedGrams(10, 5000));
    }

    @Test
    void gramsPerKmForFuelAndElectricVehicles() {
        assertEquals(154, EmissionMath.gramsPerKm("Petrol", 15.0, null, 600));      // 2310 / 15
        assertEquals(149, EmissionMath.gramsPerKm("Diesel", 18.0, null, 810));      // 2680 / 18
        assertEquals(58, EmissionMath.gramsPerKm("Electric", null, 40.5, 312));     // 129.8 Wh/km * 0.45
        assertEquals(13, EmissionMath.gramsPerKm("Electric", null, 3.2, 110));
    }

    @Test
    void whPerKmFromBatteryAndRange() {
        assertEquals(129.8, EmissionMath.whPerKm(40.5, 312), 0.05);
    }
}
