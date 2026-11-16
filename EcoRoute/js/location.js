/* ==========================================================================
   EcoRoute - location.js
   Real-time device location (the browser's Geolocation API), shared by every screen:
     * Home shows where you are (address, coordinates, accuracy) and updates as you move,
     * a journey in "Live GPS" mode takes its movement from it (tracking.js),
     * with the backend running, positions are saved to MySQL (location_points) and the
       street address is looked up by the server (OpenStreetMap Nominatim, cached).

   One watch is shared by everyone who "retains" it and it stops when nobody needs it.
   "Save my location history" (Profile) off = nothing is sent to the server at all; the
   position is then only shown on this device.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

  var GEO_MOVE_M = 80;                 // look the address up again after moving this far
  var GEO_GAP_MS = 15000;              // ...but never more often than this
  var AMBIENT = { moveM: 25, everyMs: 120000, gapMs: 4000 };    // saving rule while you just look at Home
  var TRACK = { moveM: 8, everyMs: 8000, gapMs: 1500 };         // saving rule during a journey
  var FLUSH_MS = 7000, QUEUE_MAX = 600;

  var S = {
    status: 'idle',          // idle | locating | ok | denied | unavailable
    fix: null,               // { lat, lon, acc, speed, heading, ts }
    address: null, shortName: null, addressFor: null,
    geoEnabled: true,        // false when the server has address lookup switched off
    error: '', stored: 0     // points the server has stored during this page visit
  };
  var owners = {}, watchId = null, tracking = false;
  var ambientId = newId('amb'), session = ambientId;
  var fixSubs = [], changeSubs = [], errSubs = [];
  var queue = [], lastStored = null, flushTimer = 0, chain = Promise.resolve();
  var geoBusy = false, geoAt = 0, hooked = false;

  function newId(p) { return p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function round(n, d) { var m = Math.pow(10, d); return Math.round(n * m) / m; }
  function hasOwners() { return Object.keys(owners).length > 0; }

  /* the same words for a browser and for the Android app, with the right place to fix it */
  var IN_APP = !!(window.ECOROUTE_CONFIG && window.ECOROUTE_CONFIG.app);
  var BLOCKED = IN_APP ? 'Location is switched off for EcoRoute. Turn it on in Android Settings → Apps → EcoRoute → Permissions.' : 'Location permission is blocked for this site.';
  var BLOCKED_TOAST = IN_APP ? 'Location is off for EcoRoute. Allow it in Android Settings → Apps → EcoRoute → Permissions.' : 'Location is blocked. Allow it in your browser’s site settings.';
  var SERVICES_OFF = IN_APP ? 'Android Settings → Location' : 'Windows: Settings → Privacy & security → Location';

  function supported() { return 'geolocation' in navigator && window.isSecureContext !== false; }
  function why() {
    if (!('geolocation' in navigator)) return 'This browser has no location support.';
    if (window.isSecureContext === false) return 'Browsers share location only on https:// or http://localhost.';
    return '';
  }

  /** Great-circle distance in metres between two { lat, lon } points. */
  function haversine(a, b) {
    var R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin(dLon / 2), 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function emitChange() { changeSubs.slice().forEach(function (fn) { try { fn(S); } catch (e) { console.error('location listener failed', e); } }); }
  function sub(list, fn) { list.push(fn); return function () { var i = list.indexOf(fn); if (i > -1) list.splice(i, 1); }; }

  /* ---------- what may be sent to the server ---------- */
  function canSave() {
    return !!(Eco.api && Eco.api.authed() && Eco.api.ready && Eco.store.state.settings.shareLocation !== false);
  }

  /* ---------- a new position ---------- */
  function fromPos(pos) {
    var c = pos.coords;
    return {
      lat: c.latitude, lon: c.longitude,
      acc: (typeof c.accuracy === 'number' && isFinite(c.accuracy)) ? c.accuracy : null,
      speed: (c.speed != null && isFinite(c.speed)) ? c.speed : null,
      heading: (c.heading != null && isFinite(c.heading)) ? c.heading : null,
      ts: pos.timestamp || Date.now()
    };
  }

  /* the last position stays on this device, so maps can open near you before the first new fix arrives */
  var LAST_KEY = 'ecoroute.lastfix', lastSaved = 0;
  function rememberFix(f) {
    if (Date.now() - lastSaved < 15000) return;
    lastSaved = Date.now();
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ lat: f.lat, lon: f.lon, ts: f.ts })); } catch (e) { /* storage blocked */ }
  }
  /** The newest known position: the live fix, else the one remembered from last time (or null). */
  function lastKnown() {
    if (S.fix) return { lat: S.fix.lat, lon: S.fix.lon, ts: S.fix.ts, live: true };
    try { var v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); if (v && isFinite(v.lat) && isFinite(v.lon)) return v; } catch (e) { /* ignore */ }
    return null;
  }

  function onPos(pos, force) {
    var f = fromPos(pos);
    S.fix = f; S.status = 'ok'; S.error = '';
    rememberFix(f);
    if (!canSave()) { S.address = null; S.shortName = null; S.addressFor = null; }     // history off: forget any address looked up earlier
    fixSubs.slice().forEach(function (fn) { try { fn(f, pos); } catch (e) { console.error('location listener failed', e); } });
    maybeStore(f);
    maybeGeocode(f, !!force);
    emitChange();
    return f;
  }

  function onErr(err) {
    errSubs.slice().forEach(function (fn) { try { fn(err); } catch (e) { console.error('location listener failed', e); } });
    if (err && err.code === 1) {
      S.status = 'denied'; S.error = BLOCKED;
      stopWatch();
    } else if (S.fix) {
      S.error = 'Signal lost for a moment. Still trying…';
    } else {
      S.status = 'locating';
      S.error = err && err.code === 3
        ? 'Still looking for a position…'
        : 'This device can’t work out its position yet. Check that location services are on (' + SERVICES_OFF + '), then press refresh.';
    }
    emitChange();
  }

  /* ---------- saving positions (batched) ---------- */
  function maybeStore(f) {
    if (!canSave()) return;
    var rule = tracking ? TRACK : AMBIENT;
    if (lastStored) {
      var dt = f.ts - lastStored.ts, d = haversine(lastStored, f);
      var need = Math.max(rule.moveM, (f.acc || 0) * 0.5);
      if (!(dt >= rule.everyMs || (dt >= rule.gapMs && d >= need))) return;
    }
    enqueue(f);
  }

  function enqueue(f) {
    lastStored = f;
    queue.push({
      lat: round(f.lat, 6), lon: round(f.lon, 6),
      accuracy: f.acc != null ? round(Math.min(f.acc, 100000), 1) : null,     // the server accepts up to 100 km; one odd reading must not get a whole batch refused
      speed: f.speed != null ? round(Math.min(f.speed, 200), 2) : null,
      heading: f.heading != null ? round(((f.heading % 360) + 360) % 360, 1) : null,
      ts: Math.round(f.ts), _s: session
    });
    if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX);
    if (!flushTimer) flushTimer = setTimeout(flush, S.stored === 0 ? 700 : FLUSH_MS);     // the very first point goes out quickly
  }

  function send(keepalive) {
    if (!queue.length) return 0;
    if (!canSave()) { queue.length = 0; return 0; }
    var sid = queue[0]._s, n = 0;
    while (n < queue.length && n < 200 && queue[n]._s === sid) n++;
    var batch = queue.splice(0, n);
    var body = {
      sessionId: sid, address: currentLabel(),
      points: batch.map(function (p) { return { lat: p.lat, lon: p.lon, accuracy: p.accuracy, speed: p.speed, heading: p.heading, ts: p.ts }; })
    };
    return Eco.api.post('/location/pings', body, { keepalive: !!keepalive, timeout: 10000 }).then(function (r) {
      S.stored += (r && r.stored) || 0;
      emitChange();
      return queue.length ? send(keepalive) : batch.length;
    }, function (err) {
      if (err.status === 401) { queue.length = 0; return 0; }
      if (err.status >= 400 && err.status < 500) return 0;                         // refused for good: drop this batch
      queue = batch.concat(queue).slice(-QUEUE_MAX);                               // server unreachable: keep them, retry later
      if (!flushTimer) flushTimer = setTimeout(flush, 20000);
      return 0;
    });
  }

  /** Send everything that is queued. Resolves once the server has it (journeys wait for this before they are saved). */
  function flush(keepalive) {
    clearTimeout(flushTimer); flushTimer = 0;
    chain = chain.then(function () { return send(keepalive === true); }, function () { return send(keepalive === true); });
    return chain;
  }

  /* ---------- address (looked up by the server and cached) ---------- */
  function maybeGeocode(f, force) {
    if (!S.geoEnabled || geoBusy || !canSave()) return;
    var moved = S.addressFor ? haversine(S.addressFor, f) : Infinity;
    if (!force) {
      if (S.address && moved < GEO_MOVE_M) return;
      if (Date.now() - geoAt < GEO_GAP_MS) return;
    }
    geoBusy = true; geoAt = Date.now();
    Eco.api.get('/geo/reverse?lat=' + f.lat.toFixed(6) + '&lon=' + f.lon.toFixed(6), { timeout: 14000 }).then(function (r) {
      geoBusy = false;
      if (!r) return;
      if (r.enabled === false) { S.geoEnabled = false; emitChange(); return; }
      if (r.address) {
        S.address = r.address; S.shortName = r.shortName || r.address; S.addressFor = { lat: f.lat, lon: f.lon };
        emitChange();
      }
    }, function () { geoBusy = false; });
  }

  /* ---------- the shared watch ---------- */
  var forceGeo = false;                // the next fix looks the address up again (set by a manual refresh)
  function startWatch(maxAgeMs) {
    if (watchId != null) return;
    if (!supported()) { S.status = 'unavailable'; S.error = why(); emitChange(); return; }
    if (!S.fix && S.status !== 'denied') { S.status = 'locating'; S.error = ''; emitChange(); }
    try {
      watchId = navigator.geolocation.watchPosition(function (p) { var f = forceGeo; forceGeo = false; onPos(p, f); }, onErr,
        { enableHighAccuracy: true, maximumAge: maxAgeMs == null ? 2000 : maxAgeMs, timeout: 20000 });
    } catch (e) { S.status = 'unavailable'; S.error = 'Location could not be started.'; emitChange(); }
  }
  function stopWatch() {
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) { /* ignore */ } watchId = null; }
  }

  function hook() {
    if (hooked) return; hooked = true;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { flush(true); return; }
      if (hasOwners() && (!S.fix || Date.now() - S.fix.ts > 15000)) refresh().catch(function () { /* shown in the status */ });
    });
    window.addEventListener('pagehide', function () { flush(true); });
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function (p) {
          p.onchange = function () {
            if (p.state === 'granted' && hasOwners()) { stopWatch(); S.status = S.fix ? 'ok' : 'locating'; S.error = ''; startWatch(); emitChange(); }
            else if (p.state === 'denied') { stopWatch(); S.status = 'denied'; S.error = BLOCKED; emitChange(); }
          };
        }, function () { /* not supported */ });
      }
    } catch (e) { /* ignore */ }
  }

  /** Ask for the location sensor. Call release() with the same name when you no longer need it. */
  function retain(owner) { owners[owner] = true; hook(); startWatch(); }
  function release(owner) {
    delete owners[owner];
    if (hasOwners()) return;
    stopWatch(); flush();
    if (S.status === 'locating') { S.status = 'idle'; S.error = ''; }
  }

  /**
   * A fresh reading right now (the refresh button, and when the tab comes back). It restarts the shared watch:
   * a newly started watch reports the current position straight away (a one-shot getCurrentPosition with
   * maximumAge 0 can sit and wait for the next *change* in some browsers). Resolves with the fix.
   */
  function refresh() {
    return new Promise(function (resolve, reject) {
      if (!supported()) { S.status = 'unavailable'; S.error = why(); emitChange(); reject({ code: 0, message: S.error }); return; }
      if (!S.fix && S.status !== 'denied') { S.status = 'locating'; S.error = ''; emitChange(); }
      var over = false, offFix, offErr, timer;
      function end(ok, v) {
        if (over) return; over = true; clearTimeout(timer); offFix(); offErr();
        if (!hasOwners()) stopWatch();                         // nobody else needs the sensor: don't leave it running
        if (ok) resolve(v); else reject(v);
      }
      offFix = sub(fixSubs, function (f) { end(true, f); });
      offErr = sub(errSubs, function (err) { end(false, err); });
      timer = setTimeout(function () { onErr({ code: 3, message: 'Timed out' }); end(false, { code: 3, message: 'Timed out' }); }, 15000);
      forceGeo = true;
      stopWatch();
      startWatch(0);
    });
  }

  /* ---------- journeys ---------- */
  /** Starts saving points under a new session id (the journey links them to itself when it is saved). */
  function beginSession() { session = newId('trk'); tracking = true; lastStored = null; return session; }
  function endSession() {
    // the last position of the journey is always part of its track, even when the saving rule skipped it
    if (tracking && S.fix && lastStored && S.fix.ts !== lastStored.ts && canSave()) enqueue(S.fix);
    tracking = false; session = ambientId; lastStored = null;
  }

  /** Sign-out: forget everything about the position. */
  function reset() {
    owners = {}; stopWatch(); clearTimeout(flushTimer); flushTimer = 0; queue = [];
    S.status = 'idle'; S.fix = null; S.address = null; S.shortName = null; S.addressFor = null; S.error = ''; S.stored = 0;
    S.geoEnabled = true; tracking = false; session = ambientId; lastStored = null;
    try { localStorage.removeItem(LAST_KEY); } catch (e) { /* ignore */ }
    emitChange();
  }

  /** The street address of the current position, or null (unknown, or "Save my location history" is off). */
  function currentLabel() {
    if (!canSave() || !S.shortName) return null;
    if (S.fix && S.addressFor && haversine(S.addressFor, S.fix) > 150) return null;     // you have moved on: that address no longer describes where you are
    if (S.fix && S.fix.acc != null && S.fix.acc > 300) {                                // a rough position (typical on a PC): a street name would be a guess
      var i = S.shortName.lastIndexOf(', ');
      return 'Near ' + (i > -1 ? S.shortName.slice(i + 2) : S.shortName);
    }
    return S.shortName;
  }

  /* ---------- text helpers ---------- */
  function accText(a) { return a == null ? '' : a >= 1000 ? '±' + (a / 1000).toFixed(1) + ' km' : '±' + Math.round(a) + ' m'; }
  function coordText(f) {
    if (!f) return '';
    return Math.abs(f.lat).toFixed(5) + '° ' + (f.lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(f.lon).toFixed(5) + '° ' + (f.lon >= 0 ? 'E' : 'W');
  }
  function agoText(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    return s < 5 ? 'just now' : s < 60 ? s + ' s ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : 'a while ago';
  }

  if (Eco.api) Eco.api.beforeOutbox = function () { return flush(); };     // queued journeys wait for their GPS points

  Eco.location = {
    state: S, supported: supported, why: why, haversine: haversine, blockedText: BLOCKED, blockedToast: BLOCKED_TOAST,
    retain: retain, release: release, refresh: refresh, flush: flush, reset: reset,
    beginSession: beginSession, endSession: endSession, sessionId: function () { return session; },
    onFix: function (fn) { return sub(fixSubs, fn); },
    onChange: function (fn) { return sub(changeSubs, fn); },
    onError: function (fn) { return sub(errSubs, fn); },
    label: currentLabel, last: lastKnown,
    accText: accText, coordText: coordText, agoText: agoText
  };
})();
