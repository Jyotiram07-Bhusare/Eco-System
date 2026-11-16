/* ==========================================================================
   EcoRoute - routes.js
   Screens 7-8: Route Planner (Explore) and Route Comparison.
   Also the reusable destination-search component (simulated lookup).
   All routes, times and emissions are simulated estimates.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc, fmt = ui.fmt;
  var trip = Eco.trip;
  var variant = 0;                       // bumped by "recalculate" so simulated traffic changes

  var TYPE_WORDS = {
    home: 'home residential house apartment', transit: 'station train metro bus railway transit', mall: 'mall shopping shop store',
    work: 'office work business tech park it', college: 'college university school campus education', hospital: 'hospital clinic health doctor medical',
    market: 'market bazaar shop old heritage', airport: 'airport flight plane terminal', park: 'park garden nature waterfront river walk',
    stadium: 'stadium sports gym ground', station: 'ev charging charger station plug'
  };

  /* =====================================================================
     Destination search component
     ===================================================================== */
  function pool() { return Eco.data.places.filter(function (p) { return p.id !== 'green-park'; }).concat(Eco.data.stations); }
  function distKm(p) { return Eco.calc.mapKm(trip.origin || Eco.data.currentLocation, p); }
  function distLabel(p) { return fmt.km(distKm(p)) + ' km'; }

  function highlight(text, q) {
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  function matches(q) {
    q = q.toLowerCase();
    var tokens = q.split(/\s+/).filter(Boolean);
    return pool().map(function (p) {
      var hay = (p.name + ' ' + p.area + ' ' + (TYPE_WORDS[p.type] || '')).toLowerCase();
      var ok = tokens.every(function (t) { return hay.indexOf(t) > -1; });
      if (!ok) return null;
      var name = p.name.toLowerCase();
      var score = name.indexOf(q) === 0 ? 3 : name.indexOf(q) > -1 ? 2 : 1;
      return { p: p, score: score, d: distKm(p) };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score || a.d - b.d; }).slice(0, 8).map(function (r) { return r.p; });
  }

  function itemHtml(p, q, recent) {
    return '<button type="button" class="suggest-item" role="option" data-pid="' + p.id + '">' +
      '<span class="s-ic' + (recent ? ' recent' : '') + '">' + ui.icon(recent ? 'history' : p.icon, 18) + '</span>' +
      '<span class="s-main"><b>' + highlight(p.name, q || '') + '</b><small>' + esc(p.area) + '</small></span>' +
      '<span class="s-dist">' + distLabel(p) + '</span></button>';
  }

  function addRecent(id) {
    var r = Eco.store.state.recent || [];
    r = [id].concat(r.filter(function (x) { return x !== id; })).slice(0, 5);
    Eco.store.state.recent = r; Eco.store.save();
  }

  /**
   * o: { input, list, clearBtn, onSelect(place), onClear() }
   * Typing shows a short skeleton (simulating a network lookup), then results.
   */
  function attachSearch(o) {
    var input = o.input, list = o.list, timer = null;

    function open() { list.classList.remove('hidden'); }
    function close() { list.classList.add('hidden'); clearTimeout(timer); }
    function syncClear() { if (o.clearBtn) o.clearBtn.classList.toggle('hidden', !input.value); }

    function showDefault() {
      var recent = (Eco.store.state.recent || []).map(Eco.data.findPlace).filter(function (p) { return p && p.id !== 'green-park'; }).slice(0, 3);
      var ids = recent.map(function (p) { return p.id; });
      var popular = pool().filter(function (p) { return p.type !== 'station' && ids.indexOf(p.id) < 0; })
        .sort(function (a, b) { return distKm(a) - distKm(b); }).slice(0, 4);
      list.innerHTML =
        (recent.length ? '<div class="suggest-head">Recent</div>' + recent.map(function (p) { return itemHtml(p, '', true); }).join('') : '') +
        '<div class="suggest-head">Popular nearby</div>' + popular.map(function (p) { return itemHtml(p, ''); }).join('');
      Eco.icons.hydrate(list);
    }
    function showResults(q) {
      var res = matches(q);
      list.innerHTML = res.length ? res.map(function (p) { return itemHtml(p, q); }).join('')
        : '<div class="suggest-empty">No places match “' + esc(q) + '”.<br><span class="small">Try “mall”, “station” or “charging”.</span></div>';
      Eco.icons.hydrate(list);
    }
    function search(q) {
      list.innerHTML = '<div class="suggest-loading"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
      open();
      clearTimeout(timer);
      timer = setTimeout(function () { showResults(q); }, 380);
    }
    function choose(p) {
      input.value = p.name; syncClear(); close(); input.blur();
      addRecent(p.id);
      if (o.onSelect) o.onSelect(p);
    }

    input.addEventListener('focus', function () {
      if (trip.destination && input.value === trip.destination.name) input.select();
      if (!input.value.trim() || (trip.destination && input.value === trip.destination.name)) showDefault(); else showResults(input.value.trim());
      open();
    });
    input.addEventListener('input', function () {
      var q = input.value.trim();
      syncClear();
      if (trip.destination && input.value !== trip.destination.name) { trip.destination = null; if (o.onClear) o.onClear(true); }
      if (!q) { showDefault(); open(); } else search(q);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var res = input.value.trim() ? matches(input.value.trim()) : [];
        if (res.length) choose(res[0]);
      } else if (e.key === 'Escape') { close(); input.blur(); }
      else if (e.key === 'ArrowDown') { var f = $('.suggest-item', list); if (f) { e.preventDefault(); f.focus(); } }
    });
    list.addEventListener('keydown', function (e) {
      var items = $$('.suggest-item', list), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) items[i - 1].focus(); else input.focus(); }
    });
    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pid]'); if (!b) return;
      var p = Eco.data.findPlace(b.getAttribute('data-pid')); if (p) choose(p);
    });
    if (o.clearBtn) o.clearBtn.addEventListener('click', function () {
      input.value = ''; syncClear(); trip.destination = null;
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
  var pmap = null, psearch = null;

  function plannerMarkers() {
    var dest = trip.destination, list = [];
    Eco.data.places.forEach(function (p) {
      if (p.id === 'green-park' || (dest && dest.id === p.id)) return;
      list.push({ id: p.id, type: 'poi', x: p.x, y: p.y, icon: p.icon, label: p.name });
    });
    if (dest) list.push({ id: 'dest', type: 'dest', x: dest.x, y: dest.y, icon: dest.type === 'station' ? 'zap' : 'flag', label: dest.name });
    list.push({ id: 'current', type: 'current', x: Eco.data.currentLocation.x, y: Eco.data.currentLocation.y });
    return list;
  }

  /** Keep both markers clear of the search card (top) and the bottom panel, whatever their real heights are. */
  function plannerFit(animate) {
    var cur = Eco.data.currentLocation, dest = trip.destination;
    var short = $('#app').clientHeight < 700;                  // tight screens: less breathing room, more map
    var pad = Eco.Map.overlayPads($('#planner-map'), $('.route-fields-card'), $('.planner-panel'), { top: short ? 58 : 64, right: 64, bottom: short ? 22 : 36, left: 64 });
    if (dest) pmap.fit([cur, dest], { pad: pad, maxZoom: 0.9, animate: animate ? 650 : 0 });
    else pmap.fit(Eco.data.places.concat([cur]), { pad: pad, maxZoom: 0.7, animate: animate ? 650 : 0 });
  }

  function chooseDestination(p, fromMap) {
    trip.destination = p; trip.routes = []; trip.selectedId = null;
    psearch.set(p);
    syncPlannerPanel();                       // panel first: its final height decides the map padding
    pmap.setMarkers(plannerMarkers());
    plannerFit(true);
    ui.vibrate(10);
    if (fromMap) addRecent(p.id);
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
      onClose: function () { syncPlannerPanel(); if (pmap) plannerFit(true); }
    });
  }

  function syncPlannerPanel() {
    var v = Eco.vehicles.active(), dest = trip.destination, s = Eco.store.state;
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
      var need = dest ? Eco.calc.mapKm(trip.origin, dest) : 0;
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
      ? dest.name + ' · about ' + fmt.km(Eco.calc.mapKm(trip.origin, dest)) + ' km away'
      : 'Tap a pin on the map or search for a destination.';
    Eco.icons.hydrate($('#screen-planner'));
  }

  /** Where the trip starts: your real street address when the server looked it up, otherwise the generic label. */
  function fromLabel() { return Eco.location.label() || 'Current Location'; }

  function plannerEnter() {
    $('#planner-from').value = fromLabel();
    syncPlannerPanel();                       // first: the panel's height is needed to pad the map
    if (!pmap) {
      pmap = Eco.Map.create($('#planner-map'), {
        label: 'Simulated map. Tap a pin to choose a destination.',
        onMarkerClick: function (id) {
          var p = Eco.data.findPlace(id);
          if (p && id !== 'current' && id !== 'dest') chooseDestination(p, true);
        },
        onLocate: function () { pmap.setView({ cx: Eco.data.currentLocation.x, cy: Eco.data.currentLocation.y, s: 0.8 }, 500); }
      });
      pmap.setMarkers(plannerMarkers());
      plannerFit(false);
    } else {
      pmap.resize();
      pmap.setMarkers(plannerMarkers());
      if (trip.destination) plannerFit(false);
    }
    psearch.set(trip.destination);
    $('#planner-clear').classList.toggle('hidden', !trip.destination);
  }

  function initPlanner() {
    psearch = attachSearch({
      input: $('#planner-to'), list: $('#planner-suggest'), clearBtn: $('#planner-clear'),
      onSelect: function (p) { chooseDestination(p, false); },
      onClear: function () { if (pmap) { pmap.setMarkers(plannerMarkers()); plannerFit(true); } syncPlannerPanel(); }
    });
    ui.actions['planner-locate'] = function () { if (pmap) pmap.setView({ cx: Eco.data.currentLocation.x, cy: Eco.data.currentLocation.y, s: 0.85 }, 500); };
    ui.actions['planner-battery'] = batterySheet;
    ui.actions['find-route'] = start;
    window.addEventListener('resize', ui.debounce(function () {
      if (Eco.nav.current() === 'planner' && pmap) { syncPlannerPanel(); plannerFit(false); }
    }, 200));
    Eco.nav.register('planner', { enter: plannerEnter, leave: function () { psearch.close(); } });
  }

  /* =====================================================================
     Screen 8: Route comparison
     ===================================================================== */
  var rmap = null, calcTimer = null;
  var BADGES = {
    shortest: { cls: 'badge-blue', icon: 'ruler', text: 'Shortest Route' },
    eco: { cls: 'badge-green', icon: 'leaf', text: 'Eco-Friendly' },
    fastest: { cls: 'badge-amber', icon: 'timer', text: 'Fastest' }
  };

  function routesEnter(params, isBack) {
    if (!trip.destination) { Eco.nav.go('home', { replace: true }); return; }
    calculate(!(isBack && trip.routes.length));
  }

  function calculate(withDelay) {
    var d = trip.destination, v = Eco.vehicles.active();
    clearTimeout(calcTimer);
    $('#routes-sub').textContent = fromLabel() + ' → ' + d.name;
    $('#routes-summary').innerHTML = '<span class="ic spin" style="color:var(--accent)">' + ui.icon('refresh', 20) + '</span><div><b>Analysing routes…</b><p>Comparing distance, traffic and emissions for ' + esc(v.label) + '.</p></div>';
    if (withDelay) {
      $('#routes-list').innerHTML = [1, 2, 3].map(function () { return '<div class="skeleton" style="height:230px;border-radius:22px"></div>'; }).join('');
    }
    ensureRoutesMap();
    rmap.setMarkers(routeMarkers());
    rmap.fit([trip.origin, d], { pad: [68, 56, 36, 34], maxZoom: 1.1 });
    calcTimer = setTimeout(function () {
      trip.routes = Eco.geo.buildRoutes(trip.origin, d, v, variant);
      // first view of a trip: the shortest route is shown and selected; after that the user's own choice is kept
      if (!trip.routes.some(function (r) { return r.id === trip.selectedId; })) trip.selectedId = 'shortest';
      renderRoutes();
    }, withDelay ? 950 : 0);
  }

  function routeMarkers() {
    var d = trip.destination;
    return [
      { id: 'start', type: 'start', x: trip.origin.x, y: trip.origin.y },
      { id: 'dest', type: 'dest', x: d.x, y: d.y, icon: d.type === 'station' ? 'zap' : 'flag', label: d.name }
    ];
  }

  function ensureRoutesMap() {
    if (rmap) { rmap.resize(); return; }
    rmap = Eco.Map.create($('#routes-map'), {
      label: 'Simulated route comparison map', onRouteClick: function (id) { selectRoute(id, true); }
    });
  }

  function mapRoutes() {
    return trip.routes.map(function (r) { return { id: r.id, d: r.d, active: r.id === trip.selectedId }; });
  }

  function arriveBattery(v, r) {
    var drain = r.distanceKm * v.whPerKm * r.flow / (v.battery * 1000) * 100;
    return Math.round(Eco.store.state.battery - drain);
  }

  function renderRoutes() {
    var v = Eco.vehicles.active(), routes = trip.routes, s = Eco.store.state;
    rmap.setMarkers(routeMarkers());
    rmap.setRoutes(mapRoutes());
    var pts = [trip.origin, trip.destination]; routes.forEach(function (r) { pts = pts.concat(r.points); });
    rmap.fit(pts, { pad: [68, 56, 36, 34], maxZoom: 1.1, animate: 450 });

    var eco = routes.filter(function (r) { return r.id === 'eco'; })[0], sh = routes.filter(function (r) { return r.id === 'shortest'; })[0];
    var saved = sh.co2g - eco.co2g, pct = Math.round(saved / sh.co2g * 100), dt = sh.timeMin - eco.timeMin;
    $('#routes-summary').innerHTML = '<span class="ic">' + ui.icon('leaf', 20) + '</span><div><b>' +
      (saved > 0 ? 'Eco route saves ' + pct + '% CO₂' : 'Routes are similar for your vehicle') + '</b><p>' +
      (saved > 0 ? 'About ' + fmt.co2Text(saved) + ' less than the shortest route, and ' + (dt > 0 ? dt + ' min faster' : dt < 0 ? Math.abs(dt) + ' min slower' : 'the same time') + '. ' : '') +
      'Estimates for ' + esc(v.label) + ' (' + v.gPerKm + ' g/km).</p></div>';

    var best = {
      distanceKm: Math.min.apply(null, routes.map(function (r) { return r.distanceKm; })),
      timeMin: Math.min.apply(null, routes.map(function (r) { return r.timeMin; })),
      co2g: Math.min.apply(null, routes.map(function (r) { return r.co2g; }))
    };
    var left = v.ev ? Eco.calc.rangeLeft(v, s.battery) : 0;

    $('#routes-list').innerHTML = routes.map(function (r, i) {
      var sel = r.id === trip.selectedId, co2 = fmt.co2(r.co2g);
      var badges = r.badges.map(function (b) { var x = BADGES[b]; return '<span class="badge ' + x.cls + '">' + ui.icon(x.icon, 13) + x.text + '</span>'; }).join('');
      var warn = '';
      if (v.ev) {
        if (r.distanceKm > left * 0.92) warn = '<div class="rc-warn">' + ui.icon('alert-triangle', 15) + '<span>Battery may not last (~' + left + ' km range). A charging stop is recommended.</span></div>';
        else warn = '<div class="rc-note">' + ui.icon('battery-charging', 15) + '<span>Arrive with about <b>' + Math.max(0, arriveBattery(v, r)) + '%</b> battery</span></div>';
      } else {
        warn = '<div class="rc-note">' + ui.icon('info', 15) + '<span>' + esc(r.note) + ' ~' + r.signals + ' signals · avg ' + r.avgSpeed + ' km/h</span></div>';
      }
      return '<article class="rcard fade-up' + (sel ? ' selected' : '') + '" style="--d:' + i * 0.06 + 's" data-rid="' + r.id + '" tabindex="0" aria-label="' + esc(r.title) + '">' +
        '<div class="rc-head"><div><h3><span class="rc-swatch"></span>' + r.title + '</h3><p>' + r.via + '</p></div><div class="rc-badges">' + badges + '<span class="badge badge-grey sel-tag">' + ui.icon('check', 13) + 'Selected</span></div></div>' +
        '<div class="rc-metrics">' +
        '<div class="rm' + (r.distanceKm === best.distanceKm ? ' best' : '') + '"><span class="rm-label">' + ui.icon('route', 13) + 'Distance</span><b>' + fmt.km(r.distanceKm) + '<small>km</small></b></div>' +
        '<div class="rm' + (r.timeMin === best.timeMin ? ' best' : '') + '"><span class="rm-label">' + ui.icon('clock', 13) + 'Time</span><b>' + fmt.dur(r.timeMin).replace(' min', '') + '<small>' + (r.timeMin < 60 ? 'min' : '') + '</small></b></div>' +
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
      variant++; calculate(true); ui.toast('Routes recalculated with simulated live traffic', 'info');
    };
    Eco.nav.register('routes', { enter: routesEnter, leave: function () { clearTimeout(calcTimer); } });
  }

  Eco.routes = { attachSearch: attachSearch, start: start, addRecent: addRecent, distLabel: distLabel };
  Eco.onReady(function () { initPlanner(); initRoutes(); });
})();
