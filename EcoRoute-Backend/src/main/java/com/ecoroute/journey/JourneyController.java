package com.ecoroute.journey;

import java.util.List;
import java.util.Map;

import com.ecoroute.auth.AuthInterceptor;
import com.ecoroute.common.Times;
import com.ecoroute.location.LocationController;
import com.ecoroute.location.LocationService;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/journeys")
public class JourneyController {

    /** Same shape the front-end uses for a journey (ids are strings, dates ISO-8601). */
    public record JourneyDto(String id, String fromId, String toId, String from, String to, String vehicleId, String vehicleType,
                             String vehicleLabel, String routeKind, String source, String date, double distanceKm, int durationMin,
                             int co2g, int savedG, int ecoScore, String status,
                             Double startLat, Double startLon, String startAddress, Double endLat, Double endLon,
                             Double fromLat, Double fromLon, Double toLat, Double toLon, boolean hasRoute) {
        public static JourneyDto of(Journey j) {
            return new JourneyDto(String.valueOf(j.id()), j.fromId(), j.toId(), j.fromName(), j.toName(), j.vehicleId(), j.vehicleType(),
                    j.vehicleLabel(), j.routeKind(), j.source(), Times.iso(j.startedAt()), j.distanceKm(), j.durationMin(),
                    j.co2G(), j.savedG(), j.ecoScore(), j.status(), j.startLat(), j.startLon(), j.startAddress(), j.endLat(), j.endLon(),
                    j.fromLat(), j.fromLon(), j.toLat(), j.toLon(), j.hasRoute());
        }
    }

    public record CreateRequest(
            @Size(max = 64) String clientRef,
            @NotBlank @Size(max = 40) String fromId,
            @NotBlank @Size(max = 40) String toId,
            @NotBlank @Size(max = 160) String from,
            @NotBlank @Size(max = 160) String to,
            @Size(max = 40) String vehicleId,
            @NotBlank @Pattern(regexp = "petrol-bike|petrol-car|diesel-car|electric-bike|electric-car") String vehicleType,
            @NotBlank @Size(max = 130) String vehicleLabel,
            @NotBlank @Pattern(regexp = "shortest|eco|fastest") String routeKind,
            @Pattern(regexp = "gps|demo") String source,
            @NotBlank String date,
            @NotNull @DecimalMin("0.05") @DecimalMax("5000") Double distanceKm,
            @NotNull @Min(1) @Max(10000) Integer durationMin,
            @NotNull @Min(0) @Max(2000000) Integer co2g,
            @NotBlank @Pattern(regexp = "completed|ended-early") String status,
            @DecimalMin("-90") @DecimalMax("90") Double startLat,
            @DecimalMin("-180") @DecimalMax("180") Double startLon,
            @Size(max = 255) String startAddress,
            @DecimalMin("-90") @DecimalMax("90") Double endLat,
            @DecimalMin("-180") @DecimalMax("180") Double endLon,
            @Size(max = 64) String trackSessionId,
            @DecimalMin("-90") @DecimalMax("90") Double fromLat,
            @DecimalMin("-180") @DecimalMax("180") Double fromLon,
            @DecimalMin("-90") @DecimalMax("90") Double toLat,
            @DecimalMin("-180") @DecimalMax("180") Double toLon,
            @Size(max = 200000) String routePolyline) {}

    private final JourneyService journeys;
    private final LocationService locations;

    public JourneyController(JourneyService journeys, LocationService locations) {
        this.journeys = journeys;
        this.locations = locations;
    }

    @GetMapping
    public List<JourneyDto> list(@RequestAttribute(AuthInterceptor.USER_ID) long userId,
                                 @RequestParam(name = "limit", defaultValue = "1000") int limit) {
        return journeys.list(userId, limit).stream().map(JourneyDto::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JourneyDto create(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @Valid @RequestBody CreateRequest r) {
        Journey j = journeys.create(userId, new JourneyService.Create(r.clientRef(), r.fromId(), r.toId(), r.from(), r.to(), r.vehicleId(),
                r.vehicleType(), r.vehicleLabel(), r.routeKind(), r.source(), r.date(), r.distanceKm(), r.durationMin(), r.co2g(),
                r.status(), r.startLat(), r.startLon(), r.startAddress(), r.endLat(), r.endLon(), r.trackSessionId(),
                r.fromLat(), r.fromLon(), r.toLat(), r.toLon(), r.routePolyline()));
        return JourneyDto.of(j);
    }

    /** The planned route of one journey as an encoded polyline. It is not part of the list because it is big. */
    @GetMapping("/{id}/route")
    public Map<String, Object> route(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @PathVariable("id") long id) {
        String polyline = journeys.route(userId, id);
        if (polyline == null) throw com.ecoroute.common.ApiException.notFound("No route was saved for this journey.");
        return Map.of("polyline", polyline);
    }

    /** The GPS points recorded during one journey (empty for sample journeys). */
    @GetMapping("/{id}/track")
    public List<LocationController.PointDto> track(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @PathVariable("id") long id) {
        journeys.require(userId, id);
        return locations.track(userId, id);
    }

    @DeleteMapping
    public Map<String, Object> clear(@RequestAttribute(AuthInterceptor.USER_ID) long userId) {
        return Map.of("deleted", journeys.deleteAll(userId));
    }
}
