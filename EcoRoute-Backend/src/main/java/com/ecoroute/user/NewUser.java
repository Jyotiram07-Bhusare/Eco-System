package com.ecoroute.user;

import java.time.LocalDateTime;

/** Values for inserting a user. */
public record NewUser(String email, String passwordHash, String name, LocalDateTime joinedAt) {
}
