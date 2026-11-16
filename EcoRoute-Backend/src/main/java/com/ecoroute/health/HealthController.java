package com.ecoroute.health;

import java.util.LinkedHashMap;
import java.util.Map;

import com.ecoroute.common.Times;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public. The front-end calls it on start-up to find out whether a backend is available. */
@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> health() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("app", "EcoRoute");
        out.put("version", "1.0.0");
        out.put("time", Times.iso(Times.nowUtc()));
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            out.put("status", "ok");
            out.put("database", "up");
        } catch (RuntimeException e) {
            out.put("status", "degraded");
            out.put("database", "down");
        }
        return out;
    }
}
