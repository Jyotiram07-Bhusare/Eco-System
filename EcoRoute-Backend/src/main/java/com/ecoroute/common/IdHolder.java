package com.ecoroute.common;

/**
 * Receives the AUTO_INCREMENT key of an INSERT. MyBatis writes it into "key.id"
 * (see useGeneratedKeys / keyProperty in the mapper XML), so the entities can stay immutable records.
 */
public class IdHolder {
    public long id;
}
