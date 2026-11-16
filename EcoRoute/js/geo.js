/* ==========================================================================
   EcoRoute - geo.js
   The real world: geometry helpers, routing (OSRM), place search + reverse lookup (Nominatim) and EV chargers
   (OpenStreetMap data through Overpass). All of these are free public OpenStreetMap services called straight from
   the app, so it works on any network without a server of our own (URLs: js/config.js).

   * Routes come from the routing service (no live traffic: times are free-flow estimates).
   * CO2 is estimated from the vehicle (g/km) and a "flow" factor worked out from the route itself (average
     speed and how many turns / junctions it has per km): steady, fast roads emit less than stop-and-go streets.
   * EV charger data comes from OpenStreetMap volunteers. It has NO live availability.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var C = window.ECOROUTE_CONFIG || {};
  var RAD = Math.PI / 180, EARTH = 6371000;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- geometry ---------- */
  /** Great-circle distance in metres between two { lat, lon } points. */
  function haversine(a, b) {
    var dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /** Initial compass bearing in degrees (0 = north) from a to b. */
  function bearing(a, b) {
    var y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
    var x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  /** Straight-line distance x 1.3 = a rough road distance in km (used only where no route exists yet). */
  function roadKm(a, b) { return haversine(a, b) * 1.3 / 1000; }
  function cumulative(points) {
    var c = [0], i;
    for (i = 1; i < points.length; i++) c.push(c[i - 1] + haversine(points[i - 1], points[i]));
    return c;
  }

  /* ---------- encoded polylines (precision 5, as used by OSRM and Google) ---------- */
  function decode(str, precision) {
    var f = Math.pow(10, precision == null ? 5 : precision), i = 0, lat = 0, lon = 0, out = [], b, shift, res;
    while (i < str.length) {
      shift = 0; res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      lat += (res & 1) ? ~(res >> 1) : (res >> 1);
      shift = 0; res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      lon += (res & 1) ? ~(res >> 1) : (res >> 1);
      out.push({ lat: lat / f, lon: lon / f });
    }
    return out;
  }
  function encode(points, precision) {
    var f = Math.pow(10, precision == null ? 5 : precision), la0 = 0, lo0 = 0, s = '';
    function enc(v) { v = v < 0 ? ~(v << 1) : (v << 1); var o = ''; while (v >= 32) { o += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } return o + String.fromCharCode(v + 63); }
    points.forEach(function (p) { var la = Math.round(p.lat * f), lo = Math.round(p.lon * f); s += enc(la - la0) + enc(lo - lo0); la0 = la; lo0 = lo; });
    return s;
  }
  /** Douglas-Peucker: drops points that are closer than tolM metres to the line (keeps journeys small). */
  function simplify(points, tolM) {
    if (points.length < 3) return points.slice();
    var kx = Math.cos(points[0].lat * RAD) * 111320, ky = 110574;
    var keep = new Uint8Array(points.length), stack = [[0, points.length - 1]];
    keep[0] = 1; keep[points.length - 1] = 1;
    while (stack.length) {
      var seg = stack.pop(), a = seg[0], b = seg[1], maxD = 0, idx = -1, i;
      var ax = points[a].lon * kx, ay = points[a].lat * ky, dx = points[b].lon * kx - ax, dy = points[b].lat * ky - ay, len2 = dx * dx + dy * dy;
      for (i = a + 1; i < b; i++) {
        var px = points[i].lon * kx - ax, py = points[i].lat * ky - ay, d;
        if (len2 === 0) d = Math.hypot(px, py);
        else { var t = clamp((px * dx + py * dy) / len2, 0, 1); d = Math.hypot(px - t * dx, py - t * dy); }
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tolM && idx > -1) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return points.filter(function (p, i) { return keep[i]; });
  }

  /** Point at distance d (metres) along a path, with the heading of the road there. cum = cumulative(points). */
  function rawAt(points, cum, d) {
    var n = points.length;
    if (n === 1) return { lat: points[0].lat, lon: points[0].lon, i: 0 };
    d = clamp(d, 0, cum[n - 1]);
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo], t = seg > 0 ? (d - cum[lo]) / seg : 0, a = points[lo], b = points[hi];
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, i: lo };
  }
  function pointAt(points, cum, d) {
    if (!points.length) return null;
    var p = rawAt(points, cum, d), a = rawAt(points, cum, d - 10), b = rawAt(points, cum, d + 10);
    return { lat: p.lat, lon: p.lon, angle: (a.lat === b.lat && a.lon === b.lon) ? 0 : bearing(a, b), idx: p.i };
  }
  /**
   * Nearest point of the path to p: { idx, t, dist (m from the path), along (m from the start), lat, lon }.
   * hintIdx limits the search to the part of the path around where we were (cheap, and stops the position from
   * jumping to a different stretch of road that happens to run close by); if that finds nothing near it searches it all.
   */
  function snap(points, cum, p, hintIdx, windowSegs) {
    var n = points.length;
    if (n < 2) return null;
    var kx = Math.cos(p.lat * RAD) * 111320, ky = 110574, lo = 0, hi = n - 2, best = null, i;
    if (hintIdx != null) { lo = Math.max(0, hintIdx - 3); hi = Math.min(n - 2, hintIdx + (windowSegs || 400)); }
    for (i = lo; i <= hi; i++) {
      var a = points[i], b = points[i + 1];
      var ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky, dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * ky, len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? clamp(-(ax * dx + ay * dy) / len2, 0, 1) : 0, d = Math.hypot(ax + t * dx, ay + t * dy);
      if (!best || d < best.dist) best = { idx: i, t: t, dist: d };
    }
    if (best && hintIdx != null && best.dist > 120 && (lo > 0 || hi < n - 2)) return snap(points, cum, p, null);
    var a0 = points[best.idx], b0 = points[best.idx + 1];
    best.along = cum[best.idx] + best.t * (cum[best.idx + 1] - cum[best.idx]);
    best.lat = a0.lat + (b0.lat - a0.lat) * best.t; best.lon = a0.lon + (b0.lon - a0.lon) * best.t;
    return best;
  }

  /* ---------- network ---------- */
  function httpError(status) { var e = new Error('HTTP ' + status); e.status = status; return e; }
  /** JSON over fetch with a timeout. Rejects with an Error that has .network (no answer) or .status (HTTP error). */
  function getJson(url, o) {
    o = o || {};
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, o.timeout || 10000);
    if (ctrl && o.signal) o.signal.addEventListener('abort', function () { ctrl.abort(); });      // the caller no longer needs the answer
    return fetch(url, { method: o.method || 'GET', headers: o.headers, body: o.body, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw httpError(r.status); return r.json(); })
      .catch(function (err) {
        clearTimeout(timer);
        if (err && (err.status || err.fatal)) throw err;
        var e = new Error('network'); e.network = true; throw e;
      });
  }
  /** Try each server in turn; the first good answer wins. An error marked .fatal stops the loop (the question was wrong, not the server). */
  function firstOk(hosts, make) {
    var i = 0, last;
    function next() {
      if (i >= hosts.length) return Promise.reject(last || new Error('unavailable'));
      var h = hosts[i++];
      return make(h).catch(function (err) { last = err; if (err && err.fatal) throw err; return next(); });
    }
    return next();
  }
  /**
   * For slow, overloaded public servers: ask the first one, and if it has not answered after gapMs ask the next one as
   * well (at once if the first one failed) while the earlier requests keep running. The first good answer wins and the
   * others are cancelled. make(host, signal) must return a promise. Rejects when every server failed.
   */
  function raceHosts(hosts, make, gapMs) {
    return new Promise(function (resolve, reject) {
      var next = 0, running = 0, done = false, timer = 0, last, ctrls = [];
      function finish(fn, v) {
        if (done) return;
        done = true; clearTimeout(timer);
        ctrls.forEach(function (c) { try { c.abort(); } catch (e) { /* already finished */ } });
        fn(v);
      }
      function launch() {
        clearTimeout(timer);
        if (done || next >= hosts.length) return;
        var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        if (ctrl) ctrls.push(ctrl);
        running++;
        make(hosts[next++], ctrl ? ctrl.signal : undefined).then(function (v) { finish(resolve, v); }, function (err) {
          last = err; running--;
          if (err && err.fatal) { finish(reject, err); return; }
          if (next < hosts.length) launch();                                  // that one failed: ask the next server now
          else if (!running) finish(reject, last || new Error('unavailable'));
        });
        if (next < hosts.length) timer = setTimeout(launch, gapMs);           // ...and do not wait for this one for ever
      }
      launch();
    });
  }
  var cacheGet = function (store, key, ttl) { var h = store[key]; return h && Date.now() - h.t < ttl ? h.v : null; };

  /* Nominatim allows about one request a second: every call waits for its turn. */
  var gateChain = Promise.resolve(), gateLast = 0;
  function nominatimGate(fn) {
    var run = gateChain.then(function () { return new Promise(function (r) { setTimeout(r, Math.max(0, 1100 - (Date.now() - gateLast))); }); })
      .then(function () { gateLast = Date.now(); return fn(); });
    gateChain = run.catch(function () { /* the next caller still gets its turn */ });
    return run;
  }
  function lang() { return (navigator.language || 'en').split('-')[0]; }

  /* ---------- places ---------- */
  var ICONS = { hospital: 'hospital', clinic: 'hospital', doctors: 'hospital', pharmacy: 'hospital', school: 'graduation-cap', college: 'graduation-cap', university: 'graduation-cap',
    fuel: 'fuel', charging_station: 'zap', parking: 'car', bus_station: 'route', station: 'route', halt: 'route', airport: 'plane', aerodrome: 'plane',
    mall: 'shopping-bag', supermarket: 'shopping-bag', marketplace: 'shopping-bag', stadium: 'trophy', sports_centre: 'trophy', park: 'trees', garden: 'trees', nature_reserve: 'trees',
    house: 'home', residential: 'home', apartments: 'building', office: 'briefcase', commercial: 'briefcase', industrial: 'building', attraction: 'map-pin' };
  var CAT_ICON = { shop: 'shopping-bag', office: 'briefcase', railway: 'route', public_transport: 'route', aeroway: 'plane', leisure: 'trees', natural: 'trees', building: 'building', highway: 'route' };
  function iconFor(cat, type) { return ICONS[type] || CAT_ICON[cat] || 'map-pin'; }

  function placeFromNominatim(r) {
    var a = r.address || {}, road = a.road || a.pedestrian || a.footway || a.path || '';
    var name = r.name || '';
    if (!name) name = (a.house_number ? a.house_number + ' ' : '') + road;
    var area = [a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet, a.city || a.town || a.municipality || a.county, a.state]
      .filter(function (x, i, arr) { return x && arr.indexOf(x) === i && x !== name; }).slice(0, 2).join(', ');
    if (!name) { var parts = String(r.display_name || '').split(','); name = (parts[0] || 'Place').trim(); if (!area) area = parts.slice(1, 3).join(',').trim(); }
    var t = r.osm_type ? r.osm_type.charAt(0) : 'p';
    return { id: 'osm:' + t + (r.osm_id || ''), name: name, area: area, lat: +r.lat, lon: +r.lon, icon: iconFor(r.category || r.class, r.type), type: r.type || '', display: r.display_name || name };
  }
  /** A place made from bare coordinates (a dropped pin, or the position of a charger). */
  function placeAt(lat, lon, name, area) {
    return { id: 'pt:' + lat.toFixed(5) + ',' + lon.toFixed(5), name: name || 'Dropped pin', area: area || '', lat: lat, lon: lon, icon: 'map-pin', type: 'pin' };
  }

  var searchCache = {}, reverseCache = {};
  /**
   * Search for places. near = { lat, lon } favours results around there. isStale() lets the caller drop a request
   * that was already replaced by a newer keystroke before it is even sent.
   */
  function search(q, near, isStale) {
    q = String(q || '').trim();
    var key = q.toLowerCase() + '|' + (near ? near.lat.toFixed(1) + ',' + near.lon.toFixed(1) : '');
    var hit = cacheGet(searchCache, key, 10 * 60000);
    if (hit) return Promise.resolve(hit);
    return nominatimGate(function () {
      if (isStale && isStale()) { var s = new Error('stale'); s.stale = true; throw s; }
      var url = C.nominatim + '/search?format=jsonv2&addressdetails=1&limit=8&dedupe=1&accept-language=' + encodeURIComponent(lang()) + '&q=' + encodeURIComponent(q);
      if (near) url += '&viewbox=' + [near.lon - 0.6, near.lat + 0.6, near.lon + 0.6, near.lat - 0.6].map(function (n) { return n.toFixed(4); }).join(',') + '&bounded=0';
      return getJson(url, { timeout: 9000 });
    }).then(function (rows) {
      var out = (rows || []).map(placeFromNominatim).filter(function (p) { return isFinite(p.lat) && isFinite(p.lon); });
      searchCache[key] = { t: Date.now(), v: out };
      return out;
    });
  }
  /** Street address for coordinates: { name, area } (cached by about 100 m). */
  function reverse(lat, lon) {
    var key = lat.toFixed(3) + ',' + lon.toFixed(3), hit = cacheGet(reverseCache, key, 60 * 60000);
    if (hit) return Promise.resolve(hit);
    return nominatimGate(function () {
      return getJson(C.nominatim + '/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=' + encodeURIComponent(lang()) + '&lat=' + lat.toFixed(6) + '&lon=' + lon.toFixed(6), { timeout: 9000 });
    }).then(function (r) {
      var p = r && !r.error ? placeFromNominatim(r) : null;
      var out = p ? { name: p.name, area: p.area, icon: p.icon } : null;
      if (out) reverseCache[key] = { t: Date.now(), v: out };
      return out;
    });
  }

  /* ---------- routing ---------- */
  var TURN_TYPES = { turn: 1, 'end of road': 1, fork: 1, 'on ramp': 1, 'off ramp': 1, roundabout: 1, rotary: 1, 'roundabout turn': 1, merge: 1, 'exit roundabout': 0 };
  var MOD = { left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right', 'sharp left': 'sharp left', 'sharp right': 'sharp right', straight: 'straight', uturn: 'around' };
  function ordinal(n) { return ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]; }
  function stepIcon(s) {
    var m = s.modifier || '';
    if (s.type === 'arrive') return 'flag';
    if (s.type === 'depart') return 'navigation-2';
    if (s.type === 'roundabout' || s.type === 'rotary' || s.type === 'roundabout turn') return 'rotate-cw';
    if (m === 'uturn') return 'rotate-ccw';
    if (m.indexOf('left') > -1) return 'corner-up-left';
    if (m.indexOf('right') > -1) return 'corner-up-right';
    return 'arrow-up';
  }
  function stepText(s) {
    var onto = s.name ? ' onto ' + s.name : '', m = MOD[s.modifier] || '';
    switch (s.type) {
      case 'depart': return 'Start' + (s.name ? ' on ' + s.name : '');
      case 'arrive': return 'Arrive at your destination';
      case 'roundabout': case 'rotary': case 'roundabout turn':
        return s.exit ? 'At the roundabout take the ' + s.exit + ordinal(s.exit) + ' exit' + onto : 'Enter the roundabout' + onto;
      case 'merge': return 'Merge' + (m ? ' ' + m : '') + onto;
      case 'fork': return 'Keep ' + (/left/.test(s.modifier || '') ? 'left' : 'right') + onto;
      case 'on ramp': return 'Take the ramp' + onto;
      case 'off ramp': return 'Take the exit' + onto;
      case 'turn': case 'end of road': return 'Turn ' + (m || 'ahead') + onto;
      default: return 'Continue' + (s.name ? ' on ' + s.name : '');
    }
  }

  /** One OSRM route -> the plain facts about it (nothing that depends on the vehicle). */
  function candidate(r) {
    var points = decode(r.geometry), cum = cumulative(points), steps = [], at = 0, byRoad = {};
    (r.legs || []).forEach(function (leg) {
      (leg.steps || []).forEach(function (s) {
        var m = s.maneuver || {};
        steps.push({ at: at, type: m.type || 'continue', modifier: m.modifier || '', exit: m.exit || 0, name: s.name || '', dist: s.distance, lat: m.location ? m.location[1] : null, lon: m.location ? m.location[0] : null });
        var road = s.name || s.ref; if (road) byRoad[road] = (byRoad[road] || 0) + s.distance;     // a street name says more than "NH60; NH65"
        at += s.distance;
      });
    });
    steps.forEach(function (s) { s.icon = stepIcon(s); s.text = stepText(s); });
    var km = cum[cum.length - 1] / 1000, min = r.duration / 60;
    var turns = steps.filter(function (s) { return TURN_TYPES[s.type]; }).length;
    var roads = Object.keys(byRoad).sort(function (a, b) { return byRoad[b] - byRoad[a]; }).slice(0, 2);
    return {
      points: points, cum: cum, polyline: r.geometry, steps: steps, distanceKm: km, timeMin: Math.max(1, min),
      avgSpeed: km / Math.max(min / 60, 1 / 3600), turns: turns, turnsPerKm: km > 0 ? turns / km : 0,
      via: roads.length ? 'via ' + roads.join(' and ') : 'via local roads'
    };
  }

  var routeCache = {};
  /** All the sensible routes between two points (1 to 3). Resolves with plain candidates; see buildRoutes for the vehicle. */
  function route(from, to) {
    var key = [from.lat, from.lon, to.lat, to.lon].map(function (n) { return n.toFixed(4); }).join(',');
    var hit = cacheGet(routeCache, key, 5 * 60000);
    if (hit) return Promise.resolve(hit);
    return firstOk(C.routers, function (host) {
      var url = host.replace(/\/+$/, '') + '/route/v1/driving/' + from.lon.toFixed(6) + ',' + from.lat.toFixed(6) + ';' + to.lon.toFixed(6) + ',' + to.lat.toFixed(6) +
        '?overview=full&geometries=polyline&steps=true&alternatives=3';
      return getJson(url, { timeout: 14000 }).then(function (j) {
        if (j && j.code === 'NoRoute') { var e = new Error('No route'); e.code = 'NoRoute'; e.fatal = true; throw e; }
        if (!j || j.code !== 'Ok' || !j.routes || !j.routes.length) throw new Error('bad routing answer');
        return j.routes.map(candidate);
      });
    }).then(function (list) { routeCache[key] = { t: Date.now(), v: list }; return list; });
  }

  var ORDER = ['shortest', 'eco', 'fastest'];
  /**
   * Cooking the numbers for one vehicle. flow > 1 means stop-and-go (more CO2 per km), < 1 steady cruising.
   * It is an estimate worked out from the route itself, not a measurement: average speed far from a steady ~55 km/h
   * and many turns / junctions per km both push it up.
   */
  function flowOf(c) { return clamp(0.80 + 0.11 * Math.min(c.turnsPerKm, 3.5) + 0.0045 * Math.abs(c.avgSpeed - 55), 0.82, 1.35); }

  /** Pick the shortest, the lowest-CO2 and the fastest of the candidates. A route that wins several is shown once, with several badges. */
  function buildRoutes(cands, vehicle) {
    var list = cands.map(function (c) {
      var flow = flowOf(c), co2g = Math.round(c.distanceKm * vehicle.gPerKm * flow);
      return Object.assign({}, c, { flow: flow, co2g: co2g, ecoScore: Eco.calc.ecoScore(co2g / Math.max(c.distanceKm, 0.1)), kinds: [] });
    });
    function best(key) { return list.reduce(function (b, r) { return r[key] < b[key] ? r : b; }, list[0]); }
    var pick = { shortest: best('distanceKm'), eco: best('co2g'), fastest: best('timeMin') }, out = [];
    ORDER.forEach(function (k) { pick[k].kinds.push(k); });
    ORDER.forEach(function (k) { if (out.indexOf(pick[k]) < 0) out.push(pick[k]); });
    out.forEach(function (r) { r.id = r.kinds[0]; r.title = Eco.data.routeKinds[r.id].title; r.badges = r.kinds.slice(); r.signals = r.turns; });
    return out;
  }

  /* ---------- EV chargers (OpenStreetMap) ---------- */
  var SOCKETS = { type2: 'Type 2', type2_combo: 'CCS2', chademo: 'CHAdeMO', type1: 'Type 1', type1_combo: 'CCS1', schuko: '3-Pin AC', typee: '3-Pin AC',
    tesla_supercharger: 'Tesla', tesla_destination: 'Tesla', gb_dc: 'GB/T DC', gb_ac: 'GB/T AC' };
  function parseKw(v) {
    if (!v) return null;
    var m = String(v).replace(',', '.').match(/([\d.]+)\s*(kw|w)?/i);
    if (!m) return null;
    var n = parseFloat(m[1]);
    return isFinite(n) ? (m[2] && m[2].toLowerCase() === 'w' ? n / 1000 : n) : null;
  }
  function station(el) {
    var t = el.tags || {}, lat = el.lat != null ? el.lat : el.center && el.center.lat, lon = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lon == null) return null;
    var conns = [], kw = 0, total = 0;
    Object.keys(SOCKETS).forEach(function (k) {
      var c = t['socket:' + k]; if (!c) return;
      if (conns.indexOf(SOCKETS[k]) < 0) conns.push(SOCKETS[k]);
      var n = parseInt(c, 10); if (n > 0) total += n;
      var out = parseKw(t['socket:' + k + ':output']); if (out && out > kw) kw = out;
    });
    if (!kw) kw = parseKw(t['charging_station:output'] || t.output) || 0;
    var cap = parseInt(t.capacity, 10); if (cap > 0) total = cap;
    var maker = t.operator || t.brand || t.network || '';
    var addr = [t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ');
    return { id: 'ocs:' + el.type.charAt(0) + el.id, name: t.name || maker || 'Charging station', operator: maker, area: addr || (t.name && maker && t.name !== maker ? maker : ''),
      lat: lat, lon: lon, connectors: conns, kw: kw || null, total: total || null, fee: t.fee || '', hours: t.opening_hours || '', access: t.access || '', type: 'station', icon: 'zap' };
  }
  /**
   * A backup for when every Overpass server is busy: Nominatim's "charging station" search inside a box around you
   * (at most 40 results, picked by relevance). It is OpenStreetMap data too. Its answer is shaped like Overpass elements.
   * An empty answer counts as a failure here: "none found" must only ever come from the complete Overpass answer.
   */
  function chargersFromNominatim(center, radiusKm) {
    var dLat = radiusKm / 110.574, dLon = radiusKm / (111.32 * Math.max(0.2, Math.cos(center.lat * Math.PI / 180)));
    var url = C.nominatim + '/search?format=jsonv2&addressdetails=1&extratags=1&limit=40&bounded=1&accept-language=' + encodeURIComponent(lang()) +
      '&q=' + encodeURIComponent('charging station') +
      '&viewbox=' + [center.lon - dLon, center.lat + dLat, center.lon + dLon, center.lat - dLat].map(function (n) { return n.toFixed(5); }).join(',');
    return nominatimGate(function () { return getJson(url, { timeout: 12000 }); }).then(function (rows) {
      var els = (rows || []).filter(function (r) { return r.type === 'charging_station' && isFinite(+r.lat) && isFinite(+r.lon) && haversine(center, { lat: +r.lat, lon: +r.lon }) <= radiusKm * 1000; }).map(function (r) {
        var a = r.address || {}, tags = Object.assign({}, r.extratags || {});
        if (r.name) tags.name = r.name;
        if (a.road) tags['addr:street'] = a.road;
        var sub = a.suburb || a.neighbourhood || a.city || a.town; if (sub) tags['addr:suburb'] = sub;
        return { type: r.osm_type || 'node', id: r.osm_id, lat: +r.lat, lon: +r.lon, tags: tags };
      });
      if (!els.length) throw new Error('no backup answer');
      return els;
    });
  }

  var chargerCache = {};
  /**
   * Chargers within radiusKm of a point, nearest first. Resolves with [] when there are none.
   * The public Overpass servers are often slow, so: they are asked one after another without waiting for a slow one
   * (raceHosts). If there is no complete answer after 8 s, or every server failed, a shorter list from Nominatim
   * (chargersFromNominatim) is used meanwhile (list.backup = true), and when the complete list still arrives later
   * onUpgrade(list) is called with it. It rejects only when both sources failed.
   */
  function chargers(center, radiusKm, onUpgrade) {
    var key = center.lat.toFixed(2) + ',' + center.lon.toFixed(2) + ',' + radiusKm, hit = cacheGet(chargerCache, key, 10 * 60000);
    if (hit) return Promise.resolve(hit);
    var r = Math.round(radiusKm * 1000), around = '(around:' + r + ',' + center.lat.toFixed(5) + ',' + center.lon.toFixed(5) + ')';
    var body = 'data=' + encodeURIComponent('[out:json][timeout:25];(node["amenity"="charging_station"]' + around + ';way["amenity"="charging_station"]' + around + ';);out center tags 120;');
    function build(els, backup) {
      var seen = {}, list = [];
      els.map(station).filter(Boolean).forEach(function (s) {
        var k = s.lat.toFixed(4) + ',' + s.lon.toFixed(4) + s.name; if (seen[k]) return; seen[k] = 1;
        s.distM = haversine(center, s); list.push(s);
      });
      list.sort(function (a, b) { return a.distM - b.distM; });
      list.backup = backup;
      chargerCache[key] = { t: Date.now(), v: list };
      return list;
    }
    return new Promise(function (resolve, reject) {
      var finished = false, backupAsked = false, backupFailed = false, overpassFailed = false, timer = 0;
      function giveUp() { if (!finished) { finished = true; reject(new Error('chargers unavailable')); } }
      function askBackup() {
        if (backupAsked || finished) return;
        backupAsked = true; clearTimeout(timer);
        chargersFromNominatim(center, radiusKm).then(function (els) {
          if (!finished) { finished = true; resolve(build(els, true)); }
        }, function () { backupFailed = true; if (overpassFailed) giveUp(); });
      }
      timer = setTimeout(askBackup, 8000);
      raceHosts(C.overpass, function (host, signal) {
        return getJson(host, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, timeout: 20000, signal: signal }).then(function (j) {
          if (!j || !Array.isArray(j.elements)) throw new Error('bad charger answer');
          return j.elements;
        });
      }, 3500).then(function (els) {
        clearTimeout(timer);
        var list = build(els, false);
        if (!finished) { finished = true; resolve(list); } else if (onUpgrade) onUpgrade(list);     // the complete list came after the shorter one
      }, function () {
        overpassFailed = true; clearTimeout(timer);
        if (finished) return;
        if (backupFailed) giveUp(); else askBackup();
      });
    });
  }

  Eco.geo = {
    haversine: haversine, bearing: bearing, roadKm: roadKm, cumulative: cumulative, decode: decode, encode: encode, simplify: simplify,
    pointAt: pointAt, snap: snap, search: search, reverse: reverse, placeAt: placeAt, route: route, buildRoutes: buildRoutes, chargers: chargers,
    clearCaches: function () { searchCache = {}; reverseCache = {}; routeCache = {}; chargerCache = {}; }
  };
})();
