package com.ecoroute.location;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.ecoroute.common.ApiException;
import com.ecoroute.common.Times;
import com.ecoroute.config.AppProperties;
import com.ecoroute.user.UserMapper;
import com.ecoroute.user.UserSettings;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stores the real-time location pings sent by the app, and remembers the user's latest position. */
@Service
public class LocationService {

    /** One position fix as sent by the browser (ts = epoch milliseconds). */
    public record Ping(double lat, double lon, Double accuracy, Double speed, Double heading, long ts) {}

    private final LocationMapper locations;
    private final UserMapper users;
    private final AppProperties props;

    public LocationService(LocationMapper locations, UserMapper users, AppProperties props) {
        this.locations = locations;
        this.users = users;
        this.props = props;
    }

    /**
     * Saves a batch of pings. Returns how many were stored. Nothing is stored when the user switched
     * "Save my location history" off in their settings (privacy by design: enforced here, not only in the app).
     */
    @Transactional
    public int ingest(long userId, String sessionId, String address, List<Ping> pings) {
        UserSettings settings = users.findSettings(userId);
        if (settings != null && !settings.shareLocation()) return 0;
        if (pings.size() > props.location().maxBatch())
            throw ApiException.badRequest("batch_too_large", "At most " + props.location().maxBatch() + " points per request.");

        LocalDateTime now = Times.nowUtc();
        String session = clean(sessionId, 64);
        List<NewLocationPoint> rows = new ArrayList<>(pings.size());
        for (Ping p : pings) {
            LocalDateTime t = Times.fromEpochMs(p.ts());
            if (t.isBefore(now.minusDays(7))) continue;                 // far too old: ignore
            if (t.isAfter(now.plusMinutes(5))) t = now;                  // clock skew: clamp to now
            rows.add(new NewLocationPoint(userId, session, p.lat(), p.lon(), p.accuracy(), p.speed(), p.heading(), t));
        }
        if (rows.isEmpty()) return 0;
        rows.sort(Comparator.comparing(NewLocationPoint::recordedAt));
        locations.insertBatch(rows);

        NewLocationPoint last = rows.get(rows.size() - 1);
        users.updateLastLocation(userId, last.lat(), last.lon(), last.accuracyM(), last.recordedAt(), clean(address, 255));
        return rows.size();
    }

    public List<LocationController.PointDto> track(long userId, long journeyId) {
        return locations.findByJourney(userId, journeyId, 20000).stream().map(LocationController.PointDto::of).toList();
    }

    /** Deletes the whole location history and the remembered last position. Returns the number of points removed. */
    @Transactional
    public int deleteAll(long userId) {
        int n = locations.deleteByUser(userId);
        users.clearLastLocation(userId);
        return n;
    }

    /** Trims, drops control characters, caps the length. Null when empty. */
    static String clean(String s, int max) {
        if (s == null) return null;
        String t = s.replaceAll("\\p{Cntrl}", " ").trim();
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }
}
