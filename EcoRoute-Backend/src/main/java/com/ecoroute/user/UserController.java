package com.ecoroute.user;

import java.util.Map;

import com.ecoroute.auth.AuthInterceptor;
import com.ecoroute.common.Times;
import com.ecoroute.demo.DemoDataService;
import com.ecoroute.location.LocationService;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The signed-in user: profile, settings, sample data and location history. */
@RestController
@RequestMapping("/api/me")
public class UserController {

    public static final String EMAIL_REGEX = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$";

    public record UserDto(long id, String name, String email, String phone, String city, int color, String joined,
                          Double lastLat, Double lastLon, Double lastAccuracy, String lastSeen, String lastAddress) {
        public static UserDto of(User u) {
            return new UserDto(u.id(), u.name(), u.email(), u.phone(), u.city(), u.avatarColor(), Times.iso(u.joinedAt()),
                    u.lastLat(), u.lastLon(), u.lastAccuracy(), Times.iso(u.lastSeenAt()), u.lastAddress());
        }
    }

    public record NotifDto(boolean trip, boolean tips, boolean charging, boolean weekly) {}

    /** Same shape as the front-end's settings + the few state fields that must survive a reload. */
    public record SettingsDto(String theme, NotifDto notif, String moveMode, int gpsScale, int demoScale, int goalKg,
                              int battery, String activeVehicleId, boolean notifRead, boolean shareLocation) {
        public static SettingsDto of(UserSettings s) {
            return new SettingsDto(s.theme(), new NotifDto(s.notifTrip(), s.notifTips(), s.notifCharging(), s.notifWeekly()),
                    s.moveMode(), s.gpsScale(), s.demoScale(), s.goalKg(), s.batteryPct(), s.activeVehicleId(), s.notifRead(), s.shareLocation());
        }
    }

    public record MeResponse(UserDto user, SettingsDto settings) {}

    public record ProfileRequest(
            @NotBlank @Size(max = 80) String name,
            @NotBlank @Size(max = 190) @Pattern(regexp = EMAIL_REGEX, message = "Enter a valid email address") String email,
            @Size(max = 30) @Pattern(regexp = "^$|^[+\\d][\\d\\s\\-()]{6,}$", message = "Enter a valid phone number") String phone,
            @Size(max = 80) String city,
            @Min(0) @Max(9) Integer color) {}

    public record NotifRequest(Boolean trip, Boolean tips, Boolean charging, Boolean weekly) {}

    public record SettingsRequest(
            @Pattern(regexp = "light|dark|system") String theme,
            NotifRequest notif,
            @Pattern(regexp = "gps|demo") String moveMode,
            Integer gpsScale,
            Integer demoScale,
            @Min(1) @Max(1000) Integer goalKg,
            @Min(0) @Max(100) Integer battery,
            @Size(max = 40) String activeVehicleId,
            Boolean notifRead,
            Boolean shareLocation) {}

    public record DeleteAccountRequest(@NotBlank String password) {}

    private final UserService users;
    private final DemoDataService demo;
    private final LocationService location;

    public UserController(UserService users, DemoDataService demo, LocationService location) {
        this.users = users;
        this.demo = demo;
        this.location = location;
    }

    @GetMapping
    public MeResponse me(@RequestAttribute(AuthInterceptor.USER_ID) long userId) {
        return new MeResponse(UserDto.of(users.require(userId)), SettingsDto.of(users.settings(userId)));
    }

    @PutMapping
    public UserDto updateProfile(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @Valid @RequestBody ProfileRequest r) {
        return UserDto.of(users.updateProfile(userId,
                new UserService.ProfileUpdate(r.name(), r.email(), r.phone(), r.city(), r.color() == null ? 0 : r.color())));
    }

    @PutMapping("/settings")
    public SettingsDto updateSettings(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @Valid @RequestBody SettingsRequest r) {
        NotifRequest n = r.notif();
        SettingsPatch patch = new SettingsPatch(r.theme(),
                n == null ? null : n.trip(), n == null ? null : n.tips(), n == null ? null : n.charging(), n == null ? null : n.weekly(),
                r.moveMode(), r.gpsScale(), r.demoScale(), r.goalKg(), r.battery(), r.activeVehicleId(), r.notifRead(), r.shareLocation());
        return SettingsDto.of(users.updateSettings(userId, patch));
    }

    /** Replaces this account's vehicles and journeys with the sample data (the Profile "Reset demo data" action). */
    @PostMapping("/sample-data")
    public Map<String, Object> loadSampleData(@RequestAttribute(AuthInterceptor.USER_ID) long userId) {
        demo.loadSampleData(userId);
        return Map.of("ok", true);
    }

    @DeleteMapping("/location-history")
    public Map<String, Object> clearLocationHistory(@RequestAttribute(AuthInterceptor.USER_ID) long userId) {
        return Map.of("deleted", location.deleteAll(userId));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAccount(@RequestAttribute(AuthInterceptor.USER_ID) long userId, @Valid @RequestBody DeleteAccountRequest r) {
        users.deleteAccount(userId, r.password());
    }
}
