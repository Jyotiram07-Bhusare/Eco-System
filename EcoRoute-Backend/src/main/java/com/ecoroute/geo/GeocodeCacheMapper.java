package com.ecoroute.geo;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL lives in src/main/resources/mapper/GeocodeCacheMapper.xml. */
@Mapper
public interface GeocodeCacheMapper {

    record Entry(String displayName, String shortName) {}

    Entry find(@Param("latKey") int latKey, @Param("lonKey") int lonKey);

    int upsert(@Param("latKey") int latKey, @Param("lonKey") int lonKey, @Param("displayName") String displayName, @Param("shortName") String shortName);
}
