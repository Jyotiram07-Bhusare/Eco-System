package com.ecoroute.location;

import java.util.List;
import java.util.Map;

import com.ecoroute.auth.AuthInterceptor;
import com.ecoroute.common.Times;
import com.ecoroute.user.User;
import com.ecoroute.user.UserService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Real-time location: the app sends pings, the server stores them and remembers the latest position. */
@RestController
@RequestMapping("/api/location")
public class LocationController {

    public record PointRequest(
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double lat,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double lon,
            @DecimalMin("0") @DecimalMax("100000") Double accuracy,
            @DecimalMin("0") @DecimalMax("200") Double speed,
            @DecimalMin("0") @DecimalMax("360") Double heading,
            @NotNull Long ts) {}

    public record PingsRequest(
            @Size(max = 64) String sessionId,
            @Size(max = 255) String address,
            @NotEmpty @Size(max = 500) List<@Valid PointRequest> points) {}

    public record PointDto(double lat, double lon, Double accuracy, Double speed, Double heading, String time) {
        public static PointDto of(LocationPoint p) {
            return new PointDto(p.lat(), p.lon(), p.accuracyM(), p.speedMps(), p.headingDeg(), Times.iso(p.recordedAt()));
        }
    }

    public record LastDto(double lat, double lon, Double accuracy, String seenAt, String address) {}

    private final LocationService service;
    private final UserService users;

    public LocationController(LocationService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @PostMapping("/pings")
    public Map<String, Object> pings(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @Valid @RequestBody PingsRequest r) {
        List<LocationService.Ping> pings = r.points().stream()
                .map(p -> new LocationService.Ping(p.lat(), p.lon(), p.accuracy(), p.speed(), p.heading(), p.ts()))
                .toList();
        return Map.of("stored", service.ingest(userId, r.sessionId(), r.address(), pings));
    }

    /** The most recent position the server has for this user (204 when there is none). */
    @GetMapping("/last")
    public ResponseEntity<LastDto> last(@RequestAttribute(AuthInterceptor.USER_ID) long userId) {
        User u = users.require(userId);
        if (u.lastLat() == null || u.lastLon() == null) return ResponseEntity.noContent().build();
        return ResponseEntity.ok(new LastDto(u.lastLat(), u.lastLon(), u.lastAccuracy(), Times.iso(u.lastSeenAt()), u.lastAddress()));
    }
}
