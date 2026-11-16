package com.ecoroute.demo;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import com.ecoroute.common.EmissionMath;
import com.ecoroute.common.IdHolder;
import com.ecoroute.common.Times;
import com.ecoroute.journey.JourneyMapper;
import com.ecoroute.journey.NewJourney;
import com.ecoroute.user.SettingsPatch;
import com.ecoroute.user.UserMapper;
import com.ecoroute.vehicle.Vehicle;
import com.ecoroute.vehicle.VehicleMapper;
import com.ecoroute.vehicle.VehicleService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sample data: three vehicles and about five months of believable journeys (0-3 trips a day, fewer at weekends).
 * Used for the demo account and for the Profile "Reset demo data" action. Deterministic, so every reset gives
 * the same shape of data (dates are always relative to today).
 */
@Service
public class DemoDataService {

    private record Place(String id, String name, int x, int y) {}

    private record Pick(String id, String type, String label, int gPerKm, double weight) {}

    private static final double KM_PER_UNIT = 0.0085;
    private static final int[] HOURS = { 7, 8, 9, 10, 12, 13, 15, 17, 18, 19, 20 };
    private static final List<Place> PLACES = List.of(
            new Place("green-park", "Green Park", 300, 1000),
            new Place("central-station", "City Central Station", 600, 800),
            new Place("lakeside-mall", "Lakeside Mall", 900, 500),
            new Place("tech-park", "Tech Park Phase 2", 1000, 1200),
            new Place("riverside-college", "Riverside College", 200, 400),
            new Place("maple-heights", "Maple Heights", 500, 1400),
            new Place("sunrise-hospital", "Sunrise Hospital", 800, 1000),
            new Place("old-town", "Old Town Market", 400, 600),
            new Place("skyline-airport", "Skyline Airport T1", 1000, 200),
            new Place("botanical-gardens", "Botanical Gardens", 700, 300),
            new Place("eco-stadium", "Eco Stadium", 200, 1300),
            new Place("promenade", "Riverside Promenade", 600, 1000));

    private final VehicleService vehicleService;
    private final VehicleMapper vehicles;
    private final JourneyMapper journeys;
    private final UserMapper users;

    public DemoDataService(VehicleService vehicleService, VehicleMapper vehicles, JourneyMapper journeys, UserMapper users) {
        this.vehicleService = vehicleService;
        this.vehicles = vehicles;
        this.journeys = journeys;
        this.users = users;
    }

    /** Replaces the user's vehicles and journeys with the sample data. */
    @Transactional
    public void loadSampleData(long userId) {
        journeys.deleteByUser(userId);
        vehicles.deleteByUser(userId);

        Vehicle nexon = vehicleService.create(userId, new VehicleService.Create("electric-car", "Tata", "Nexon EV", null, 40.5, 312));
        Vehicle activa = vehicleService.create(userId, new VehicleService.Create("petrol-bike", "Honda", "Activa 6G", 50.0, null, 480));
        Vehicle city = vehicleService.create(userId, new VehicleService.Create("petrol-car", "Honda", "City", 17.0, null, 680));

        List<Pick> picks = List.of(
                new Pick("veh-" + nexon.id(), nexon.type(), "Tata Nexon EV", nexon.gPerKm(), 0.38),
                new Pick("veh-" + activa.id(), activa.type(), "Honda Activa 6G", activa.gPerKm(), 0.24),
                new Pick("veh-" + city.id(), city.type(), "Honda City", city.gPerKm(), 0.20),
                new Pick("generic-electric-bike", "electric-bike", "Electric Bike", EmissionMath.gramsPerKm("Electric", null, 3.2, 110), 0.10),
                new Pick("generic-diesel-car", "diesel-car", "Diesel Car", EmissionMath.gramsPerKm("Diesel", 18.0, null, 810), 0.08));

        generateJourneys(userId, picks);

        users.updateSettings(userId, new SettingsPatch(null, null, null, null, null, null, null, null, 20, 64, "veh-" + nexon.id(), null, null));
    }

    private void generateJourneys(long userId, List<Pick> picks) {
        Random rnd = new Random(20260316L);
        LocalDateTime now = Times.nowUtc();
        List<Place> pool = PLACES.subList(1, PLACES.size());
        for (int day = 0; day < 150; day++) {
            LocalDateTime base = now.minusDays(day);
            DayOfWeek dow = base.getDayOfWeek();
            boolean weekend = dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
            double r = rnd.nextDouble();
            int trips = weekend ? (r < 0.52 ? 0 : r < 0.88 ? 1 : 2) : (r < 0.34 ? 0 : r < 0.78 ? 1 : r < 0.96 ? 2 : 3);
            if (day < 3 && trips == 0) trips = 1;                       // always something recent to show
            for (int k = 0; k < trips; k++) {
                LocalDateTime t = base.withHour(HOURS[rnd.nextInt(HOURS.length)]).withMinute(rnd.nextInt(60)).withSecond(0).withNano(0);
                if (t.isAfter(now.minusMinutes(20))) continue;           // never in the future
                Place home = PLACES.get(0);
                boolean fromHome = rnd.nextDouble() < 0.55;
                Place a = fromHome ? home : pool.get(rnd.nextInt(pool.size()));
                Place b = pool.get(rnd.nextInt(pool.size()));
                if (a.id().equals(b.id())) b = pool.get((pool.indexOf(b) + 3) % pool.size());
                if (rnd.nextDouble() < 0.3) { Place tmp = a; a = b; b = tmp; }
                Pick v = pickVehicle(picks, rnd);
                double kr = rnd.nextDouble();
                String kind = kr < 0.5 ? "eco" : kr < 0.75 ? "fastest" : "shortest";
                boolean early = rnd.nextDouble() < 0.06;
                double frac = early ? 0.35 + rnd.nextDouble() * 0.4 : 1.0;

                double man = (Math.abs(a.x() - b.x()) + Math.abs(a.y() - b.y())) * KM_PER_UNIT;
                double km = switch (kind) {
                    case "shortest" -> man;
                    case "eco" -> Math.max(man * 1.07, man + 0.5);
                    default -> Math.max(man * 1.15, man + 1.0);
                };
                km = Math.round(km * 10) / 10.0;
                double speed = switch (kind) { case "shortest" -> 26; case "eco" -> 34; default -> 43; } * (0.94 + 0.12 * rnd.nextDouble());
                int timeMin = (int) Math.max(2, Math.round(km / speed * 60));
                double flow = switch (kind) { case "shortest" -> 1.18; case "eco" -> 0.86; default -> 1.08; } * (0.97 + 0.06 * rnd.nextDouble());
                int co2Full = (int) Math.round(km * v.gPerKm() * flow);

                double dist = Math.max(0.1, Math.round(km * frac * 10) / 10.0);
                int co2 = (int) Math.round(co2Full * frac);
                int minutes = (int) Math.max(3, Math.round(timeMin * frac));
                journeys.insert(new NewJourney(userId, null, a.id(), b.id(), a.name(), b.name(), v.id(), v.type(), v.label(), kind, null, t,
                        dist, minutes, co2, EmissionMath.savedGrams(dist, co2), EmissionMath.ecoScore(co2Full, km),
                        early ? "ended-early" : "completed", null, null, null, null, null), new IdHolder());
            }
        }
    }

    private static Pick pickVehicle(List<Pick> picks, Random rnd) {
        double r = rnd.nextDouble(), acc = 0;
        for (Pick p : picks) {
            acc += p.weight();
            if (r <= acc) return p;
        }
        return picks.get(0);
    }
}
