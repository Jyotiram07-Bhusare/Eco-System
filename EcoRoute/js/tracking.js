/* ==========================================================================
   EcoRoute - tracking.js
   Screens 9 and 11: Live Navigation and Journey Summary.

   NOTHING MOVES BY ITSELF. During a journey the vehicle on the map advances only when:
     * "Live GPS" (default): you really move. The device location sensor (Geolocation API) reports
       where you are; the real distance you moved (x the chosen scale) advances the vehicle along
       the route. Standing still, or GPS jitter, adds nothing.
     * "Demo drive": you hold the drive button (or the Up arrow key). For desktops without GPS.

   The map, the route and the charging stations are still a simulated city, but the position is real:
   Live GPS takes it from Eco.location (the shared Geolocation stream). With the backend running the
   positions of a Live GPS journey are saved to MySQL and linked to the journey; the finished journey
   is saved too (or kept in an outbox until the server is reachable). "Save my location history"
   off in Profile = no coordinates or addresses leave this device.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, esc = ui.esc, fmt = ui.fmt;
  var trip = Eco.trip;

  var GPS_SCALES = [1, 5, 10, 20];        // GPS mode: 1 m you move = N m on the map (1 = real distance)
  var DEMO_SCALES = [5, 10, 20, 40];      // demo drive: the vehicle covers ground N x faster than real time
  var GPS_MIN_ACC = 30;                   // metres: fixes less accurate than this are ignored (desktop Wi-Fi/IP positions)
  var GPS_MAX_SPEED = 70;                 // m/s (~250 km/h): faster "movement" is a GPS glitch, not driving
  var map = null, sim = null, summaryMap = null;

  var ROAD_V = ['West Bypass', 'Maple Avenue', 'Cedar Road', 'Central Boulevard', 'Orchard Lane', 'Lakeview Drive', 'Garden Avenue', 'Station Road', 'Willow Street', 'University Road', 'Harbour Avenue', 'Ring Road East', 'East Bypass'];
  var ROAD_H = ['North Ring Road', 'Skyline Link', 'Airport Road', 'Botanical Way', 'College Road', 'Market Street', 'Clock Tower Road', 'Riverside Drive', 'Hospital Road', 'Bridge Street', 'River Road', 'Promenade Way', 'Tech Park Avenue', 'Stadium Road', 'Green Corridor', 'Maple Link', 'South Ring Road'];

  /* ---------- turn-by-turn steps from the route geometry ---------- */
  function roadName(a, b) { return a.y === b.y ? (ROAD_H[Math.round(a.y / 100)] || 'Main Road') : (ROAD_V[Math.round(a.x / 100)] || 'Main Road'); }
  function sign(n) { return n > 0 ? 1 : n < 0 ? -1 : 0; }

  function buildSteps(route, dest) {
    var pts = route.points, cum = [0], i, steps = [];
    for (i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y));
    var total = cum[cum.length - 1] || 1;
    for (i = 1; i < pts.length - 1; i++) {
      var inx = sign(pts[i].x - pts[i - 1].x), iny = sign(pts[i].y - pts[i - 1].y);
      var outx = sign(pts[i + 1].x - pts[i].x), outy = sign(pts[i + 1].y - pts[i].y);
      var right = (inx * outy - iny * outx) > 0;      // screen coordinates: y grows downwards
      steps.push({ frac: cum[i] / total, icon: right ? 'corner-up-right' : 'corner-up-left', main: 'Turn ' + (right ? 'right' : 'left') + ' onto ' + roadName(pts[i], pts[i + 1]) });
    }
    steps.push({ frac: 1, icon: 'flag', main: 'Arrive at ' + dest.name });
    return steps;
  }

  function meters(km) {
    var m = km * 1000;
    return m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + ' m' : fmt.km(km) + ' km';
  }
  /** "250 m" below a kilometre, "3.4 km" above: small real movements stay visible. */
  function distText(km) { return km < 1 ? Math.round(km * 1000) + ' m' : fmt.km(km) + ' km'; }
  function setDist(valueSel, unitSel, km) {
    var v = $(valueSel), u = $(unitSel);
    if (km < 1) { v.textContent = Math.round(km * 1000); u.textContent = 'm'; } else { v.textContent = fmt.km(km); u.textContent = 'km'; }
  }

  function noop() { /* ignore */ }

  /* =====================================================================
     Live navigation
     ===================================================================== */
  function prepare(route) {
    abort();
    var v = Eco.vehicles.active(), st = Eco.store.state.settings;
    sim = {
      route: route, vehicle: v, status: 'idle',
      mode: st.moveMode === 'demo' ? 'demo' : 'gps',
      gpsScale: GPS_SCALES.indexOf(st.gpsScale) > -1 ? st.gpsScale : 1,
      demoScale: DEMO_SCALES.indexOf(st.demoScale) > -1 ? st.demoScale : 10,
      travelled: 0, shown: 0, camKm: -1, t: 0, rt: 0, co2: 0, speed: 0,
      D: route.distanceKm, T: route.timeMin, avg: route.distanceKm / (route.timeMin / 60),
      batt: Eco.store.state.battery, simStart: null,
      steps: buildSteps(route, trip.destination), stepIdx: 0, follow: true,
      raf: 0, lastTs: 0, noFollowUntil: 0, uiAt: 0,
      // live GPS state (gpsOff = the unsubscribe functions of the shared location stream)
      gpsOff: null, gpsState: 'idle', acc: null, anchor: null, lastMoveAt: 0, gpsSpeedMs: 0, weakSince: 0, warned: {},
      // what the location sensor reported during this journey (saved with it)
      trackSession: null, startFix: null, lastFix: null, fromLabel: null,
      // demo drive state
      driving: false
    };
  }

  function stationStatus(s) { return s.free === 0 ? 'full' : s.free / s.total <= 0.34 ? 'busy' : 'available'; }
  function scale() { return sim.mode === 'gps' ? sim.gpsScale : sim.demoScale; }

  function navEnter() {
    if (!sim) { Eco.nav.go('home', { replace: true }); return; }
    if (map) { map.destroy(); map = null; }
    var v = sim.vehicle, r = sim.route, d = trip.destination;
    map = Eco.Map.create($('#nav-map'), {
      label: 'Simulated live navigation map', controls: false, maxZoom: 1.6,
      onUserMove: function () { if (sim && sim.follow) { sim.follow = false; $('[data-action="nav-recenter"]').style.color = 'var(--cur)'; } },
      onMarkerClick: function (id) { if (id.indexOf('st:') === 0) stationSheet(id.slice(3)); }
    });
    var markers = [];
    if (v.ev) Eco.data.stations.forEach(function (s) { markers.push({ id: 'st:' + s.id, type: 'station', x: s.x, y: s.y, status: stationStatus(s) }); });
    markers.push({ id: 'start', type: 'start', x: r.points[0].x, y: r.points[0].y });
    markers.push({ id: 'dest', type: 'dest', x: d.x, y: d.y, icon: d.type === 'station' ? 'zap' : 'flag', label: d.name });
    markers.push({ id: 'veh', type: 'vehicle', x: r.points[0].x, y: r.points[0].y, rotation: 0 });
    map.setMarkers(markers);
    map.setRoutes([{ id: 'r', d: r.d, active: true, progress: true, width: 8 }]);
    var p0 = map.pointAt('r', 0);
    if (p0) map.moveMarker('veh', p0.x, p0.y, p0.angle);
    sim.follow = true; $('[data-action="nav-recenter"]').style.color = '';
    $('#nv-dest').textContent = d.name;
    $('#nv-ev').classList.toggle('hidden', !v.ev);
    paintModeChips(); renderControls(); paintStats(true); paintBanner(true);
    Eco.icons.hydrate($('#screen-navigation'));
    map.fit(r.points, { pad: navPads(), maxZoom: 1.0 });       // after the panel is filled: its height sets the padding
  }

  /** Keep the route clear of the banner, the side buttons and the bottom panel. */
  function navPads() {
    var short = $('#app').clientHeight < 700;
    return Eco.Map.overlayPads($('#nav-map'), $('#screen-navigation .nav-top'), $('#nav-panel'), { top: short ? 46 : 54, right: 108, bottom: short ? 24 : 40, left: 64 });
  }

  function navLeave() {
    if (sim && (sim.status === 'idle' || sim.status === 'done')) { cancelAnimationFrame(sim.raf); stopGps(); }
    if (map && !(sim && (sim.status === 'running' || sim.status === 'paused'))) { map.destroy(); map = null; }
  }

  /* ---------- side chips + controls ---------- */
  function paintModeChips() {
    var gps = sim.mode === 'gps';
    $('#nav-mode').textContent = gps ? 'GPS' : 'DEMO';
    $('#nav-mode').setAttribute('aria-label', 'Movement source: ' + (gps ? 'live GPS' : 'demo drive') + '. Tap to switch');
    $('#nav-speed').textContent = scale() + '×';
    $('#nav-speed').setAttribute('aria-label', gps ? 'Distance scale ' + sim.gpsScale + ' times. Tap to change' : 'Demo drive speed ' + sim.demoScale + ' times. Tap to change');
    $('#nav-tag-text').textContent = gps ? 'Live GPS · simulated map' : 'Demo drive · simulated map';
  }

  function renderControls() {
    var c = $('#nav-controls'), s = sim.status;
    c.classList.toggle('col', s === 'idle');
    if (s === 'idle') {
      c.innerHTML = '<p class="nav-hint">' + (sim.mode === 'gps'
        ? '<b>Live GPS:</b> the vehicle moves only when you really move. No GPS here? Tap <b>GPS</b> (top right) for a demo drive.'
        : '<b>Demo drive:</b> after Start, hold the drive button (or the ↑ key) to move. Nothing moves by itself.') + '</p>' +
        '<button type="button" class="btn btn-primary btn-lg" data-action="nav-start">' + ui.icon('play', 20) + 'Start Journey</button>';
    } else if (s === 'running' || s === 'paused') {
      var drive = s === 'running' && sim.mode === 'demo'
        ? '<button type="button" class="btn btn-primary btn-lg drive-btn" id="drive-btn" aria-label="Hold to drive. You can also hold the Up arrow key">' + ui.icon('navigation-2', 20) + '<span>Hold to drive</span></button>' : '';
      c.innerHTML = drive +
        (s === 'running'
          ? '<button type="button" class="btn btn-secondary btn-lg" data-action="nav-pause">' + ui.icon('pause', 20) + 'Pause</button>'
          : '<button type="button" class="btn btn-primary btn-lg" data-action="nav-resume">' + ui.icon('play', 20) + 'Resume</button>') +
        '<button type="button" class="btn btn-danger-soft btn-lg" data-action="nav-end">' + ui.icon('square', 18) + 'End Journey</button>';
    } else {
      c.innerHTML = '<button type="button" class="btn btn-primary btn-lg" disabled>' + ui.icon('check', 20) + 'Arrived</button>';
    }
  }

  /* ---------- stats & banner ---------- */
  function simClock(addMin) {
    var base = (sim.simStart || new Date()).getTime();
    return new Date(base + (sim.t + addMin * 60) * 1000);
  }

  /** Minutes still to go: planned pace, or your real pace once there is enough live data. */
  function remainingMin() {
    var rem = Math.max(0, sim.D - sim.travelled), v = sim.avg;
    if (sim.mode === 'gps' && sim.gpsScale === 1 && sim.rt > 90 && sim.travelled > 0.3) {
      var obs = sim.travelled / (sim.rt / 3600);
      if (obs > 5) v = obs;
    }
    return rem / ui.clamp(v, 5, 130) * 60;
  }

  function statusText() {
    var gps = sim.mode === 'gps';
    if (sim.status === 'idle') return 'Ready · ' + (gps ? 'Live GPS' : 'Demo drive');
    if (sim.status === 'paused') return 'Paused';
    if (sim.status === 'done') return 'Arrived';
    if (!gps) return 'Demo drive' + (sim.driving ? ' · driving' : ' · hold to drive');
    if (sim.gpsState === 'ok') return 'Live GPS · ±' + Math.round(sim.acc) + ' metres';       // spelled out: the label is upper-cased ("M" would read as mega)
    return { waiting: 'Waiting for GPS…', weak: 'Weak GPS signal', lost: 'GPS signal lost', denied: 'Location blocked' }[sim.gpsState] || 'Live GPS';
  }

  function paintStats() {
    var rem = Math.max(0, sim.D - sim.travelled), remMin = remainingMin();
    var co2 = fmt.co2(sim.co2);
    setDist('#nv-travelled', '#nv-travelled-unit', sim.travelled);
    setDist('#nv-remaining', '#nv-remaining-unit', rem);
    if (!sim.simStart) { $('#nv-eta').textContent = '--:--'; $('#nv-eta-sub').textContent = 'ETA ' + fmt.dur(sim.T); }
    else {
      var eta = simClock(remMin), t = fmt.clock(eta).split(' ');
      $('#nv-eta').textContent = t[0]; $('#nv-eta-sub').textContent = t[1] + ' · ' + fmt.dur(remMin) + ' left';
    }
    $('#nv-co2').textContent = co2.v; $('#nv-co2-unit').textContent = co2.u;
    $('#nv-speed').textContent = Math.round(sim.status === 'running' ? sim.speed : 0);
    $('#nv-progress').style.width = (sim.D ? Math.min(100, sim.travelled / sim.D * 100) : 0).toFixed(1) + '%';
    $('#nv-state').textContent = statusText();
    if (sim.vehicle.ev) {
      var b = Math.max(0, sim.batt), bar = $('#nv-batt-bar');
      bar.style.width = b.toFixed(1) + '%';
      bar.className = b <= 8 ? 'crit' : b <= 20 ? 'low' : '';
      $('#nv-batt').textContent = Math.round(b) + '%';
      $('#nv-batt-range').textContent = '~' + Eco.calc.rangeLeft(sim.vehicle, b) + ' km range';
    }
  }

  function paintBanner() {
    var main = $('#nb-main'), sub = $('#nb-sub'), ic = $('#nb-ic');
    if (sim.status === 'idle') {
      ic.innerHTML = ui.icon('navigation-2', 22); main.textContent = 'Ready to start';
      sub.textContent = fmt.km(sim.D) + ' km · ' + fmt.dur(sim.T) + ' ' + sim.route.via;
      return;
    }
    if (sim.status === 'paused') { ic.innerHTML = ui.icon('pause', 22); main.textContent = 'Journey paused'; sub.textContent = 'Tap Resume to continue'; return; }
    if (sim.status === 'done') { ic.innerHTML = ui.icon('flag', 22); main.textContent = 'You have arrived'; sub.textContent = trip.destination ? trip.destination.name : ''; return; }
    if (sim.mode === 'gps' && sim.gpsState !== 'ok') {          // say why nothing is moving
      var g = {
        waiting: ['Waiting for GPS…', 'Allow location access if your browser asks'],
        weak: ['Weak GPS signal', '±' + Math.round(sim.acc || 0) + ' m. Move to an open area'],
        lost: ['GPS signal lost', 'Looking for a signal…'],
        denied: ['Location is blocked', 'Allow it in browser settings, or tap GPS for a demo drive']
      }[sim.gpsState] || ['Waiting for GPS…', ''];
      ic.innerHTML = ui.icon('locate-fixed', 22); main.textContent = g[0]; sub.textContent = g[1];
      return;
    }
    var step = sim.steps[Math.min(sim.stepIdx, sim.steps.length - 1)];
    var toStep = Math.max(0, step.frac * sim.D - sim.travelled);
    ic.innerHTML = ui.icon(step.icon, 22);
    main.textContent = step.main;
    sub.textContent = 'In ' + meters(toStep);
  }

  /* ---------- progress: shared by both movement sources ---------- */
  /** Apply real or demo movement of dKm (map km) at speedKmh: distance, CO2 and battery follow. */
  function advance(dKm, speedKmh) {
    dKm = Math.min(dKm, sim.D - sim.travelled);
    if (dKm <= 0) return;
    sim.travelled += dKm;
    if (!(sim.mode === 'gps' && sim.gpsScale === 1)) sim.t += dKm / sim.avg * 3600;     // simulated clock follows distance when scaled
    // CO2 rises faster in slow, stop-and-go stretches (m > 1) and slower when cruising
    var m = ui.clamp(1 + 0.35 * (sim.avg - speedKmh) / sim.avg, 0.85, 1.3);
    sim.co2 += dKm * sim.vehicle.gPerKm * sim.route.flow * m;
    if (sim.vehicle.ev) sim.batt = Math.max(0, sim.batt - dKm * sim.vehicle.whPerKm * sim.route.flow * m / (sim.vehicle.battery * 1000) * 100);
  }

  function moveVehicle(ts) {
    var frac = sim.D ? sim.shown / sim.D : 1;
    var pos = map.pointAt('r', frac * map.routeLength('r'));
    if (!pos) return;
    map.moveMarker('veh', pos.x, pos.y, pos.angle);
    map.setProgress('r', frac * pos.total);
    if (sim.follow && ts > sim.noFollowUntil) followCam(pos);
  }

  /** One animation frame. It never creates movement; it only shows and eases what the sources report. */
  function frame(ts) {
    if (!sim || sim.status !== 'running') return;
    var dtReal = Math.max(0, (ts - sim.lastTs) / 1000), dt = Math.min(dtReal, 0.1);
    sim.lastTs = ts;
    sim.rt += dtReal;
    if (sim.mode === 'gps' && sim.gpsScale === 1) sim.t += dtReal;     // real elapsed time

    if (sim.mode === 'demo') demoStep(dt); else gpsDecay(dt);

    // glide the marker to the true position (GPS fixes arrive in bursts)
    var diff = sim.travelled - sim.shown;
    if (diff !== 0) sim.shown = Math.abs(diff) < 1e-5 ? sim.travelled : sim.shown + diff * Math.min(1, dt * 6);
    if (sim.shown !== sim.camKm) { moveVehicle(ts); sim.camKm = sim.shown; }

    // next turn
    while (sim.stepIdx < sim.steps.length - 1 && sim.steps[sim.stepIdx].frac * sim.D - sim.travelled < 0.03) {
      sim.stepIdx++;
      var b = $('#nav-banner'); b.classList.remove('pulse-once'); void b.offsetWidth; b.classList.add('pulse-once');
    }

    if (ts - sim.uiAt > 90) { sim.uiAt = ts; paintStats(); paintBanner(); }
    if (sim.vehicle.ev) batteryAlerts();

    if (sim.travelled >= sim.D - 1e-6) { arrive(); return; }
    if (sim.vehicle.ev && sim.batt <= 0) { ui.toast('Battery empty. Journey ended.', 'error'); finish('ended-early'); return; }
    sim.raf = requestAnimationFrame(frame);
  }

  function followCam(pos) {
    var ch = $('#nav-map').clientHeight, panelH = $('#nav-panel').offsetHeight;
    var topEdge = 96, visibleMid = (topEdge + (ch - panelH)) / 2;
    var s = map.getView().s;
    map.setView({ cx: pos.x, cy: pos.y - (visibleMid - ch / 2) / s });
  }

  function batteryAlerts() {
    var b = sim.batt;
    if (b <= 20 && !sim.warn20) { sim.warn20 = true; ui.toast('Battery low (' + Math.round(b) + '%). Charging stations are marked on the map.', 'warn', { duration: 4200 }); }
    if (b <= 8 && !sim.warn8) { sim.warn8 = true; ui.toast('Battery critical. Find a charger soon.', 'error', { duration: 4200 }); }
  }

  /* ---------- movement source 1: live GPS ---------- */
  function startGps() {
    stopGps();
    if (!Eco.location.supported()) { gpsUnavailable(Eco.location.why()); return; }
    sim.gpsState = 'waiting'; sim.anchor = null; sim.acc = null; sim.speed = 0; sim.gpsSpeedMs = 0;
    if (!sim.trackSession) sim.trackSession = Eco.location.beginSession();     // positions are saved under this id, then linked to the journey
    sim.gpsOff = [Eco.location.onFix(onFix), Eco.location.onError(onGpsError)];
    Eco.location.retain('nav');
  }

  function stopGps() {
    if (!sim || !sim.gpsOff) return;
    sim.gpsOff.forEach(function (off) { off(); });
    sim.gpsOff = null;
    Eco.location.release('nav');
  }

  /**
   * A new device position (f = { lat, lon, acc, speed, heading, ts } from Eco.location). Distance only counts
   * when you moved further than the GPS noise radius since the last accepted position ("anchor").
   * Standing still, or the position wobbling inside that radius, adds nothing.
   */
  function onFix(f) {
    if (!sim || sim.mode !== 'gps' || sim.status !== 'running') return;
    var acc = f.acc != null ? f.acc : 999;
    sim.acc = acc;
    if (acc > GPS_MIN_ACC) {                                      // too imprecise to trust (typical on a PC): ignore
      sim.gpsState = 'weak'; sim.anchor = null;
      if (!sim.weakSince) sim.weakSince = Date.now();
      if (Date.now() - sim.weakSince > 12000 && !sim.warned.weak) {
        sim.warned.weak = true;
        ui.toast('No precise GPS here (±' + Math.round(acc) + ' m). Try a phone outdoors, or tap GPS (top right) for the demo drive.', 'warn', { duration: 6500 });
      }
      return;
    }
    sim.weakSince = 0; sim.gpsState = 'ok';
    var now = { lat: f.lat, lon: f.lon, t: f.ts || Date.now(), acc: acc };
    sim.lastFix = { lat: f.lat, lon: f.lon };                     // where the journey ended up, as far as the sensor knows
    if (!sim.startFix) sim.startFix = { lat: f.lat, lon: f.lon };
    if (!sim.anchor) { sim.anchor = now; return; }

    var d = Eco.location.haversine(sim.anchor, now);              // metres since the last accepted position
    var dt = Math.max(0.2, (now.t - sim.anchor.t) / 1000);
    var noise = Math.max(8, sim.anchor.acc * 1.0, acc * 1.0);     // inside this circle you are just standing still
    var reported = f.speed != null ? f.speed : null;
    if (d < noise) { if (acc < sim.anchor.acc) sim.anchor.acc = acc; return; }
    if (reported !== null && reported < 0.4 && d < noise * 2) return;   // the device itself says it is stationary
    if (d / dt > GPS_MAX_SPEED) { sim.anchor = now; return; }           // a GPS glitch, not driving
    sim.anchor = now;

    var speedMs = reported !== null && reported > 0.3 ? reported : d / dt;
    sim.gpsSpeedMs = sim.gpsSpeedMs ? sim.gpsSpeedMs * 0.5 + speedMs * 0.5 : speedMs;
    sim.speed = sim.gpsSpeedMs * 3.6 * sim.gpsScale;
    sim.lastMoveAt = performance.now();
    advance(d * sim.gpsScale / 1000, sim.speed);
  }

  function onGpsError(err) {
    if (!sim || sim.mode !== 'gps') return;
    if (err.code === 1) { if (!sim.warned.denied) { sim.warned.denied = true; gpsUnavailable('Location permission is blocked for this site.'); } return; }
    sim.gpsState = sim.anchor ? 'lost' : 'waiting';               // unavailable / timeout: keep waiting
  }

  /** No accepted movement for a moment means the vehicle has stopped: ease the speed to zero. */
  function gpsDecay(dt) {
    if (sim.speed > 0 && performance.now() - sim.lastMoveAt > 2500) {
      sim.speed *= Math.exp(-dt * 2.2);
      if (sim.speed < 0.4) sim.speed = 0;
    }
  }

  function gpsUnavailable(reason) {
    stopGps();
    if (!sim) return;
    sim.gpsState = 'denied'; sim.speed = 0;
    paintStats(); paintBanner();
    ui.confirm({
      title: 'Live GPS isn’t available', icon: 'locate-fixed',
      message: reason + ' You can still try the app with a demo drive: hold a button to move the vehicle.',
      confirmText: 'Use demo drive', cancelText: 'Not now'
    }).then(function (ok) { if (ok && sim) setMode('demo'); });
  }

  /* ---------- movement source 2: demo drive (hold to drive) ---------- */
  function demoStep(dt) {
    var target = sim.driving ? Math.max(8, sim.avg * (1 + 0.18 * Math.sin(sim.rt / 3.1) + 0.08 * Math.sin(sim.rt / 1.3))) : 0;
    sim.speed += (target - sim.speed) * Math.min(1, dt * (target > sim.speed ? 3.2 : 2.4));     // pick up quickly, stop smoothly
    if (!sim.driving && sim.speed < 0.4) sim.speed = 0;
    if (sim.speed > 0) advance(sim.speed * (dt * sim.demoScale) / 3600, sim.speed);
  }

  function markDrive(on) {
    if (!sim) return;
    sim.driving = on;
    var b = $('#drive-btn');
    if (b) { b.classList.toggle('on', on); $('span', b).textContent = on ? 'Driving…' : 'Hold to drive'; }
  }

  /* ---------- mode switching ---------- */
  function setMode(mode, quiet) {
    if (!sim || sim.mode === mode) return;
    stopGps(); markDrive(false);
    sim.mode = mode; sim.speed = 0; sim.anchor = null; sim.gpsState = 'idle';
    Eco.store.state.settings.moveMode = mode; Eco.store.save();
    if (sim.status === 'running' && mode === 'gps') startGps();
    paintModeChips(); renderControls(); paintStats(); paintBanner();
    Eco.icons.hydrate($('#screen-navigation'));
    if (!quiet) ui.toast(mode === 'gps' ? 'Live GPS: the map moves only when you move' : 'Demo drive: hold the drive button to move', 'info', { duration: 2400 });
  }

  /* ---------- journey controls ---------- */
  function start() {
    if (!sim || sim.status !== 'idle') return;
    var v = sim.vehicle;
    if (v.ev && Eco.calc.rangeLeft(v, sim.batt) < sim.D) {
      ui.toast('Battery may not last the whole trip (~' + Eco.calc.rangeLeft(v, sim.batt) + ' km range).', 'warn', { duration: 4200 });
    }
    sim.status = 'running'; sim.simStart = new Date(); sim.lastTs = performance.now(); sim.follow = true;
    sim.fromLabel = Eco.location.label();                        // the street address you leave from (null when unknown)
    $('[data-action="nav-recenter"]').style.color = '';
    var p = map.pointAt('r', 0);
    sim.noFollowUntil = performance.now() + 700;
    var ch = $('#nav-map').clientHeight, panelH = $('#nav-panel').offsetHeight, visibleMid = (96 + (ch - panelH)) / 2;
    map.setView({ cx: p.x, cy: p.y - (visibleMid - ch / 2) / 0.95, s: 0.95 }, 650);
    if (sim.mode === 'gps') startGps();                          // the browser asks for location permission here
    renderControls(); paintStats(); paintBanner();
    ui.toast(sim.mode === 'gps' ? 'Journey started. The map moves as you move.' : 'Journey started. Hold the drive button to move.', 'success');
    Eco.icons.hydrate($('#screen-navigation'));
    sim.raf = requestAnimationFrame(frame);
  }

  function pause() {
    if (!sim || sim.status !== 'running') return;
    sim.status = 'paused'; cancelAnimationFrame(sim.raf);
    stopGps(); markDrive(false); sim.speed = 0; sim.anchor = null;
    if (sim.vehicle.ev) setBatterySilently();
    renderControls(); paintStats(); paintBanner();
    Eco.icons.hydrate($('#screen-navigation'));
  }

  function resume() {
    if (!sim || sim.status !== 'paused') return;
    sim.status = 'running'; sim.lastTs = performance.now();
    if (sim.mode === 'gps') startGps();                          // fresh anchor: movement while paused never counts
    renderControls(); paintStats(); paintBanner();
    Eco.icons.hydrate($('#screen-navigation'));
    sim.raf = requestAnimationFrame(frame);
  }

  function setBatterySilently() { Eco.vehicles.setBattery(Math.round(sim.batt)); }

  function confirmEnd() {
    if (!sim || (sim.status !== 'running' && sim.status !== 'paused')) return Promise.resolve(true);
    var wasRunning = sim.status === 'running';
    if (wasRunning) pause();
    return ui.confirm({
      title: 'End this journey?', icon: 'flag',
      message: 'You’ve travelled ' + distText(sim.travelled) + ' of ' + distText(sim.D) + '. ' + (sim.travelled >= 0.3 ? 'Your progress will be saved to History.' : 'It is too short to be saved.'),
      confirmText: 'End journey', cancelText: 'Keep going', danger: true
    }).then(function (ok) {
      if (!sim) return ok;                    // the journey is gone (e.g. the login session ended while this dialog was open)
      if (ok) finish(sim.travelled >= sim.D * 0.98 ? 'completed' : 'ended-early');
      else if (wasRunning) resume();
      return ok;
    });
  }

  function arrive() {
    sim.status = 'done'; sim.travelled = sim.D; sim.speed = 0;
    stopGps(); markDrive(false);
    paintStats(); paintBanner(); renderControls();
    Eco.icons.hydrate($('#screen-navigation'));
    ui.toast('You have arrived!', 'success');
    ui.vibrate([40, 60, 40]);
    setTimeout(function () { if (sim && sim.status === 'done') finish('completed'); }, 1300);
  }

  /** opts.rescue: the login session ended mid-journey. Keep the journey for this account, without any screen change. */
  function finish(status, opts) {
    if (!sim) return;
    opts = opts || {};
    cancelAnimationFrame(sim.raf); stopGps();
    var s = sim, km = +s.travelled.toFixed(2), v = s.vehicle, d = trip.destination, o = trip.origin;
    s.status = 'done';
    if (km < 0.3 && status !== 'completed') {
      ui.toast('Journey cancelled. It was too short to record.', 'info');
      cleanup(true); Eco.nav.back(); return;
    }
    var co2 = Math.round(s.co2), dur = Math.max(1, Math.round(s.t / 60));
    var here = o.id === 'current';
    var j = {
      id: 'j' + Date.now(), fromId: here ? 'green-park' : o.id, toId: d.id, from: here ? (s.fromLabel || 'Green Park') : o.name, to: d.name,
      vehicleId: v.id, vehicleType: v.type, vehicleLabel: v.label, routeKind: s.route.id, source: s.mode,
      date: (s.simStart || new Date()).toISOString(), distanceKm: km, durationMin: dur, co2g: co2,
      savedG: Eco.calc.carbonSaved(km, co2), ecoScore: Eco.calc.ecoScore(co2 / Math.max(km, 0.1)), status: status
    };
    var server = Eco.api.authed(), payload = null, hasTrack = false;
    if (server) {
      j.clientRef = Eco.api.clientRef(); j.sync = 'pending';
      payload = {
        clientRef: j.clientRef, fromId: j.fromId, toId: j.toId, from: j.from, to: j.to, vehicleId: j.vehicleId, vehicleType: j.vehicleType,
        vehicleLabel: j.vehicleLabel, routeKind: j.routeKind, source: j.source, date: j.date, distanceKm: j.distanceKm,
        durationMin: j.durationMin, co2g: j.co2g, status: j.status
      };
      // coordinates and addresses only leave the device when "Save my location history" is on
      if (Eco.store.state.settings.shareLocation !== false && s.startFix) {
        payload.startLat = +s.startFix.lat.toFixed(6); payload.startLon = +s.startFix.lon.toFixed(6);
        if (s.fromLabel) payload.startAddress = s.fromLabel;
        if (s.lastFix) { payload.endLat = +s.lastFix.lat.toFixed(6); payload.endLon = +s.lastFix.lon.toFixed(6); }
        if (s.trackSession) { payload.trackSessionId = s.trackSession; hasTrack = true; }
      }
    }
    var owner = server ? Eco.store.state.user.id : null;           // asked now: a 401 below signs the account out
    if (opts.rescue) {
      Eco.api.queueJourney(payload, owner);                        // saved after the next sign-in of this account
      cleanup(true); Eco.resetTrip();
      return true;
    }
    Eco.store.state.journeys.unshift(j);
    if (v.ev) Eco.vehicles.setBattery(Math.round(s.batt)); else Eco.store.save();
    cleanup(true);
    Eco.resetTrip();
    Eco.nav.go('summary', { params: { id: j.id, fresh: true }, reset: ['home'], force: true });
    if (server) persistJourney(j, payload, hasTrack, owner);
  }

  /**
   * The login session ended while a journey was running or paused. Instead of losing it, keep what was travelled (at
   * least 300 m) for this account; it is saved after the next sign-in. Returns true when a journey was kept.
   */
  function rescue() {
    if (!sim || (sim.status !== 'running' && sim.status !== 'paused') || sim.travelled < 0.3 || !Eco.api.authed()) return false;
    return finish(sim.travelled >= sim.D * 0.98 ? 'completed' : 'ended-early', { rescue: true }) === true;
  }

  /**
   * Save the finished journey in the database. The recorded GPS points go first (the server links them to the
   * journey by session id). A journey the server can't be asked about is queued and retried (see api.js).
   */
  function persistJourney(j, payload, hasTrack, owner) {
    var points = hasTrack ? Eco.location.flush().catch(noop) : Promise.resolve();
    points.then(function () { return Eco.api.saveJourney(payload, owner); }).then(function (r) {
      if (r.state === 'saved') {
        onSynced(Eco.api.adoptJourney(r.dto, payload.clientRef));
      } else if (r.state === 'queued') {
        j.sync = 'queued'; if (Eco.api.authed()) Eco.store.save(); paintSyncBadge(j);
        ui.toast(r.reason === 'auth'
          ? 'Your session ended. This journey is kept on your device and will be saved when you sign in again.'
          : 'The server is not reachable. This journey is kept on your device and will be saved later.', 'warn', { duration: 5200 });
      } else {
        j.sync = 'failed'; Eco.store.save(); paintSyncBadge(j);
        ui.toast('The server did not accept this journey: ' + r.message, 'error', { duration: 5200 });
      }
    });
  }

  function cleanup(clearSim) {
    if (sim) { cancelAnimationFrame(sim.raf); stopGps(); }
    if (map) { map.destroy(); map = null; }
    if (clearSim) {
      if (sim && sim.trackSession) Eco.location.endSession();
      sim = null;
    }
  }
  function abort() { cleanup(true); }

  function stationSheet(id) {
    var st = Eco.data.findPlace(id); if (!st) return;
    var cur = map ? map.pointAt('r', (sim.travelled / sim.D) * map.routeLength('r')) : { x: Eco.data.currentLocation.x, y: Eco.data.currentLocation.y };
    var km = Eco.calc.mapKm(cur, st);
    ui.sheet({
      title: st.name,
      html: '<p class="muted" style="margin-bottom:12px">' + esc(st.area) + ' · ' + fmt.km(km) + ' km from you</p>' +
        '<div class="st-tags" style="margin:0 0 14px"><span class="tag tag-power">' + ui.icon('zap', 13) + st.kw + ' kW</span>' + st.connectors.map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') + '</div>' +
        '<div class="callout" style="margin:0 0 14px">' + ui.icon('plug', 20) + '<div><b>' + st.free + ' of ' + st.total + ' ports free</b><p>Sample availability, not a live reading.</p></div></div>' +
        '<button type="button" class="btn btn-secondary btn-block" data-sheet-close>Close</button>'
    });
  }

  function initNav() {
    ui.actions['nav-start'] = start;
    ui.actions['nav-pause'] = pause;
    ui.actions['nav-resume'] = resume;
    ui.actions['nav-end'] = confirmEnd;
    ui.actions['nav-back'] = function () {
      if (sim && (sim.status === 'running' || sim.status === 'paused')) confirmEnd(); else Eco.nav.back();
    };
    ui.actions['nav-recenter'] = function (btn) {
      if (!sim || !map) return;
      sim.follow = true; btn.style.color = '';
      var pos = map.pointAt('r', (sim.shown / sim.D) * map.routeLength('r'));
      if (sim.status === 'idle') { map.fit(sim.route.points, { pad: navPads(), maxZoom: 1.0, animate: 450 }); return; }
      var ch = $('#nav-map').clientHeight, panelH = $('#nav-panel').offsetHeight, visibleMid = (96 + (ch - panelH)) / 2;
      sim.noFollowUntil = performance.now() + 500;
      map.setView({ cx: pos.x, cy: pos.y - (visibleMid - ch / 2) / 0.95, s: 0.95 }, 450);
    };
    ui.actions['nav-mode'] = function () { if (sim) setMode(sim.mode === 'gps' ? 'demo' : 'gps'); };
    ui.actions['nav-speed'] = function () {
      if (!sim) return;
      var gps = sim.mode === 'gps', list = gps ? GPS_SCALES : DEMO_SCALES, key = gps ? 'gpsScale' : 'demoScale';
      sim[key] = list[(list.indexOf(sim[key]) + 1) % list.length];
      Eco.store.state.settings[key] = sim[key]; Eco.store.save();
      paintModeChips();
      ui.toast(gps
        ? (sim.gpsScale === 1 ? 'Real distance: 1 m you move = 1 m on the map' : 'Distance ×' + sim.gpsScale + ': 1 m you move = ' + sim.gpsScale + ' m on the map')
        : 'Demo drive speed ×' + sim.demoScale, 'info', { duration: 2200 });
    };

    // demo drive: hold the on-screen button, or hold the Up arrow key
    var ctl = $('#nav-controls');
    ctl.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('#drive-btn');
      if (!b || !sim || sim.mode !== 'demo' || sim.status !== 'running') return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      markDrive(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      ctl.addEventListener(t, function (e) { if (e.target.closest && e.target.closest('#drive-btn')) markDrive(false); });
    });
    ctl.addEventListener('contextmenu', function (e) { if (e.target.closest('#drive-btn')) e.preventDefault(); });
    // keyboard: hold the Up arrow. (Not Space: on a focused button Space means "press it", which would flip a chip.)
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'ArrowUp' || e.repeat) return;
      if (!sim || sim.mode !== 'demo' || sim.status !== 'running' || Eco.nav.current() !== 'navigation') return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
      e.preventDefault(); markDrive(true);
    });
    document.addEventListener('keyup', function (e) { if (e.code === 'ArrowUp') markDrive(false); });
    window.addEventListener('blur', function () { markDrive(false); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) markDrive(false); });

    Eco.nav.register('navigation', {
      enter: navEnter, leave: navLeave,
      canLeave: function () { return !sim || sim.status === 'idle' || sim.status === 'done'; },
      leaveBlocked: function () { confirmEnd(); }
    });
  }

  /* =====================================================================
     Screen 11: Journey summary
     ===================================================================== */
  var current = null;

  function findJourney(id) {
    var l = Eco.store.state.journeys, i;
    for (i = 0; i < l.length; i++) if (l[i].id === id || l[i].localId === id) return l[i];
    return null;
  }

  /* ---------- database status badge + the route the device recorded ---------- */
  function syncBadge(j) {
    if (!Eco.api.authed()) return '';
    if (j.sync === 'pending') return '<span class="badge badge-amber">' + ui.icon('refresh', 13) + 'Saving…</span>';
    if (j.sync === 'queued') return '<span class="badge badge-amber">' + ui.icon('clock', 13) + 'Will sync later</span>';
    if (j.sync === 'failed') return '<span class="badge badge-red">' + ui.icon('alert-circle', 13) + 'Not saved</span>';
    return '<span class="badge badge-grey">' + ui.icon('check-circle', 13) + 'Saved to database</span>';
  }
  function paintSyncBadge(j) {
    var el = $('#sum-sync');
    if (el && current && current.j === j) el.innerHTML = syncBadge(j);
  }
  /** A journey is now in the database (also called when a queued one finally gets through). */
  function onSynced(j) {
    if (!current || current.j !== j) return;
    paintSyncBadge(j);
    loadTrack(j);
  }

  function niceLen(maxM) {
    var steps = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000], best = steps[0], i;
    for (i = 0; i < steps.length; i++) if (steps[i] <= maxM) best = steps[i];
    return best;
  }

  /** Fetch the recorded GPS points of a journey and draw them to scale (no map tiles: just the path). */
  function loadTrack(j) {
    var host = $('#sum-track');
    if (!host || !Eco.api.authed() || j.sync || j.startLat == null || !/^\d+$/.test(String(j.id))) return;
    Eco.api.get('/journeys/' + j.id + '/track').then(function (pts) {
      if (!current || current.j !== j || !$('#sum-track')) return;
      drawTrack($('#sum-track'), pts || []);
    }, noop);
  }

  function drawTrack(host, pts) {
    pts = pts.filter(function (p) { return p.accuracy == null || p.accuracy <= 60; });      // drop wobbly low-accuracy readings
    if (pts.length < 2) { host.classList.add('hidden'); return; }
    var R = 6371000, rad = Math.PI / 180, lat0 = 0, i;
    pts.forEach(function (p) { lat0 += p.lat; }); lat0 /= pts.length;
    var cosLat = Math.cos(lat0 * rad);
    var xy = pts.map(function (p) { return { x: p.lon * rad * cosLat * R, y: -p.lat * rad * R }; });
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, real = 0;
    xy.forEach(function (p, k) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      if (k) real += Eco.location.haversine(pts[k - 1], pts[k]);
    });
    var W = 300, H = 190, pad = 22;
    var w = Math.max(maxX - minX, 25), h = Math.max(maxY - minY, 25);              // a standing-still track still gets a sensible frame
    var sc = Math.min((W - pad * 2) / w, (H - pad * 2 - 14) / h);
    var ox = (W - (maxX - minX) * sc) / 2 - minX * sc, oy = (H - 14 - (maxY - minY) * sc) / 2 - minY * sc;
    var P = xy.map(function (p) { return [p.x * sc + ox, p.y * sc + oy]; });
    var d = P.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var bar = niceLen(Math.max(10, (W - pad * 2) * 0.35 / sc)), barPx = bar * sc, bx = pad, by = H - 10;
    var first = P[0], last = P[P.length - 1];
    host.innerHTML =
      '<div class="trk-head"><h3>Your recorded route</h3><small>' + pts.length + ' GPS points</small></div>' +
      '<div class="track-box"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="The path your device recorded, drawn to scale">' +
      '<path class="track-line" d="' + d + '"/>' +
      '<circle class="track-start" cx="' + first[0].toFixed(1) + '" cy="' + first[1].toFixed(1) + '" r="6"/>' +
      '<circle class="track-end" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="6"/>' +
      '<g class="track-scale"><line x1="' + bx + '" y1="' + by + '" x2="' + (bx + barPx).toFixed(1) + '" y2="' + by + '"/>' +
      '<text x="' + (bx + barPx + 6).toFixed(1) + '" y="' + (by + 4) + '">' + (bar >= 1000 ? (bar / 1000) + ' km' : bar + ' m') + '</text></g></svg></div>' +
      '<div class="track-meta"><span>' + distText(real / 1000) + ' real distance</span><span>' + fmt.clock(pts[0].time) + ' → ' + fmt.clock(pts[pts.length - 1].time) + '</span></div>';
    host.classList.remove('hidden');
  }

  function summaryEnter(params, isBack) {
    var id = params && params.id;
    var j = id ? findJourney(id) : (isBack && current ? current.j : null);
    if (!j) { Eco.nav.go('home', { replace: true }); return; }
    if (id) current = { j: j, fresh: !!params.fresh };
    renderSummary();
  }

  function renderSummary() {
    var j = current.j, fresh = current.fresh, early = j.status === 'ended-early';
    var vt = Eco.data.vehicleTypes[j.vehicleType], kind = Eco.data.routeKinds[j.routeKind];
    var co2 = fmt.co2(j.co2g), saved = fmt.co2(j.savedG);
    var trees = Eco.calc.trees(j.savedG);
    var d = new Date(j.date), arrive = new Date(d.getTime() + j.durationMin * 60000);
    var tile = function (icon, val, unit, label, t) {
      return '<div class="stat-tile ' + (t ? 'tone-' + t : '') + '"><div class="st-top"><span class="st-ic">' + ui.icon(icon, 18) + '</span></div><div class="st-val">' + val + '<small>' + unit + '</small></div><div class="st-label">' + label + '</div></div>';
    };
    var dist = j.distanceKm < 1 ? [Math.round(j.distanceKm * 1000), 'm'] : [fmt.km(j.distanceKm), 'km'];
    var src = j.source === 'gps' ? '<span class="badge badge-grey">' + ui.icon('locate-fixed', 13) + 'Live GPS</span>'
      : j.source === 'demo' ? '<span class="badge badge-grey">' + ui.icon('navigation-2', 13) + 'Demo drive</span>' : '';
    $('#summary-body').innerHTML =
      '<div class="sum-hero"><div class="sum-badge' + (early ? ' amber' : '') + '">' + ui.icon(early ? 'flag' : 'check-circle', 44) + '</div>' +
      '<h2>' + (early ? 'Journey ended early' : 'Journey completed!') + '</h2>' +
      '<p>' + (fresh ? (early ? 'Your progress has been saved to History.' : 'Nice one. Your trip has been saved to History.') : fmt.dateLong(d) + ' · ' + fmt.clock(d)) + '</p>' +
      '<div class="sum-meta" style="justify-content:center"><span class="badge ' + (early ? 'badge-amber' : 'badge-green') + '">' + ui.icon(early ? 'alert-circle' : 'check-circle', 13) + (early ? 'Ended early' : 'Completed') + '</span>' +
      '<span class="badge badge-grey">' + ui.icon(vt.icon, 13) + esc(j.vehicleLabel) + '</span>' +
      '<span class="badge badge-grey">' + ui.icon('route', 13) + (kind ? kind.title : 'Route') + '</span>' + src + '<span id="sum-sync">' + syncBadge(j) + '</span></div></div>' +

      '<article class="card sum-route"><div class="timeline"><div class="tl-rail"><span class="tl-dot"></span><span class="tl-line"></span>' + ui.icon('map-pin', 20) + '</div>' +
      '<div class="tl-text"><div><p>FROM</p><b>' + esc(j.from) + '</b></div><div><p>TO</p><b>' + esc(j.to) + '</b></div></div></div>' +
      '<div class="sum-map" id="sum-map"></div></article>' +
      '<article class="card sum-track hidden" id="sum-track"></article>' +

      '<div class="sum-grid">' +
      '<article class="card sum-score">' + ui.ring({ value: j.ecoScore, size: 84, stroke: 9, fontScale: 0.32 }) +
      '<div><p class="eyebrow">Eco Score</p><h3>' + Eco.calc.scoreLabel(j.ecoScore) + ' · ' + j.ecoScore + '/100</h3>' +
      '<p>' + Math.round(j.co2g / Math.max(j.distanceKm, 0.1)) + ' g CO₂/km on this trip, based on your vehicle and route.</p></div></article>' +
      tile('route', dist[0], dist[1], 'Total distance', 'green') +
      tile('clock', fmt.dur(j.durationMin).replace(' min', ''), j.durationMin < 60 ? 'min' : '', 'Travel duration', 'blue') +
      tile('cloud', co2.v, co2.u, 'Estimated CO₂', 'amber') +
      tile('leaf', saved.v, saved.u, 'Carbon saved', 'green') +
      '</div>' +

      '<div class="eq-card"><span class="ic">' + ui.icon('trees', 22) + '</span><p>' + (j.savedG > 0
        ? 'You saved <b>' + fmt.co2Text(j.savedG) + '</b> versus an average petrol car, roughly what a tree absorbs in <b>' + Math.max(1, Math.round(trees)) + ' day' + (Math.round(trees) === 1 ? '' : 's') + '</b>.'
        : 'This trip emitted about as much as an average petrol car. Try the Eco Route or an EV next time.') + '</p></div>' +
      '<p class="fine center">' + (early ? 'Stopped before arrival · ' : 'Arrived about ' + fmt.clock(arrive) + ' · ') + 'CO₂ and savings are estimates.</p>';

    loadTrack(j);                       // a Live GPS journey saved earlier: draw the route the device recorded
    $('#summary-foot').innerHTML = fresh
      ? '<button type="button" class="btn btn-primary btn-lg btn-block" data-go="home">' + ui.icon('home', 20) + 'Back to Home</button><button type="button" class="btn btn-ghost btn-block" data-go="history">View Journey History</button>'
      : '<button type="button" class="btn btn-primary btn-lg btn-block" data-back>Done</button>';
    Eco.icons.hydrate($('#screen-summary'));

    // route thumbnail
    if (summaryMap) { summaryMap.destroy(); summaryMap = null; }
    var a = Eco.data.findPlace(j.fromId), b = Eco.data.findPlace(j.toId);
    if (a && b) {
      var pts = Eco.geo.waypoints({ x: Eco.geo.snap(a.x), y: Eco.geo.snap(a.y) }, { x: Eco.geo.snap(b.x), y: Eco.geo.snap(b.y) }, j.routeKind);
      summaryMap = Eco.Map.create($('#sum-map'), { interactive: false });
      var markers = [{ id: 'start', type: 'start', x: a.x, y: a.y }, { id: 'dest', type: 'dest', x: b.x, y: b.y, icon: b.type === 'station' ? 'zap' : 'flag' }];
      summaryMap.setMarkers(markers);
      summaryMap.setRoutes([{ id: 'r', d: Eco.geo.roundedPath(pts, 26), active: true, width: 6 }]);
      if (early) {
        var total = summaryMap.routeLength('r'), frac = Math.min(1, j.distanceKm / Math.max(0.1, Eco.geo.polyLen(pts) * Eco.data.WORLD.kmPerUnit));
        var p = summaryMap.pointAt('r', total * frac);
        if (p) { markers.push({ id: 'stop', type: 'vehicle', x: p.x, y: p.y, rotation: p.angle }); summaryMap.setMarkers(markers); }
      }
      summaryMap.fit(pts, { pad: [58, 34, 26, 34], maxZoom: 1.0 });
    }
  }

  function share() {
    if (!current) return;
    var j = current.j;
    var text = 'EcoRoute journey: ' + j.from + ' → ' + j.to + ' · ' + fmt.km(j.distanceKm) + ' km · ' + fmt.co2Text(j.co2g) + ' CO₂ · Eco Score ' + j.ecoScore + '/100 (demo app, estimated figures).';
    if (navigator.share) { navigator.share({ title: 'My EcoRoute journey', text: text }).catch(function () { /* cancelled */ }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { ui.toast('Summary copied to clipboard', 'success'); }, function () { ui.toast('Sharing is not available here', 'info'); });
    else ui.toast('Sharing is not available here', 'info');
  }

  function initSummary() {
    Eco.api.onJourneySynced = onSynced;          // a queued journey that finally reached the server
    ui.actions['summary-close'] = function () { if (current && current.fresh) Eco.nav.go('home'); else Eco.nav.back(); };
    ui.actions['summary-share'] = share;
    Eco.nav.register('summary', {
      enter: summaryEnter,
      leave: function () { if (summaryMap) { summaryMap.destroy(); summaryMap = null; } }
    });
  }

  Eco.tracking = {
    prepare: prepare, abort: abort, rescue: rescue,
    isActive: function () { return !!sim && sim.status !== 'done'; },
    openSummary: function (id) { Eco.nav.go('summary', { params: { id: id } }); }
  };
  Eco.onReady(function () { initNav(); initSummary(); });
})();
