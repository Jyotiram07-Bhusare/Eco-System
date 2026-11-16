package com.ecoroute.auth;

import java.time.LocalDateTime;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL lives in src/main/resources/mapper/TokenMapper.xml. */
@Mapper
public interface TokenMapper {

    /** A valid (unexpired) token row. */
    record TokenRow(long userId, LocalDateTime lastUsedAt) {}

    int insert(@Param("hash") String hash, @Param("userId") long userId, @Param("createdAt") LocalDateTime createdAt,
               @Param("expiresAt") LocalDateTime expiresAt, @Param("userAgent") String userAgent);

    TokenRow findValid(@Param("hash") String hash, @Param("now") LocalDateTime now);

    int touch(@Param("hash") String hash, @Param("now") LocalDateTime now);

    int delete(@Param("hash") String hash);

    int deleteExpired(@Param("now") LocalDateTime now);
}
