/* ==========================================================================
   EcoRoute - data.js
   Vehicle types, the emission maths and the SAMPLE journey history used by the demo account.
   (Places, routes and charging stations are real now: see geo.js.)
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

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

  /** The demo account's garage (a new account starts with an empty one). */
  var seedGarage = [
    { id: 'veh-nexon',  type: 'electric-car', company: 'Tata',   model: 'Nexon EV',   battery: 40.5, range: 312 },
    { id: 'veh-activa', type: 'petrol-bike',  company: 'Honda',  model: 'Activa 6G',  mileage: 50,   range: 480 },
    { id: 'veh-city',   type: 'petrol-car',   company: 'Honda',  model: 'City',       mileage: 17,   range: 680 }
  ];

  /* ---------- Misc ---------- */
  var routeKinds = {
    shortest: { id: 'shortest', title: 'Shortest Route' },
    fastest:  { id: 'fastest',  title: 'Fastest Route' },
    eco:      { id: 'eco',      title: 'Eco Route' }
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
    { id: 2, icon: 'zap',    title: 'Charging stations near you', text: 'Open the Charging tab to see EV chargers around you.',            time: '5h ago',  unread: true  },
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
    rangeLeft: function (vehicle, pct) { return Math.round((vehicle.range || 0) * pct / 100); }
  };

  /** Deterministic PRNG so the sample history is stable. */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var SAMPLE_PLACES = ['Home', 'Office', 'City Mall', 'Central Station', 'Sunrise Hospital', 'Riverside College', 'Airport', 'Old Town Market', 'Botanical Gardens', 'Eco Stadium', 'Tech Park', 'Promenade'];

  /**
   * About five months of believable SAMPLE journeys for the demo account: roughly 0-3 trips a day, fewer at weekends.
   * They have place names but no map position (they are samples, not trips anyone really made); sample: true marks them.
   */
  function seedJourneys(garage) {
    var rnd = mulberry32(20260316);
    var out = [], now = Date.now(), day, k, seq = 0;
    var HOURS = [7, 8, 9, 10, 12, 13, 15, 17, 18, 19, 20];
    var vehiclePick = [['veh-nexon', 0.38], ['veh-activa', 0.24], ['veh-city', 0.20], ['generic-electric-bike', 0.10], ['generic-diesel-car', 0.08]];
    var vehicles = {};
    garage.forEach(function (v) { vehicles[v.id] = v; });
    vehicles['generic-electric-bike'] = genericVehicle('electric-bike');
    vehicles['generic-diesel-car'] = genericVehicle('diesel-car');
    function pickVehicle() {
      var r = rnd(), acc = 0, i;
      for (i = 0; i < vehiclePick.length; i++) { acc += vehiclePick[i][1]; if (r <= acc && vehicles[vehiclePick[i][0]]) return vehicles[vehiclePick[i][0]]; }
      return vehicles['generic-electric-bike'];
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
        var a = rnd() < 0.55 ? 'Home' : SAMPLE_PLACES[1 + Math.floor(rnd() * (SAMPLE_PLACES.length - 1))];
        var b = SAMPLE_PLACES[1 + Math.floor(rnd() * (SAMPLE_PLACES.length - 1))];
        if (a === b) b = SAMPLE_PLACES[1 + (SAMPLE_PLACES.indexOf(b) + 3) % (SAMPLE_PLACES.length - 1)];
        var veh = pickVehicle();
        var kindR = rnd(), kind = kindR < 0.5 ? 'eco' : kindR < 0.75 ? 'fastest' : 'shortest';
        var early = rnd() < 0.06, frac = early ? 0.35 + rnd() * 0.4 : 1;
        var km = 1.2 + Math.pow(rnd(), 1.6) * 17;
        var speed = (kind === 'shortest' ? 26 : kind === 'eco' ? 34 : 43) * (0.94 + 0.12 * rnd());
        var flow = (kind === 'shortest' ? 1.18 : kind === 'eco' ? 0.86 : 1.08) * (0.97 + 0.06 * rnd());
        var dist = +Math.max(0.2, km * frac).toFixed(1), co2 = Math.round(dist * veh.gPerKm * flow);
        out.push({
          id: 'j' + (1000 + seq++), fromId: 'sample', toId: 'sample', from: a, to: b,
          vehicleId: veh.id, vehicleType: veh.type, vehicleLabel: veh.label, routeKind: kind, sample: true,
          date: d.toISOString(), distanceKm: dist, durationMin: Math.max(3, Math.round(dist / speed * 60)),
          co2g: co2, savedG: calc.carbonSaved(dist, co2), ecoScore: calc.ecoScore(co2 / Math.max(dist, 0.1)),
          status: early ? 'ended-early' : 'completed'
        });
      }
    }
    out.sort(function (x, y) { return new Date(y.date) - new Date(x.date); });
    return out;
  }

  Eco.data = {
    vehicleTypes: vehicleTypes, seedGarage: seedGarage, routeKinds: routeKinds, ecoTips: ecoTips, notifications: notifications,
    makeVehicle: makeVehicle, genericVehicle: genericVehicle, seedJourneys: seedJourneys,
    CO2_PER_LITRE: CO2_PER_LITRE, GRID_G_PER_WH: GRID_G_PER_WH
  };
  Eco.calc = calc;
})();
