/* ==========================================================================
   EcoRoute - routes.js
   Screens 7-8: Route Planner (Explore) and Route Comparison, plus the reusable place search.
   Places come from OpenStreetMap (Nominatim), routes from the OSRM routing service (see geo.js).
   Times are free-flow estimates (no live traffic); CO2 figures are estimates for the chosen vehicle.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc, fmt = ui.fmt;
  var trip = Eco.trip;

  /* =====================================================================
     Where the trip starts
     ===================================================================== */
  function hereFix() { var f = Eco.location.state.fix; return f ? { lat: f.lat, lon: f.lon } : null; }
  /** The start of the trip as { lat, lon }: a place the user picked, else where the device is now (null when unknown). */
  function originPoint() { return trip.origin ? { lat: trip.origin.lat, lon: trip.origin.lon } : hereFix(); }
  function fromLabel() { return trip.origin ? trip.origin.name : (Eco.location.label() || 'Your location'); }
  /** Something to centre on and measure distances from: the start, else the last known position. */
  function anchor() { return originPoint() || Eco.location.last(); }
  function distLabel(p) { var o = anchor(); return o ? fmt.km(Eco.geo.roadKm(o, p)) + ' km' : ''; }

  function addRecent(p) {
    if (!p || !isFinite(p.lat) || !isFinite(p.lon)) return;
    var r = (Eco.store.state.recent || []).filter(function (x) { return x.id !== p.id; });
    r.unshift({ id: p.id, name: p.name, area: p.area || '', lat: p.lat, lon: p.lon, icon: p.icon || 'map-pin' });
    Eco.store.state.recent = r.slice(0, 6); Eco.store.save();
  }

  /* =====================================================================
     Place search component
     ===================================================================== */
  function highlight(text, q) {
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function itemHtml(p, q, kind) {
    var dist = kind === 'here' ? '' : distLabel(p);
    return '<button type="button" class="suggest-item" role="option" data-pid="' + esc(p.id) + '">' +
      '<span class="s-ic' + (kind === 'recent' ? ' recent' : '') + '">' + ui.icon(kind === 'recent' ? 'history' : (p.icon || 'map-pin'), 18) + '</span>' +
      '<span class="s-main"><b>' + highlight(p.name, q || '') + '</b><small>' + esc(p.area || '') + '</small></span>' +
      '<span class="s-dist">' + dist + '</span></button>';
  }

  /**
   * o: { input, list, clearBtn, get() -> the chosen place or null, onSelect(place), onClear(typing), allowHere, onHere(), remember }
   * Typing searches OpenStreetMap places (after a short pause); an empty box lists the recent places.
   */
  function attachSearch(o) {
    var input = o.input, list = o.list, timer = null, token = 0, shown = {};
    var HERE = { id: 'here', name: 'Use my location', area: 'Where this device is now', icon: 'locate-fixed' };

    function open() { list.classList.remove('hidden'); }
    function close() { list.classList.add('hidden'); clearTimeout(timer); token++; }
    function syncClear() { if (o.clearBtn) o.clearBtn.classList.toggle('hidden', !input.value); }
    function paint(items, q, empty) {
      shown = {};
      items.forEach(function (it) { shown[it.p.id] = it.p; });
      list.innerHTML = items.length ? items.map(function (it) { return itemHtml(it.p, q, it.kind); }).join('') : empty || '';
      Eco.icons.hydrate(list);
    }
    function showDefault() {
      var items = [];
      if (o.allowHere) items.push({ p: HERE, kind: 'here' });
      (Eco.store.state.recent || []).slice(0, 5).forEach(function (p) { items.push({ p: p, kind: 'recent' }); });
      paint(items, '', '<div class="suggest-empty">Type a place, an address or a landmark.<br><span class="small">For example “railway station” or “Shaniwar Wada”.</span></div>');
      if (items.length && !(Eco.store.state.recent || []).length) list.insertAdjacentHTML('beforeend', '<div class="suggest-empty small">Type a place, an address or a landmark.</div>');
    }
    function search(q) {
      var my = ++token;
      list.innerHTML = '<div class="suggest-loading"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
      open();
      clearTimeout(timer);
      timer = setTimeout(function () {
        Eco.geo.search(q, anchor(), function () { return my !== token; }).then(function (res) {
          if (my !== token) return;
          paint(res.map(function (p) { return { p: p }; }), q,
            '<div class="suggest-empty">No places match “' + esc(q) + '”.<br><span class="small">Try a bigger landmark, or add the city name.</span></div>');
        }, function (err) {
          if (my !== token || (err && err.stale)) return;
          shown = {};
          list.innerHTML = '<div class="suggest-empty">' + (err && err.network ? 'Can’t reach the search service. Check your internet.' : 'The search service is busy right now.') +
            '<br><button type="button" class="link-btn" data-retry>Try again</button></div>';
        });
      }, 450);
    }
    function choose(p) {
      if (p.id === 'here') { input.value = ''; syncClear(); close(); input.blur(); if (o.onHere) o.onHere(); return; }
      input.value = p.name; syncClear(); close(); input.blur();
      if (o.remember !== false) addRecent(p);
      if (o.onSelect) o.onSelect(p);
    }

    input.addEventListener('focus', function () {
      var sel = o.get ? o.get() : null;
      if (sel && input.value === sel.name) input.select();
      if (!input.value.trim() || (sel && input.value === sel.name) || (!sel && o.allowHere && input.value === fromLabel())) showDefault(); else search(input.value.trim());
      open();
    });
    input.addEventListener('input', function () {
      var q = input.value.trim(), sel = o.get ? o.get() : null;
      syncClear();
      if (sel && input.value !== sel.name) { if (o.onClear) o.onClear(true); }
      if (q.length < 3) { token++; clearTimeout(timer); showDefault(); open(); } else search(q);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var ids = Object.keys(shown); if (ids.length) choose(shown[ids[0]]); }
      else if (e.key === 'Escape') { close(); input.blur(); }
      else if (e.key === 'ArrowDown') { var f = $('.suggest-item', list); if (f) { e.preventDefault(); f.focus(); } }
    });
    list.addEventListener('keydown', function (e) {
      var items = $$('.suggest-item', list), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) items[i - 1].focus(); else input.focus(); }
    });
    list.addEventListener('click', function (e) {
      if (e.target.closest('[data-retry]')) { search(input.value.trim()); return; }
      var b = e.target.closest('[data-pid]'); if (!b) return;
      var p = shown[b.getAttribute('data-pid')]; if (p) choose(p);
    });
    if (o.clearBtn) o.clearBtn.addEventListener('click', function () {
      input.value = ''; syncClear();
      if (o.onClear) o.onClear(false);
      input.focus();
    });
    document.addEventListener('pointerdown', function (e) {
      if (list.classList.contains('hidden')) return;
      if (list.contains(e.target) || e.target === input || (o.clearBtn && o.clearBtn.contains(e.target))) return;
      close();
    });

    return {
      set: function (place) { input.value = place ? place.name : ''; syncClear(); },
      close: close
    };
  }

  /** Validate the trip and open route comparison. Shared by Home and Planner. */
  function start() {
    if (!trip.destination) {
      ui.toast('Choose a destination first', 'warn');
      var inp = Eco.nav.current() === 'planner' ? $('#planner-to') : $('#home-search');
      var box = inp.closest('.search-box, .rf-row');
      if (box) { box.style.animation = 'none'; void box.offsetWidth; box.style.animation = 'shake .4s'; }
      inp.focus();
      return false;
    }
    trip.routes = []; trip.selectedId = null;
    Eco.nav.go('routes');
    return true;
  }

  /* =====================================================================
     Screen 7: Route planner (Explore)
     ===================================================================== */
  var pmap = null, dsearch = null, fsearch = null, planLoc = null;

  function plannerMarkers() {
    var list = [], cur = hereFix(), o = trip.origin, d = trip.destination;
    if (cur) list.push({ id: 'current', type: 'current', lat: cur.lat, lon: cur.lon });
    if (o) list.push({ id: 'start', type: 'start', lat: o.lat, lon: o.lon });
    if (d) list.push({ id: 'dest', type: 'dest', lat: d.lat, lon: d.lon, icon: d.type === 'station' ? 'zap' : (d.icon || 'flag'), label: d.name });
    return list;
  }

  /** Keep the points clear of the search card (top) and the bottom panel, whatever their real heights are. */
  function plannerFit(animate) {
    if (!pmap) return;
    var o = originPoint(), d = trip.destination, ms = animate ? 650 : 0;
    var short = $('#app').clientHeight < 700;                  // tight screens: less breathing room, more map
    var pad = Eco.Map.overlayPads($('#planner-map'), $('.route-fields-card'), $('.planner-panel'), { top: short ? 58 : 64, right: 64, bottom: short ? 22 : 36, left: 64 });
    pmap.setAttributionOffset(pad[2] - 36);
    if (o && d) pmap.fit([o, d], { pad: pad, maxZoom: 16, animate: ms });
    else if (d) pmap.fit([d], { pad: pad, maxZoom: 15, animate: ms });
    else if (o) pmap.fit([o], { pad: pad, maxZoom: 15, animate: ms });
  }

  function chooseDestination(p, fromMap) {
    trip.destination = p; trip.routes = []; trip.selectedId = null;
    dsearch.set(p);
    $('#planner-clear').classList.remove('hidden');
    syncPlannerPanel();                       // panel first: its final height decides the map padding
    pmap.setMarkers(plannerMarkers());
    plannerFit(true);
    ui.vibrate(10);
    if (fromMap) addRecent(p);
  }

  /** A tap on the map drops a pin there and looks up its address. */
  function dropPin(ll) {
    var p = Eco.geo.placeAt(ll.lat, ll.lon);
    chooseDestination(p, false);
    Eco.geo.reverse(ll.lat, ll.lon).then(function (r) {
      if (!r || !trip.destination || trip.destination.id !== p.id) return;
      trip.destination.name = r.name || p.name; trip.destination.area = r.area || ''; trip.destination.icon = r.icon || 'map-pin';
      dsearch.set(trip.destination); pmap.setMarkers(plannerMarkers()); syncPlannerPanel();
      addRecent(trip.destination);
    }, function () { /* the pin keeps its generic name */ });
  }

  /** The battery level sheet used when the panel is in its compact (short screen) layout. */
  function batterySheet() {
    var v = Eco.vehicles.active();
    ui.sheet({
      title: 'Battery level',
      html: '<div class="bb-top" style="margin-bottom:6px"><span>' + esc(v.label) + '</span><span><b style="font-size:22px" id="bs-pct">' + Eco.vehicles.battery() + '%</b></span></div>' +
        '<input type="range" class="range" id="bs-slider" min="1" max="100" step="1" aria-label="Battery percentage">' +
        '<div class="bc-scale"><span>Empty</span><span>Full</span></div>' +
        '<p class="muted" style="margin:10px 0 16px" id="bs-range"></p>' +
        '<button type="button" class="btn btn-primary btn-lg btn-block" data-sheet-close>Done</button>',
      onMount: function (body) {
        var upd = function (p) { $('#bs-pct', body).textContent = p + '%'; $('#bs-range', body).textContent = 'About ' + Eco.calc.rangeLeft(v, p) + ' km of range left'; };
        Eco.vehicles.bindBatterySlider($('#bs-slider', body), upd); upd(Eco.vehicles.battery());
      },
      onClose: function () { syncPlannerPanel(); plannerFit(true); }
    });
  }

  function syncPlannerPanel() {
    var v = Eco.vehicles.active(), dest = trip.destination, s = Eco.store.state, o = originPoint();
    var compact = $('#app').clientHeight < 760;               // short phones: battery slider moves into a sheet
    $('.planner-panel').classList.toggle('compact', compact);
    $('#planner-veh').innerHTML =
      '<div class="pp-veh"><button type="button" class="pp-veh-main" data-go="vehicles">' + Eco.vehicles.iconBox(v, 22, 'vs-ic') +
      '<span class="vs-main"><h3>' + esc(v.label) + '</h3><p>' + esc(Eco.data.vehicleTypes[v.type].label) + ' · ' + v.gPerKm + ' g CO₂/km</p></span>' +
      '<span class="link-btn">Change</span><span class="pp-chev">' + ui.icon('chevron-right', 18) + '</span></button>' +
      (v.ev && compact ? '<button type="button" class="batt-chip' + (s.battery <= 20 ? ' low' : '') + '" data-action="planner-battery" aria-label="Battery level ' + s.battery + ' percent. Change">' + ui.icon('battery-charging', 16) + '<b>' + s.battery + '%</b></button>' : '') +
      '</div>';
    var bb = $('#planner-battery');
    bb.classList.toggle('hidden', !v.ev || compact);
    if (v.ev && !compact) {
      var left = Eco.calc.rangeLeft(v, s.battery);
      var need = dest && o ? Eco.geo.roadKm(o, dest) : 0;
      var warn = dest && need > left * 0.9;
      bb.innerHTML =
        '<div class="bb-top"><span>Battery level</span><span><b id="pb-pct">' + s.battery + '%</b> · ~<b id="pb-range">' + left + ' km</b> range</span></div>' +
        '<input type="range" class="range" id="pb-slider" min="1" max="100" step="1" aria-label="Battery percentage">' +
        (warn ? '<div class="bb-warn">' + ui.icon('alert-triangle', 16) + '<span>This trip (~' + fmt.km(need) + ' km) may need a charging stop.</span></div>' : '');
      Eco.vehicles.bindBatterySlider($('#pb-slider'), function (p) {
        $('#pb-pct').textContent = p + '%'; $('#pb-range').textContent = Eco.calc.rangeLeft(v, p) + ' km';
      });
      $('#pb-slider').addEventListener('change', syncPlannerPanel);
    }
    $('#planner-hint').textContent = dest
      ? dest.name + (o ? ' · about ' + fmt.km(Eco.geo.roadKm(o, dest)) + ' km away' : '')
      : (o ? 'Tap the map or search for a destination.' : 'Allow location, or type your starting point above, then choose a destination.');
    Eco.icons.hydrate($('#screen-planner'));
  }

  function paintFrom() { var el = $('#planner-from'); if (el && document.activeElement !== el) el.value = fromLabel(); }

  function locateMe() {
    Eco.location.refresh().then(function (f) {
      if (!pmap) return;
      pmap.setView({ lat: f.lat, lon: f.lon, zoom: 16 }, 500);
    }, function (err) {
      ui.toast(err && err.code === 1 ? Eco.location.blockedToast : 'Couldn’t get your position. Try again outdoors or near a window.', 'warn', { duration: 3600 });
    });
  }

  function plannerEnter() {
    paintFrom();
    syncPlannerPanel();                       // first: the panel's height is needed to pad the map
    var a = anchor();
    if (!pmap) {
      pmap = Eco.Map.create($('#planner-map'), {
        label: 'Map. Tap anywhere to choose a destination.', center: a || undefined, zoom: 14,
        onMapClick: dropPin, onLocate: locateMe
      });
    } else { pmap.resize(); }
    pmap.setMarkers(plannerMarkers());
    plannerFit(false);
    dsearch.set(trip.destination);
    $('#planner-clear').classList.toggle('hidden', !trip.destination);
    Eco.location.retain('planner');           // keep the blue dot (and the "from" address) up to date while this screen is open
    if (!planLoc) planLoc = Eco.location.onChange(function () {
      if (Eco.nav.current() !== 'planner' || !pmap) return;
      pmap.setMarkers(plannerMarkers()); paintFrom();
    });
  }
  function plannerLeave() {
    dsearch.close(); fsearch.close();
    if (planLoc) { planLoc(); planLoc = null; }
    Eco.location.release('planner');
  }

  function initPlanner() {
    dsearch = attachSearch({
      input: $('#planner-to'), list: $('#planner-suggest'), clearBtn: $('#planner-clear'),
      get: function () { return trip.destination; },
      onSelect: function (p) { chooseDestination(p, false); },
      onClear: function () { trip.destination = null; trip.routes = []; if (pmap) { pmap.setMarkers(plannerMarkers()); plannerFit(true); } syncPlannerPanel(); }
    });
    fsearch = attachSearch({
      input: $('#planner-from'), list: $('#planner-from-suggest'), allowHere: true, remember: false,
      get: function () { return trip.origin; },
      onSelect: function (p) { trip.origin = p; trip.routes = []; paintFrom(); syncPlannerPanel(); if (pmap) { pmap.setMarkers(plannerMarkers()); plannerFit(true); } },
      onHere: function () { trip.origin = null; trip.routes = []; paintFrom(); syncPlannerPanel(); if (pmap) { pmap.setMarkers(plannerMarkers()); plannerFit(true); } }
    });
    $('#planner-from').addEventListener('blur', function () { setTimeout(paintFrom, 200); });
    ui.actions['planner-locate'] = locateMe;
    ui.actions['planner-battery'] = batterySheet;
    ui.actions['find-route'] = start;
    window.addEventListener('resize', ui.debounce(function () {
      if (Eco.nav.current() === 'planner' && pmap) { syncPlannerPanel(); plannerFit(false); }
    }, 200));
    Eco.nav.register('planner', { enter: plannerEnter, leave: plannerLeave });
  }

  /* =====================================================================
     Screen 8: Route comparison
     ===================================================================== */
  var rmap = null, calcToken = 0;
  var BADGES = {
    shortest: { cls: 'badge-blue', icon: 'ruler', text: 'Shortest Route' },
    eco: { cls: 'badge-green', icon: 'leaf', text: 'Eco-Friendly' },
    fastest: { cls: 'badge-amber', icon: 'timer', text: 'Fastest' }
  };

  function routesEnter(params, isBack) {
    if (!trip.destination) { Eco.nav.go('home', { replace: true }); return; }
    calculate(!(isBack && trip.routes.length));
  }

  function routeMarkers(o) {
    var d = trip.destination;
    return [
      { id: 'start', type: 'start', lat: o.lat, lon: o.lon },
      { id: 'dest', type: 'dest', lat: d.lat, lon: d.lon, icon: d.type === 'station' ? 'zap' : (d.icon || 'flag'), label: d.name }
    ];
  }

  function ensureRoutesMap(a) {
    if (rmap) { rmap.resize(); return; }
    rmap = Eco.Map.create($('#routes-map'), {
      label: 'Map of the routes', center: a || undefined, zoom: 12, onRouteClick: function (id) { selectRoute(id, true); }
    });
  }

  function showRoutesError(err) {
    var msg = err && err.code === 'NoRoute' ? 'There is no driving route between these two places. Try a different destination.'
      : err === 'no-origin' ? 'Your position isn’t known yet. Allow location, or choose a starting point in Explore.'
      : err && err.network ? 'Can’t reach the routing service. Check your internet connection and try again.'
      : 'The routing service is busy right now. Please try again in a moment.';
    $('#routes-summary').innerHTML = '<span class="ic" style="color:var(--amber)">' + ui.icon('alert-triangle', 20) + '</span><div><b>Couldn’t plan this trip</b><p>' + esc(msg) + '</p></div>';
    $('#routes-list').innerHTML = '<div class="empty"><div class="empty-ic">' + ui.icon('route', 28) + '</div><h4>No routes to show</h4><p>' + esc(msg) + '</p>' +
      (err === 'no-origin' ? '<button type="button" class="btn btn-primary" data-go="planner">Open Explore</button>' : '<button type="button" class="btn btn-primary" data-action="routes-refresh">Try again</button>') + '</div>';
    Eco.icons.hydrate($('#screen-routes'));
  }

  function calculate(fresh) {
    var d = trip.destination, v = Eco.vehicles.active(), o = originPoint(), my = ++calcToken;
    $('#routes-sub').textContent = fromLabel() + ' → ' + d.name;
    ensureRoutesMap(o || Eco.location.last());
    if (!o) { showRoutesError('no-origin'); return; }
    $('#routes-summary').innerHTML = '<span class="ic spin" style="color:var(--accent)">' + ui.icon('refresh', 20) + '</span><div><b>Finding routes…</b><p>Comparing distance, time and emissions for ' + esc(v.label) + '.</p></div>';
    if (fresh) $('#routes-list').innerHTML = [1, 2, 3].map(function () { return '<div class="skeleton" style="height:230px;border-radius:22px"></div>'; }).join('');
    rmap.setMarkers(routeMarkers(o));
    rmap.fit([o, d], { pad: [68, 56, 36, 34], maxZoom: 16 });
    Eco.geo.route(o, d).then(function (cands) {
      if (my !== calcToken) return;
      trip.routes = Eco.geo.buildRoutes(cands, v);
      // first view of a trip: the shortest route is shown and selected; after that the user's own choice is kept
      if (!trip.routes.some(function (r) { return r.id === trip.selectedId; })) trip.selectedId = 'shortest';
      renderRoutes();
    }, function (err) { if (my === calcToken) showRoutesError(err); });
  }

  function arriveBattery(v, r) {
    var drain = r.distanceKm * v.whPerKm * r.flow / (v.battery * 1000) * 100;
    return Math.round(Eco.store.state.battery - drain);
  }

  function has(r, kind) { return r.kinds.indexOf(kind) > -1; }

  function renderRoutes() {
    var v = Eco.vehicles.active(), routes = trip.routes, s = Eco.store.state, o = originPoint();
    rmap.setMarkers(routeMarkers(o));
    rmap.setRoutes(routes.map(function (r) { return { id: r.id, points: r.points, cum: r.cum, active: r.id === trip.selectedId }; }));
    var pts = [o, trip.destination];
    routes.forEach(function (r) { r.points.forEach(function (p, i) { if (i % 8 === 0) pts.push(p); }); });
    rmap.fit(pts, { pad: [68, 56, 36, 34], maxZoom: 16, animate: 450 });

    var eco = routes.filter(function (r) { return has(r, 'eco'); })[0], sh = routes.filter(function (r) { return has(r, 'shortest'); })[0];
    var saved = sh.co2g - eco.co2g, pct = sh.co2g ? Math.round(saved / sh.co2g * 100) : 0, dt = sh.timeMin - eco.timeMin;
    var head, text;
    if (routes.length === 1) {
      head = 'One route found'; text = 'Only one sensible route exists for this trip, so Shortest, Eco and Fastest are the same. ';
    } else if (saved > 0 && eco !== sh) {
      head = 'Eco route saves ' + pct + '% CO₂';
      text = 'About ' + fmt.co2Text(saved) + ' less than the shortest route, and ' + (dt > 0 ? Math.round(dt) + ' min faster' : dt < 0 ? Math.round(Math.abs(dt)) + ' min slower' : 'the same time') + '. ';
    } else { head = 'The shortest route is also the greenest'; text = ''; }
    $('#routes-summary').innerHTML = '<span class="ic">' + ui.icon('leaf', 20) + '</span><div><b>' + head + '</b><p>' + text + 'Estimates for ' + esc(v.label) + ' (' + v.gPerKm + ' g/km).</p></div>';

    var best = {
      distanceKm: Math.min.apply(null, routes.map(function (r) { return r.distanceKm; })),
      timeMin: Math.min.apply(null, routes.map(function (r) { return r.timeMin; })),
      co2g: Math.min.apply(null, routes.map(function (r) { return r.co2g; }))
    };
    var left = v.ev ? Eco.calc.rangeLeft(v, s.battery) : 0;

    $('#routes-list').innerHTML = routes.map(function (r, i) {
      var sel = r.id === trip.selectedId, co2 = fmt.co2(r.co2g), min = Math.round(r.timeMin);
      var badges = r.badges.map(function (b) { var x = BADGES[b]; return '<span class="badge ' + x.cls + '">' + ui.icon(x.icon, 13) + x.text + '</span>'; }).join('');
      var warn = '';
      if (v.ev) {
        if (r.distanceKm > left * 0.92) warn = '<div class="rc-warn">' + ui.icon('alert-triangle', 15) + '<span>Battery may not last (~' + left + ' km range). A charging stop is recommended.</span></div>';
        else warn = '<div class="rc-note">' + ui.icon('battery-charging', 15) + '<span>Arrive with about <b>' + Math.max(0, arriveBattery(v, r)) + '%</b> battery</span></div>';
      } else {
        warn = '<div class="rc-note">' + ui.icon('info', 15) + '<span>' + (r.turns ? '~' + r.turns + ' turns and junctions' : 'Few turns') + ' · avg ' + Math.round(r.avgSpeed) + ' km/h</span></div>';
      }
      return '<article class="rcard fade-up' + (sel ? ' selected' : '') + '" style="--d:' + i * 0.06 + 's" data-rid="' + r.id + '" tabindex="0" aria-label="' + esc(r.title) + '">' +
        '<div class="rc-head"><div><h3><span class="rc-swatch"></span>' + r.title + '</h3><p>' + esc(r.via) + '</p></div><div class="rc-badges">' + badges + '<span class="badge badge-grey sel-tag">' + ui.icon('check', 13) + 'Selected</span></div></div>' +
        '<div class="rc-metrics">' +
        '<div class="rm' + (r.distanceKm === best.distanceKm ? ' best' : '') + '"><span class="rm-label">' + ui.icon('route', 13) + 'Distance</span><b>' + fmt.km(r.distanceKm) + '<small>km</small></b></div>' +
        '<div class="rm' + (r.timeMin === best.timeMin ? ' best' : '') + '"><span class="rm-label">' + ui.icon('clock', 13) + 'Time</span><b>' + fmt.dur(min).replace(' min', '') + '<small>' + (min < 60 ? 'min' : '') + '</small></b></div>' +
        '<div class="rm' + (r.co2g === best.co2g ? ' best' : '') + '"><span class="rm-label">' + ui.icon('cloud', 13) + 'CO₂</span><b>' + co2.v + '<small>' + co2.u + '</small></b></div>' +
        ui.ring({ value: r.ecoScore, size: 54, stroke: 6, fontScale: 0.32 }) +
        '</div>' + warn +
        '<button type="button" class="btn btn-primary btn-block" data-select-route="' + r.id + '">' + ui.icon('navigation', 18) + 'Select Route</button></article>';
    }).join('');
    Eco.icons.hydrate($('#screen-routes'));
  }

  function selectRoute(id, scroll) {
    if (trip.selectedId === id) return;
    trip.selectedId = id;
    $$('#routes-list .rcard').forEach(function (c) { c.classList.toggle('selected', c.getAttribute('data-rid') === id); });
    rmap.setActiveRoute(id);
    if (scroll) {
      var c = $('#routes-list .rcard[data-rid="' + id + '"]');
      if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function chooseRoute(id) {
    var r = trip.routes.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    trip.selectedId = id;
    addRecent(trip.destination);
    Eco.tracking.prepare(r);
    Eco.nav.go('navigation');
  }

  function initRoutes() {
    $('#routes-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-select-route]');
      if (b) { chooseRoute(b.getAttribute('data-select-route')); return; }
      var c = e.target.closest('[data-rid]'); if (c) selectRoute(c.getAttribute('data-rid'), false);
    });
    $('#routes-list').addEventListener('keydown', function (e) {
      var c = e.target.closest('[data-rid]');
      if (c && e.key === 'Enter' && e.target === c) selectRoute(c.getAttribute('data-rid'), false);
    });
    ui.actions['routes-refresh'] = function () {
      Eco.geo.clearCaches(); calculate(true); ui.toast('Looking for routes again', 'info', { duration: 1800 });
    };
    Eco.nav.register('routes', { enter: routesEnter, leave: function () { calcToken++; } });
  }

  Eco.routes = { attachSearch: attachSearch, start: start, addRecent: addRecent, distLabel: distLabel, originPoint: originPoint, fromLabel: fromLabel };
  Eco.onReady(function () { initPlanner(); initRoutes(); });
})();
