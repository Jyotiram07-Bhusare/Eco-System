package com.ecoroute.user;

import java.time.LocalDateTime;

/** A row of the "users" table. */
public record User(
        Long id,
        String email,
        String passwordHash,
        String name,
        String phone,
        String city,
        int avatarColor,
        LocalDateTime joinedAt,
        Double lastLat,
        Double lastLon,
        Double lastAccuracy,
        LocalDateTime lastSeenAt,
        String lastAddress) {
}
