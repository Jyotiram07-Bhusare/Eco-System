package com.ecoroute.journey;

import java.time.LocalDateTime;
import java.util.List;

import com.ecoroute.common.ApiException;
import com.ecoroute.common.EmissionMath;
import com.ecoroute.common.IdHolder;
import com.ecoroute.common.Times;
import com.ecoroute.location.LocationMapper;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JourneyService {

    /** A finished journey as reported by the app. */
    public record Create(String clientRef, String fromId, String toId, String from, String to, String vehicleId, String vehicleType,
                         String vehicleLabel, String routeKind, String source, String date, double distanceKm, int durationMin,
                         int co2g, String status, Double startLat, Double startLon, String startAddress, Double endLat, Double endLon,
                         String trackSessionId) {}

    private final JourneyMapper journeys;
    private final LocationMapper locations;

    public JourneyService(JourneyMapper journeys, LocationMapper locations) {
        this.journeys = journeys;
        this.locations = locations;
    }

    public List<Journey> list(long userId, int limit) {
        return journeys.findByUser(userId, Math.max(1, Math.min(limit, 5000)));
    }

    public Journey require(long userId, long id) {
        Journey j = journeys.findOwned(userId, id);
        if (j == null) throw ApiException.notFound("Journey not found.");
        return j;
    }

    /**
     * Saves a journey. Calling it again with the same clientRef returns the existing journey instead of creating a
     * duplicate, so the app can safely retry after a network error.
     */
    @Transactional
    public Journey create(long userId, Create c) {
        if (c.clientRef() != null && !c.clientRef().isBlank()) {
            Journey existing = journeys.findByClientRef(userId, c.clientRef());
            if (existing != null) return existing;
        }
        LocalDateTime startedAt = Times.parseIso(c.date(), "date");
        LocalDateTime now = Times.nowUtc();
        if (startedAt == null || startedAt.isAfter(now.plusMinutes(10)) || startedAt.isBefore(now.minusYears(5)))
            throw ApiException.invalidField("date", "The journey time is out of range.");

        // the server is the authority for the derived numbers
        int saved = EmissionMath.savedGrams(c.distanceKm(), c.co2g());
        int score = EmissionMath.ecoScore(c.co2g(), c.distanceKm());
        String ref = c.clientRef() == null || c.clientRef().isBlank() ? null : c.clientRef();

        IdHolder key = new IdHolder();
        try {
            journeys.insert(new NewJourney(userId, ref, c.fromId(), c.toId(), c.from().trim(), c.to().trim(), c.vehicleId(), c.vehicleType(),
                    c.vehicleLabel().trim(), c.routeKind(), c.source(), startedAt, round2(c.distanceKm()), c.durationMin(), c.co2g(),
                    saved, score, c.status(), c.startLat(), c.startLon(), c.startAddress(), c.endLat(), c.endLon()), key);
        } catch (DuplicateKeyException race) {                      // two retries arrived together
            return journeys.findByClientRef(userId, ref);
        }
        if (c.trackSessionId() != null && !c.trackSessionId().isBlank()) {
            locations.attachToJourney(userId, c.trackSessionId(), key.id);
        }
        return journeys.findOwned(userId, key.id);
    }

    @Transactional
    public int deleteAll(long userId) {
        return journeys.deleteByUser(userId);
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
