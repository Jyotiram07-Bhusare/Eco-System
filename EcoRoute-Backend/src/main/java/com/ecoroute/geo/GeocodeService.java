package com.ecoroute.geo;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;

import com.ecoroute.config.AppProperties;
import com.ecoroute.config.OsTrust;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Turns coordinates into a street address using OpenStreetMap Nominatim.
 * The SERVER makes the request (the browser never contacts a third party), results are cached by ~100 m grid cell,
 * calls are spaced out to respect the Nominatim usage policy, and the whole feature can be switched off
 * (ecoroute.geocoding.enabled=false) to keep coordinates entirely on your own machine.
 */
@Service
public class GeocodeService {

    private static final Logger log = LoggerFactory.getLogger(GeocodeService.class);
    private static final Pattern LANGUAGE = Pattern.compile("^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$");

    public record Result(String address, String shortName, boolean cached) {}

    private final AppProperties.Geocoding cfg;
    private final GeocodeCacheMapper cache;
    private final ObjectMapper json;
    private final HttpClient http;
    private final ReentrantLock gate = new ReentrantLock();
    private long lastCallMs;                                   // guarded by gate

    public GeocodeService(AppProperties props, GeocodeCacheMapper cache, ObjectMapper json) {
        this.cfg = props.geocoding();
        this.cache = cache;
        this.json = json;
        // trusts the JVM roots and the operating system's certificate store (see OsTrust)
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(cfg.timeoutMs())).sslContext(OsTrust.sslContext()).build();
    }

    public boolean enabled() {
        return cfg.enabled();
    }

    public Optional<Result> reverse(double lat, double lon, String language) {
        if (!cfg.enabled()) return Optional.empty();
        int latKey = (int) Math.round(lat * 1000), lonKey = (int) Math.round(lon * 1000);
        GeocodeCacheMapper.Entry hit = cache.find(latKey, lonKey);
        if (hit != null) return Optional.of(new Result(hit.displayName(), hit.shortName(), true));

        Optional<GeocodeCacheMapper.Entry> fresh = fetch(lat, lon, language);
        fresh.ifPresent(e -> cache.upsert(latKey, lonKey, e.displayName(), e.shortName()));
        return fresh.map(e -> new Result(e.displayName(), e.shortName(), false));
    }

    /**
     * One outbound call at a time, spaced by min-interval-ms. A lookup that cannot get its turn within a few seconds
     * (a burst of new places) gives up with "no address" instead of tying up a server thread.
     */
    private Optional<GeocodeCacheMapper.Entry> fetch(double lat, double lon, String language) {
        boolean locked = false;
        try {
            locked = gate.tryLock(3, TimeUnit.SECONDS);
            if (!locked) {
                log.debug("Reverse geocoding skipped: other lookups are still queued");
                return Optional.empty();
            }
            long wait = cfg.minIntervalMs() - (System.currentTimeMillis() - lastCallMs);
            if (wait > 0) Thread.sleep(wait);
            lastCallMs = System.currentTimeMillis();

            String lang = language != null && LANGUAGE.matcher(language).matches() ? language : "en";
            URI uri = URI.create(String.format(Locale.ROOT, "%s?format=jsonv2&addressdetails=1&zoom=18&lat=%.6f&lon=%.6f", cfg.url(), lat, lon));
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofMillis(cfg.timeoutMs()))
                    .header("User-Agent", cfg.userAgent())
                    .header("Accept-Language", lang)
                    .GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Reverse geocoding returned HTTP {}", response.statusCode());
                return Optional.empty();
            }
            JsonNode root = json.readTree(response.body());
            String display = root.path("display_name").asText("");
            if (display.isBlank()) return Optional.empty();
            return Optional.of(new GeocodeCacheMapper.Entry(truncate(display, 400), truncate(shortName(root.path("address"), display), 160)));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (IOException | RuntimeException e) {
            log.warn("Reverse geocoding failed: {}", e.getMessage());
            return Optional.empty();
        } finally {
            if (locked) gate.unlock();
        }
    }

    /** "12 Main Road, Shivajinagar": street (with number) and the neighbourhood / town. */
    static String shortName(JsonNode address, String display) {
        String road = first(address, "road", "pedestrian", "footway", "path", "cycleway", "residential");
        String number = first(address, "house_number");
        String area = first(address, "neighbourhood", "suburb", "city_district", "quarter", "village", "town", "city", "county");
        StringBuilder sb = new StringBuilder();
        if (!road.isEmpty()) sb.append(number.isEmpty() ? "" : number + " ").append(road);
        if (!area.isEmpty() && !area.equals(road)) sb.append(sb.length() > 0 ? ", " : "").append(area);
        if (sb.length() > 0) return sb.toString();
        String[] parts = display.split(",");
        return parts.length >= 2 ? parts[0].trim() + ", " + parts[1].trim() : display;
    }

    private static String first(JsonNode node, String... names) {
        for (String n : names) {
            String v = node.path(n).asText("");
            if (!v.isBlank()) return v.trim();
        }
        return "";
    }

    private static String truncate(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
