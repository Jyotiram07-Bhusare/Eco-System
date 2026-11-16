package com.ecoroute.journey;

import java.util.List;

import com.ecoroute.common.IdHolder;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL lives in src/main/resources/mapper/JourneyMapper.xml. */
@Mapper
public interface JourneyMapper {

    List<Journey> findByUser(@Param("userId") long userId, @Param("limit") int limit);

    Journey findOwned(@Param("userId") long userId, @Param("id") long id);

    Journey findByClientRef(@Param("userId") long userId, @Param("clientRef") String clientRef);

    int insert(@Param("j") NewJourney journey, @Param("key") IdHolder key);

    int deleteByUser(@Param("userId") long userId);
}
