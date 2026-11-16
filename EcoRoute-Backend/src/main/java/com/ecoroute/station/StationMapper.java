package com.ecoroute.station;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL lives in src/main/resources/mapper/StationMapper.xml. */
@Mapper
public interface StationMapper {

    List<Station> findAll();

    int updateFree(@Param("id") String id, @Param("free") int free);
}
