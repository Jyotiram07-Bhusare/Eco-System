package com.ecoroute.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

/**
 * Brings a database that was created by an older version up to date. schema.sql only does CREATE TABLE IF NOT EXISTS,
 * so a table that already exists keeps its old columns; this adds the ones that are missing. It runs after schema.sql
 * and before the server accepts its first request. Safe to run on every start.
 */
@Component
@DependsOnDatabaseInitialization
public class SchemaUpgrade {

    private static final Logger log = LoggerFactory.getLogger(SchemaUpgrade.class);

    private final JdbcTemplate jdbc;

    public SchemaUpgrade(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    void upgrade() {
        // journeys now keep the real route: where it started and ended, and the encoded polyline of the road route
        addColumn("journeys", "from_lat", "DOUBLE NULL");
        addColumn("journeys", "from_lon", "DOUBLE NULL");
        addColumn("journeys", "to_lat", "DOUBLE NULL");
        addColumn("journeys", "to_lon", "DOUBLE NULL");
        addColumn("journeys", "route_polyline", "MEDIUMTEXT NULL");
        // the simulated charging stations are gone: chargers come from OpenStreetMap now
        jdbc.execute("DROP TABLE IF EXISTS charging_stations");
    }

    /** table / column / definition are constants of this class, never user input. */
    private void addColumn(String table, String column, String definition) {
        Integer found = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (found != null && found == 0) {
            jdbc.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
            log.info("Database upgraded: added {}.{}", table, column);
        }
    }
}
