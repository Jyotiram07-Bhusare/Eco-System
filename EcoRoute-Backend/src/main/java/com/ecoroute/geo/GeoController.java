package com.ecoroute.geo;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

@RestController
@RequestMapping("/api/geo")
@Validated
public class GeoController {

    /** address / shortName are null when geocoding is off or nothing was found. */
    public record GeoDto(String address, String shortName, boolean cached, boolean enabled) {}

    private final GeocodeService geocode;

    public GeoController(GeocodeService geocode) {
        this.geocode = geocode;
    }

    @GetMapping("/reverse")
    public GeoDto reverse(@RequestParam("lat") @DecimalMin("-90") @DecimalMax("90") double lat,
                          @RequestParam("lon") @DecimalMin("-180") @DecimalMax("180") double lon,
                          @RequestHeader(name = "Accept-Language", required = false) String language) {
        String lang = language == null ? null : language.split("[,;]")[0].trim();
        return geocode.reverse(lat, lon, lang)
                .map(r -> new GeoDto(r.address(), r.shortName(), r.cached(), true))
                .orElseGet(() -> new GeoDto(null, null, false, geocode.enabled()));
    }
}
