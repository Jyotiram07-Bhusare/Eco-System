package com.ecoroute.geo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;

class GeocodeServiceTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void shortNameUsesStreetNumberAndNeighbourhood() throws Exception {
        JsonNode a = json.readTree("{\"road\":\"MG Road\",\"house_number\":\"12\",\"suburb\":\"Camp\",\"city\":\"Pune\"}");
        assertEquals("12 MG Road, Camp", GeocodeService.shortName(a, "ignored"));
    }

    @Test
    void shortNameFallsBackToTownThenToTheDisplayName() throws Exception {
        assertEquals("Main Street, Springfield", GeocodeService.shortName(json.readTree("{\"road\":\"Main Street\",\"town\":\"Springfield\"}"), "x"));
        assertEquals("Park, Greenville", GeocodeService.shortName(json.readTree("{}"), "Park, Greenville, Somewhere"));
    }
}
