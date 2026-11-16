/* ==========================================================================
   EcoRoute - data.js
   All demo content lives here: places, vehicle types, charging stations,
   emission maths and the seeded journey history.

   EVERYTHING IN THIS FILE IS SIMULATED SAMPLE DATA. There is no real GPS,
   routing engine, charger-availability feed or carbon sensor behind it.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

  /* ---------- Map world (stylised city, abstract units) ---------- */
  var WORLD = { w: 1200, h: 1600, grid: 100, kmPerUnit: 0.0085 };

  /* ---------- Places (every one sits on a road intersection) ---------- */
  var places = [
    { id: 'green-park',        name: 'Green Park',            area: 'Sector 4 · Residential',   type: 'home',      icon: 'home',           x: 300,  y: 1000 },
    { id: 'central-station',   name: 'City Central Station',  area: 'Transit hub',               type: 'transit',   icon: 'route',          x: 600,  y: 800  },
    { id: 'lakeside-mall',     name: 'Lakeside Mall',         area: 'Shopping · East side',      type: 'mall',      icon: 'shopping-bag',   x: 900,  y: 500  },
    { id: 'tech-park',         name: 'Tech Park Phase 2',     area: 'Business district',         type: 'work',      icon: 'briefcase',      x: 1000, y: 1200 },
    { id: 'riverside-college', name: 'Riverside College',     area: 'Education · West side',     type: 'college',   icon: 'graduation-cap', x: 200,  y: 400  },
    { id: 'maple-heights',     name: 'Maple Heights',         area: 'Residential · South',       type: 'home',      icon: 'building',       x: 500,  y: 1400 },
    { id: 'sunrise-hospital',  name: 'Sunrise Hospital',      area: 'Healthcare',                type: 'hospital',  icon: 'hospital',       x: 800,  y: 1000 },
    { id: 'old-town',          name: 'Old Town Market',       area: 'Heritage quarter',          type: 'market',    icon: 'map-pin',        x: 400,  y: 600  },
    { id: 'skyline-airport',   name: 'Skyline Airport T1',    area: 'Airport · North-east',      type: 'airport',   icon: 'plane',          x: 1000, y: 200  },
    { id: 'botanical-gardens', name: 'Botanical Gardens',     area: 'Park · North',              type: 'park',      icon: 'trees',          x: 700,  y: 300  },
    { id: 'eco-stadium',       name: 'Eco Stadium',           area: 'Sports complex',            type: 'stadium',   icon: 'trophy',         x: 200,  y: 1300 },
    { id: 'promenade',         name: 'Riverside Promenade',   area: 'Waterfront',                type: 'park',      icon: 'waves',          x: 600,  y: 1000 }
  ];

  var currentLocation = { id: 'current', name: 'Current Location', area: 'Green Park, Sector 4', type: 'current', icon: 'locate-fixed', x: 300, y: 1000, current: true };

  /* ---------- Vehicle types ---------- */
  var CO2_PER_LITRE = { Petrol: 2310, Diesel: 2680 };   // g CO2 per litre burned
  var GRID_G_PER_WH = 0.45;                              // g CO2 per Wh (sample grid mix)

  var vehicleTypes = {
    'petrol-bike':   { id: 'petrol-bike',   label: 'Petrol Bike',   icon: 'bike',      fuel: 'Petrol',   ev: false, category: 'bike', mileage: 45, tank: 10, blurb: 'Light and nimble' },
    'petrol-car':    { id: 'petrol-car',    label: 'Petrol Car',    icon: 'car',       fuel: 'Petrol',   ev: false, category: 'car',  mileage: 15, tank: 40, blurb: 'Everyday comfort' },
    'diesel-car':    { id: 'diesel-car',    label: 'Diesel Car',    icon: 'car-front', fuel: 'Diesel',   ev: false, category: 'car',  mileage: 18, tank: 45, blurb: 'Long-haul efficient' },
    'electric-bike': { id: 'electric-bike', label: 'Electric Bike', icon: 'bike',      fuel: 'Electric', ev: true,  category: 'bike', battery: 3.2, range: 110, blurb: 'Quiet and clean' },
    'electric-car':  { id: 'electric-car',  label: 'Electric Car',  icon: 'car',       fuel: 'Electric', ev: true,  category: 'car',  battery: 40,  range: 300, blurb: 'Zero tailpipe' }
  };

  /** Build a full vehicle object and derive its CO2 intensity (g/km). */
  function makeVehicle(o) {
    var t = vehicleTypes[o.type];
    var v = {
      id: o.id, type: o.type, company: o.company || '', model: o.model || '',
      fuel: t.fuel, ev: t.ev, generic: !!o.generic,
      mileage: t.ev ? null : (o.mileage || t.mileage),
      battery: t.ev ? (o.battery || t.battery) : null,
      range: o.range || (t.ev ? t.range : Math.round((o.mileage || t.mileage) * t.tank))
    };
    v.label = v.generic ? t.label : (v.company + ' ' + v.model).trim();
    v.whPerKm = t.ev ? (v.battery * 1000 / v.range) : null;
    v.gPerKm = t.ev ? Math.round(v.whPerKm * GRID_G_PER_WH) : Math.round(CO2_PER_LITRE[t.fuel] / v.mileage);
    return v;
  }

  function genericVehicle(typeId) { return makeVehicle({ id: 'generic-' + typeId, type: typeId, generic: true }); }

  var seedGarage = [
    { id: 'veh-nexon',  type: 'electric-car', company: 'Tata',   model: 'Nexon EV',   battery: 40.5, range: 312 },
    { id: 'veh-activa', type: 'petrol-bike',  company: 'Honda',  model: 'Activa 6G',  mileage: 50,   range: 480 },
    { id: 'veh-city',   type: 'petrol-car',   company: 'Honda',  model: 'City',       mileage: 17,   range: 680 }
  ];

  /* ---------- EV charging stations (SAMPLE DATA) ---------- */
  var stations = [
    { id: 'st-volthub',    name: 'VoltHub Central',          x: 600,  y: 850,  connectors: ['CCS2', 'Type 2'],            kw: 60,  total: 6,  free: 4,  area: 'City Central' },
    { id: 'st-lakeside',   name: 'GreenCharge Lakeside',     x: 850,  y: 500,  connectors: ['CCS2', 'CHAdeMO'],           kw: 50,  total: 4,  free: 1,  area: 'Lakeside Mall' },
    { id: 'st-techpark',   name: 'EcoPlug Tech Park',        x: 1000, y: 1150, connectors: ['CCS2'],                      kw: 120, total: 8,  free: 6,  area: 'Tech Park' },
    { id: 'st-oldtown',    name: 'ChargeNest Old Town',      x: 400,  y: 650,  connectors: ['Type 2', '3-Pin AC'],        kw: 22,  total: 4,  free: 0,  area: 'Old Town' },
    { id: 'st-sunrise',    name: 'Sunrise EV Bay',           x: 750,  y: 1000, connectors: ['Type 2', '3-Pin AC'],        kw: 7,   total: 6,  free: 5,  area: 'Sunrise Hospital' },
    { id: 'st-highway',    name: 'RapidVolt Highway Plaza',  x: 1100, y: 750,  connectors: ['CCS2', 'CHAdeMO'],           kw: 120, total: 10, free: 7,  area: 'Ring Road East' },
    { id: 'st-maple',      name: 'Maple EV Point',           x: 500,  y: 1350, connectors: ['Type 2'],                    kw: 22,  total: 2,  free: 2,  area: 'Maple Heights' },
    { id: 'st-airport',    name: 'Skyline Airport Fast Hub', x: 950,  y: 200,  connectors: ['CCS2', 'CHAdeMO', 'Type 2'], kw: 150, total: 12, free: 3,  area: 'Airport T1' },
    { id: 'st-riverside',  name: 'Riverside Quick Charge',   x: 200,  y: 450,  connectors: ['Type 2', 'CCS2'],            kw: 30,  total: 4,  free: 2,  area: 'Riverside College' },
    { id: 'st-stadium',    name: 'Stadium Charge Hub',       x: 250,  y: 1300, connectors: ['CCS2', 'Type 2'],            kw: 60,  total: 6,  free: 0,  area: 'Eco Stadium' },
    { id: 'st-community',  name: 'Green Park Community',     x: 350,  y: 1000, connectors: ['Type 2', '3-Pin AC'],        kw: 7,   total: 3,  free: 2,  area: 'Green Park' },
    { id: 'st-botanical',  name: 'Botanical Eco Point',      x: 700,  y: 350,  connectors: ['Type 2', 'CCS2'],            kw: 50,  total: 4,  free: 3,  area: 'Botanical Gardens' }
  ];
  stations.forEach(function (s) { s.type = 'station'; s.icon = 'zap'; s.sampleFree = s.free; });

  /** Swap in the stations stored in the database. The same array object is kept, so every reference to it stays valid. */
  function setStations(list) {
    if (!Array.isArray(list) || !list.length) return;
    stations.length = 0;
    list.forEach(function (s) {
      s.type = 'station'; s.icon = 'zap';
      if (s.sampleFree == null) s.sampleFree = s.free;
      stations.push(s);
    });
  }

  /* ---------- Misc ---------- */
  var routeKinds = {
    shortest: { id: 'shortest', title: 'Shortest Route', via: 'via City Centre',    note: 'Fewest kilometres, but stop-and-go traffic.', speed: 26, flow: 1.18, signals: 22 },
    fastest:  { id: 'fastest',  title: 'Fastest Route',  via: 'via Ring Road',      note: 'Longer, but keeps moving at higher speed.',    speed: 43, flow: 1.08, signals: 6  },
    eco:      { id: 'eco',      title: 'Eco Route',      via: 'via Green Corridor', note: 'Steady speeds, fewer stops, tree-lined roads.', speed: 34, flow: 0.86, signals: 9  }
  };

  var ecoTips = [
    'Smooth acceleration can cut fuel use by up to 20%.',
    'Keeping tyres at the right pressure improves efficiency.',
    'Combining errands into one trip saves emissions.',
    'Pre-condition your EV while it is still plugged in.',
    'Avoiding rush hour reduces stop-and-go emissions.',
    'Ease off early: coasting to a stop wastes less energy.'
  ];

  var notifications = [
    { id: 1, icon: 'leaf',   title: 'Weekly eco report is ready', text: 'You saved 2.4 kg CO₂ compared with an average petrol car.', time: '2h ago',  unread: true  },
    { id: 2, icon: 'zap',    title: 'Charger freed up nearby',    text: 'ChargeNest Old Town now shows ports available (sample).',        time: '5h ago',  unread: true  },
    { id: 3, icon: 'award',  title: 'Badge unlocked: Green Streak', text: 'Five eco-friendly journeys in a row. Nice driving!',          time: 'Yesterday', unread: false },
    { id: 4, icon: 'sparkles', title: 'Tip of the day',           text: 'Pre-cool your EV while plugged in to save range.',              time: '2 days ago', unread: false }
  ];

  /* ---------- Calculations ---------- */
  var BASELINE_G_PER_KM = 170;   // "average petrol car" used for the carbon-saved figure

  var calc = {
    BASELINE_G_PER_KM: BASELINE_G_PER_KM,
    /** Eco score 0-100 from the effective CO2 intensity (g/km) of a trip. */
    ecoScore: function (gPerKmEffective) {
      return Math.max(6, Math.min(99, Math.round(100 - gPerKmEffective / 3.2)));
    },
    /** Grams of CO2 saved against an average petrol car over the same distance. */
    carbonSaved: function (distKm, co2g) { return Math.max(0, Math.round(distKm * BASELINE_G_PER_KM - co2g)); },
    trees: function (g) { return g / 1000 / 21 * 365; },   // a tree absorbs ~21 kg CO2 a year; shown as "tree-days"
    scoreLabel: function (s) { return s >= 85 ? 'Excellent' : s >= 70 ? 'Great' : s >= 55 ? 'Good' : s >= 40 ? 'Fair' : 'Poor'; },
    scoreTone: function (s) { return s >= 70 ? 'green' : s >= 45 ? 'amber' : 'red'; },
    /** Range left (km) for an EV at a battery percentage. */
    rangeLeft: function (vehicle, pct) { return Math.round((vehicle.range || 0) * pct / 100); },
    /** Straight-line map distance converted to a road-ish km figure. */
    mapKm: function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y) * WORLD.kmPerUnit * 1.3; }
  };

  /* ---------- Helpers ---------- */
  function findPlace(id) {
    if (id === 'current') return currentLocation;
    var i, all = places.concat(stations);
    for (i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /** Deterministic PRNG so the seeded history is stable. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /**
   * Build ~5 months of believable journeys for the demo account: roughly 0-3 trips a day,
   * fewer at weekends, spread evenly (so week-on-week and month-on-month figures are sensible).
   */
  function seedJourneys(garage) {
    var rnd = mulberry32(20260316);
    var out = [], now = Date.now(), day, k, seq = 0;
    var HOURS = [7, 8, 9, 10, 12, 13, 15, 17, 18, 19, 20];
    var pool = places.filter(function (p) { return p.id !== 'green-park'; });
    var vehiclePick = [
      ['veh-nexon', 0.38], ['veh-activa', 0.24], ['veh-city', 0.20], ['generic-electric-bike', 0.10], ['generic-diesel-car', 0.08]
    ];
    var vehicles = {};
    garage.forEach(function (v) { vehicles[v.id] = v; });
    vehicles['generic-electric-bike'] = genericVehicle('electric-bike');
    vehicles['generic-diesel-car'] = genericVehicle('diesel-car');

    function pickVehicle() {
      var r = rnd(), acc = 0, k;
      for (k = 0; k < vehiclePick.length; k++) { acc += vehiclePick[k][1]; if (r <= acc) return vehicles[vehiclePick[k][0]]; }
      return vehicles['veh-nexon'];
    }

    for (day = 0; day < 150; day++) {
      var base = new Date(now - day * 86400000);
      var dow = base.getDay(), weekend = dow === 0 || dow === 6, r = rnd();
      var trips = weekend ? (r < 0.52 ? 0 : r < 0.88 ? 1 : 2) : (r < 0.34 ? 0 : r < 0.78 ? 1 : r < 0.96 ? 2 : 3);
      if (day < 3 && trips === 0) trips = 1;                 // always something recent to show
      for (k = 0; k < trips; k++) {
        var d = new Date(base);
        d.setHours(HOURS[Math.floor(rnd() * HOURS.length)], Math.floor(rnd() * 60), 0, 0);
        if (d.getTime() > now - 20 * 60000) continue;        // never in the future
        var home = rnd() < 0.55;
        var a = home ? places[0] : pool[Math.floor(rnd() * pool.length)];
        var b = pool[Math.floor(rnd() * pool.length)];
        if (a.id === b.id) b = pool[(pool.indexOf(b) + 3) % pool.length];
        if (rnd() < 0.3) { var t = a; a = b; b = t; }
        var veh = pickVehicle();
        var kindR = rnd();
        var kind = kindR < 0.5 ? 'eco' : kindR < 0.75 ? 'fastest' : 'shortest';
        var m = Eco.geo.routeMetrics(a, b, kind, veh);
        var early = rnd() < 0.06;
        var frac = early ? 0.35 + rnd() * 0.4 : 1;
        var dist = +(m.distanceKm * frac).toFixed(1);
        var co2 = Math.round(m.co2g * frac);
        out.push({
          id: 'j' + (1000 + seq++), fromId: a.id, toId: b.id, from: a.name, to: b.name,
          vehicleId: veh.id, vehicleType: veh.type, vehicleLabel: veh.label, routeKind: kind,
          date: d.toISOString(), distanceKm: dist, durationMin: Math.max(3, Math.round(m.timeMin * frac)),
          co2g: co2, savedG: calc.carbonSaved(dist, co2), ecoScore: m.ecoScore,
          status: early ? 'ended-early' : 'completed'
        });
      }
    }
    out.sort(function (x, y) { return new Date(y.date) - new Date(x.date); });
    return out;
  }

  Eco.data = {
    WORLD: WORLD, places: places, currentLocation: currentLocation, vehicleTypes: vehicleTypes, seedGarage: seedGarage,
    stations: stations, routeKinds: routeKinds, ecoTips: ecoTips, notifications: notifications,
    makeVehicle: makeVehicle, genericVehicle: genericVehicle, findPlace: findPlace, seedJourneys: seedJourneys, setStations: setStations,
    CO2_PER_LITRE: CO2_PER_LITRE, GRID_G_PER_WH: GRID_G_PER_WH
  };
  Eco.calc = calc;
})();
