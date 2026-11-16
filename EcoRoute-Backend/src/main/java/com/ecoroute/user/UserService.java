package com.ecoroute.user;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.ecoroute.common.ApiException;
import com.ecoroute.common.IdHolder;
import com.ecoroute.common.Times;
import com.ecoroute.vehicle.VehicleMapper;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private static final Pattern ACTIVE_VEHICLE =
            Pattern.compile("^(generic-(petrol-bike|petrol-car|diesel-car|electric-bike|electric-car)|veh-\\d{1,18})$");
    private static final Set<Integer> GPS_SCALES = Set.of(1, 5, 10, 20);
    private static final Set<Integer> DEMO_SCALES = Set.of(5, 10, 20, 40);

    public record ProfileUpdate(String name, String email, String phone, String city, int color) {}

    private final UserMapper users;
    private final VehicleMapper vehicles;
    private final PasswordEncoder encoder;

    public UserService(UserMapper users, VehicleMapper vehicles, PasswordEncoder encoder) {
        this.users = users;
        this.vehicles = vehicles;
        this.encoder = encoder;
    }

    public static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    /** Creates the user together with default settings. Returns the new id. */
    @Transactional
    public long create(String name, String email, String passwordHash) {
        return create(name, email, passwordHash, Times.nowUtc());
    }

    @Transactional
    public long create(String name, String email, String passwordHash, LocalDateTime joinedAt) {
        IdHolder key = new IdHolder();
        users.insert(new NewUser(email, passwordHash, name, joinedAt), key);
        users.insertSettings(key.id);
        return key.id;
    }

    public User require(long id) {
        User u = users.findById(id);
        if (u == null) throw ApiException.unauthorized("This account no longer exists.");
        return u;
    }

    public UserSettings settings(long id) {
        UserSettings s = users.findSettings(id);
        if (s == null) throw ApiException.notFound("Settings not found.");
        return s;
    }

    @Transactional
    public User updateProfile(long id, ProfileUpdate p) {
        String email = normalizeEmail(p.email());
        User other = users.findByEmail(email);
        if (other != null && other.id() != id) {
            throw ApiException.conflict("email_taken", "This email is already in use.", Map.of("email", "This email is already in use."));
        }
        users.updateProfile(id, p.name().trim(), email, blankToNull(p.phone()), blankToNull(p.city()), p.color());
        return require(id);
    }

    @Transactional
    public UserSettings updateSettings(long id, SettingsPatch p) {
        if (p.gpsScale() != null && !GPS_SCALES.contains(p.gpsScale()))
            throw ApiException.invalidField("gpsScale", "Use 1, 5, 10 or 20.");
        if (p.demoScale() != null && !DEMO_SCALES.contains(p.demoScale()))
            throw ApiException.invalidField("demoScale", "Use 5, 10, 20 or 40.");
        if (p.activeVehicleId() != null) {
            String v = p.activeVehicleId();
            if (!ACTIVE_VEHICLE.matcher(v).matches()) throw ApiException.invalidField("activeVehicleId", "Unknown vehicle.");
            if (v.startsWith("veh-") && vehicles.findOwned(id, Long.parseLong(v.substring(4))) == null)
                throw ApiException.invalidField("activeVehicleId", "That vehicle is not in your garage.");
        }
        users.updateSettings(id, p);
        return settings(id);
    }

    /** Deletes the account and, through ON DELETE CASCADE, every row that belongs to it. */
    @Transactional
    public void deleteAccount(long id, String password) {
        User u = require(id);
        // a wrong confirmation is a validation problem, not a rejected session, so it must not be a 401
        if (!encoder.matches(password, u.passwordHash())) throw ApiException.invalidField("password", "Password is incorrect.");
        users.delete(id);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
