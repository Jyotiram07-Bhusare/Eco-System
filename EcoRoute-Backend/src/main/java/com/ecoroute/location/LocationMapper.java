package com.ecoroute.location;

import java.time.LocalDateTime;
import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL lives in src/main/resources/mapper/LocationMapper.xml. */
@Mapper
public interface LocationMapper {

    int insertBatch(@Param("points") List<NewLocationPoint> points);

    /** Links the pings of a tracking session to the journey that was just saved. */
    int attachToJourney(@Param("userId") long userId, @Param("sessionId") String sessionId, @Param("journeyId") long journeyId);

    List<LocationPoint> findByJourney(@Param("userId") long userId, @Param("journeyId") long journeyId, @Param("limit") int limit);

    long countByUser(@Param("userId") long userId);

    int deleteByUser(@Param("userId") long userId);

    int deleteOlderThan(@Param("before") LocalDateTime before);
}
