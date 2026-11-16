package com.ecoroute.bootstrap;

import java.util.List;

import com.ecoroute.auth.AuthInterceptor;
import com.ecoroute.journey.JourneyController.JourneyDto;
import com.ecoroute.journey.JourneyService;
import com.ecoroute.station.StationController.StationDto;
import com.ecoroute.station.StationService;
import com.ecoroute.user.UserController.SettingsDto;
import com.ecoroute.user.UserController.UserDto;
import com.ecoroute.user.UserService;
import com.ecoroute.vehicle.VehicleController.VehicleDto;
import com.ecoroute.vehicle.VehicleService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Everything the app needs after login in ONE request (fast start-up). */
@RestController
@RequestMapping("/api/bootstrap")
public class BootstrapController {

    public record Bootstrap(UserDto user, SettingsDto settings, List<VehicleDto> vehicles, List<JourneyDto> journeys, List<StationDto> stations) {}

    private final UserService users;
    private final VehicleService vehicles;
    private final JourneyService journeys;
    private final StationService stations;

    public BootstrapController(UserService users, VehicleService vehicles, JourneyService journeys, StationService stations) {
        this.users = users;
        this.vehicles = vehicles;
        this.journeys = journeys;
        this.stations = stations;
    }

    @GetMapping
    public Bootstrap bootstrap(@RequestAttribute(AuthInterceptor.USER_ID) long userId) {
        return new Bootstrap(
                UserDto.of(users.require(userId)),
                SettingsDto.of(users.settings(userId)),
                vehicles.list(userId).stream().map(VehicleDto::of).toList(),
                journeys.list(userId, 1000).stream().map(JourneyDto::of).toList(),
                stations.list().stream().map(StationDto::of).toList());
    }
}
