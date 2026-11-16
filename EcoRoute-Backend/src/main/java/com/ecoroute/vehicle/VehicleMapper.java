package com.ecoroute.vehicle;

import java.util.List;

import com.ecoroute.common.IdHolder;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL lives in src/main/resources/mapper/VehicleMapper.xml. */
@Mapper
public interface VehicleMapper {

    List<Vehicle> findByUser(@Param("userId") long userId);

    Vehicle findOwned(@Param("userId") long userId, @Param("id") long id);

    int insert(@Param("v") NewVehicle vehicle, @Param("key") IdHolder key);

    int delete(@Param("userId") long userId, @Param("id") long id);

    int deleteByUser(@Param("userId") long userId);
}
