package com.ecoroute.vehicle;

import java.util.List;

import com.ecoroute.common.ApiException;
import com.ecoroute.common.EmissionMath;
import com.ecoroute.common.IdHolder;
import com.ecoroute.user.SettingsPatch;
import com.ecoroute.user.UserMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VehicleService {

    /** What the client may send when adding a vehicle. */
    public record Create(String type, String company, String model, Double mileage, Double battery, Integer range) {}

    private final VehicleMapper vehicles;
    private final UserMapper users;

    public VehicleService(VehicleMapper vehicles, UserMapper users) {
        this.vehicles = vehicles;
        this.users = users;
    }

    public List<Vehicle> list(long userId) {
        return vehicles.findByUser(userId);
    }

    @Transactional
    public Vehicle create(long userId, Create c) {
        String fuel = EmissionMath.FUEL_OF_TYPE.get(c.type());
        if (fuel == null) throw ApiException.invalidField("type", "Unknown vehicle type.");
        String company = clean(c.company(), "company", 60);
        String model = clean(c.model(), "model", 60);
        boolean electric = "Electric".equals(fuel);

        Double mileage = null, battery = null, whPerKm = null;
        int range;
        if (electric) {
            if (c.battery() == null || c.battery() < 0.5 || c.battery() > 150)
                throw ApiException.invalidField("battery", "Battery should be between 0.5 and 150 kWh.");
            battery = c.battery();
            range = c.range() != null ? c.range() : ("electric-car".equals(c.type()) ? 300 : 110);
        } else {
            if (c.mileage() == null || c.mileage() < 3 || c.mileage() > 120)
                throw ApiException.invalidField("mileage", "Mileage should be between 3 and 120 km/l.");
            mileage = c.mileage();
            range = c.range() != null ? c.range() : (int) Math.round(mileage * EmissionMath.TANK_LITRES.get(c.type()));
        }
        if (range < 10 || range > 900) throw ApiException.invalidField("range", "Range should be between 10 and 900 km.");

        int gPerKm = EmissionMath.gramsPerKm(fuel, mileage, battery, range);
        if (electric) whPerKm = EmissionMath.whPerKm(battery, range);

        IdHolder key = new IdHolder();
        vehicles.insert(new NewVehicle(userId, c.type(), company, model, fuel, mileage, battery, range, gPerKm, whPerKm), key);
        return vehicles.findOwned(userId, key.id);
    }

    @Transactional
    public void delete(long userId, long id) {
        if (vehicles.delete(userId, id) == 0) throw ApiException.notFound("Vehicle not found.");
        // if it was the active vehicle, fall back to the generic petrol car
        var settings = users.findSettings(userId);
        if (settings != null && ("veh-" + id).equals(settings.activeVehicleId())) {
            users.updateSettings(userId, new SettingsPatch(null, null, null, null, null, null, null, null, null, null, "generic-petrol-car", null, null));
        }
    }

    private static String clean(String value, String field, int max) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) throw ApiException.invalidField(field, "This field is required.");
        if (v.length() > max) throw ApiException.invalidField(field, "At most " + max + " characters.");
        return v;
    }
}
