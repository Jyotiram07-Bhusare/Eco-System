package com.ecoroute.user;

import java.time.LocalDateTime;

import com.ecoroute.common.IdHolder;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** SQL lives in src/main/resources/mapper/UserMapper.xml. */
@Mapper
public interface UserMapper {

    User findById(@Param("id") long id);

    User findByEmail(@Param("email") String email);

    int insert(@Param("u") NewUser user, @Param("key") IdHolder key);

    int updateProfile(@Param("id") long id, @Param("name") String name, @Param("email") String email,
                      @Param("phone") String phone, @Param("city") String city, @Param("color") int color);

    int updateLastLocation(@Param("id") long id, @Param("lat") double lat, @Param("lon") double lon,
                           @Param("accuracy") Double accuracy, @Param("seenAt") LocalDateTime seenAt, @Param("address") String address);

    int clearLastLocation(@Param("id") long id);

    int delete(@Param("id") long id);

    UserSettings findSettings(@Param("userId") long userId);

    int insertSettings(@Param("userId") long userId);

    int updateSettings(@Param("userId") long userId, @Param("s") SettingsPatch patch);
}
