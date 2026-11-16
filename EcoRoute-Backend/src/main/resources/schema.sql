-- ==========================================================================
-- EcoRoute database schema (MySQL 5.7 / 8.x)
-- Executed on every start. Every statement is idempotent (IF NOT EXISTS / INSERT IGNORE).
-- All timestamps are stored in UTC.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS users (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  email          VARCHAR(190) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  name           VARCHAR(80)  NOT NULL,
  phone          VARCHAR(30)  NULL,
  city           VARCHAR(80)  NULL,
  avatar_color   TINYINT      NOT NULL DEFAULT 0,
  joined_at      DATETIME(3)  NOT NULL,
  last_lat       DOUBLE       NULL,
  last_lon       DOUBLE       NULL,
  last_accuracy  DOUBLE       NULL,
  last_seen_at   DATETIME(3)  NULL,
  last_address   VARCHAR(255) NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id            BIGINT      NOT NULL,
  theme              VARCHAR(10) NOT NULL DEFAULT 'system',
  notif_trip         TINYINT(1)  NOT NULL DEFAULT 1,
  notif_tips         TINYINT(1)  NOT NULL DEFAULT 1,
  notif_charging     TINYINT(1)  NOT NULL DEFAULT 1,
  notif_weekly       TINYINT(1)  NOT NULL DEFAULT 0,
  move_mode          VARCHAR(8)  NOT NULL DEFAULT 'gps',
  gps_scale          INT         NOT NULL DEFAULT 1,
  demo_scale         INT         NOT NULL DEFAULT 10,
  goal_kg            INT         NOT NULL DEFAULT 20,
  battery_pct        INT         NOT NULL DEFAULT 64,
  active_vehicle_id  VARCHAR(40) NOT NULL DEFAULT 'generic-petrol-car',
  notif_read         TINYINT(1)  NOT NULL DEFAULT 0,
  share_location     TINYINT(1)  NOT NULL DEFAULT 1,
  updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login tokens. Only the SHA-256 of the token is stored, never the token itself.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash    CHAR(64)     NOT NULL,
  user_id       BIGINT       NOT NULL,
  created_at    DATETIME(3)  NOT NULL,
  expires_at    DATETIME(3)  NOT NULL,
  last_used_at  DATETIME(3)  NOT NULL,
  user_agent    VARCHAR(255) NULL,
  PRIMARY KEY (token_hash),
  KEY idx_tokens_user (user_id),
  KEY idx_tokens_expiry (expires_at),
  CONSTRAINT fk_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id           BIGINT      NOT NULL AUTO_INCREMENT,
  user_id      BIGINT      NOT NULL,
  type         VARCHAR(20) NOT NULL,
  company      VARCHAR(60) NOT NULL,
  model        VARCHAR(60) NOT NULL,
  fuel         VARCHAR(10) NOT NULL,
  mileage      DOUBLE      NULL,
  battery_kwh  DOUBLE      NULL,
  range_km     INT         NOT NULL,
  g_per_km     INT         NOT NULL,
  wh_per_km    DOUBLE      NULL,
  created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vehicles_user (user_id),
  CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journeys (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  user_id        BIGINT       NOT NULL,
  client_ref     VARCHAR(64)  NULL,
  from_id        VARCHAR(40)  NOT NULL,
  to_id          VARCHAR(40)  NOT NULL,
  from_name      VARCHAR(160) NOT NULL,
  to_name        VARCHAR(160) NOT NULL,
  vehicle_id     VARCHAR(40)  NULL,
  vehicle_type   VARCHAR(20)  NOT NULL,
  vehicle_label  VARCHAR(130) NOT NULL,
  route_kind     VARCHAR(12)  NOT NULL,
  source         VARCHAR(8)   NULL,
  started_at     DATETIME(3)  NOT NULL,
  distance_km    DOUBLE       NOT NULL,
  duration_min   INT          NOT NULL,
  co2_g          INT          NOT NULL,
  saved_g        INT          NOT NULL,
  eco_score      INT          NOT NULL,
  status         VARCHAR(16)  NOT NULL,
  start_lat      DOUBLE       NULL,
  start_lon      DOUBLE       NULL,
  start_address  VARCHAR(255) NULL,
  end_lat        DOUBLE       NULL,
  end_lon        DOUBLE       NULL,
  from_lat       DOUBLE       NULL,
  from_lon       DOUBLE       NULL,
  to_lat         DOUBLE       NULL,
  to_lon         DOUBLE       NULL,
  route_polyline MEDIUMTEXT   NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_journeys_client_ref (user_id, client_ref),
  KEY idx_journeys_user_time (user_id, started_at),
  CONSTRAINT fk_journeys_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Real-time location pings from the device. journey_id is filled in when the journey is saved.
CREATE TABLE IF NOT EXISTS location_points (
  id           BIGINT        NOT NULL AUTO_INCREMENT,
  user_id      BIGINT        NOT NULL,
  journey_id   BIGINT        NULL,
  session_id   VARCHAR(64)   NULL,
  lat          DOUBLE        NOT NULL,
  lon          DOUBLE        NOT NULL,
  accuracy_m   DOUBLE        NULL,
  speed_mps    DOUBLE        NULL,
  heading_deg  DOUBLE        NULL,
  recorded_at  DATETIME(3)   NOT NULL,
  received_at  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_loc_user_time (user_id, recorded_at),
  KEY idx_loc_journey (journey_id, recorded_at),
  KEY idx_loc_session (user_id, session_id),
  CONSTRAINT fk_loc_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
  CONSTRAINT fk_loc_journey FOREIGN KEY (journey_id) REFERENCES journeys (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reverse-geocoding cache, keyed by a ~100 m grid cell (lat/lon x 1000, rounded).
CREATE TABLE IF NOT EXISTS geocode_cache (
  lat_key       INT          NOT NULL,
  lon_key       INT          NOT NULL,
  display_name  VARCHAR(400) NOT NULL,
  short_name    VARCHAR(160) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (lat_key, lon_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
