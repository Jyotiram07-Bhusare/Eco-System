/* ==========================================================================
   EcoRoute - charging.js
   Screen 10: EV Charging Station Finder.
   The stations are real: OpenStreetMap data (charging_station objects) around your position, read through the
   Overpass service (see geo.js; when the public Overpass servers are slow a shorter list from Nominatim is shown
   first, labelled, and replaced by the full list when it arrives). OpenStreetMap volunteers map chargers, so
   coverage varies by area, and it has NO live availability: the app says so instead of showing free / busy ports.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc, fmt = ui.fmt;
  var trip = Eco.trip;

  var CONNECTORS = ['CCS2', 'Type 2', 'CHAdeMO', '3-Pin AC'];
  var RADII = [8, 20, 50];                              // km: the search widens step by step
  var cmap = null, selectedId = null, stations = [], state = 'idle', radiusIdx = 0, loadedAt = 0, loadedFrom = null, token = 0, off = null, fromBackup = false;
  var filters = { fast: false, reach: false, conn: [] };

  /** Where the search is centred: the live position, else the one remembered from last time. */
  function center() { var f = Eco.location.state.fix; return f ? { lat: f.lat, lon: f.lon } : Eco.location.last(); }
  function dist(s) { var c = center(); return c ? Eco.geo.roadKm(c, s) : 0; }

  function vehicle() { return Eco.vehicles.active(); }
  function rangeKm() { var v = vehicle(); return v.ev ? Eco.calc.rangeLeft(v, Eco.vehicles.battery()) : 0; }
  function arriveBattery(s) {
    var v = vehicle(); if (!v.ev) return null;
    var drain = dist(s) * v.whPerKm / (v.battery * 1000) * 100;
    return Math.round(Eco.vehicles.battery() - drain);
  }
  function reachable(s) { var v = vehicle(); return v.ev && dist(s) <= rangeKm() * 0.9; }

  function filtered() {
    var v = vehicle();
    return stations.filter(function (s) {
      if (filters.fast && !(s.kw && s.kw >= 50)) return false;
      if (filters.reach && v.ev && !reachable(s)) return false;
      if (filters.conn.length && !filters.conn.some(function (c) { return s.connectors.indexOf(c) > -1; })) return false;
      return true;
    }).sort(function (a, b) { return dist(a) - dist(b); });
  }

  /* ---------- battery card (built once per render; slider is NOT re-rendered while dragging) ---------- */
  function renderBattery() {
    var v = vehicle(), b = Eco.vehicles.battery(), host = $('#chg-battery');
    if (!v.ev) {
      host.innerHTML =
        '<div class="bc-top"><span class="vs-ic" style="width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:var(--secondary);color:var(--accent)">' + ui.icon('plug', 22) + '</span>' +
        '<div class="bc-main"><h3>Showing nearby chargers</h3><p class="bc-sub">' + esc(v.label) + ' isn’t electric, so range estimates are hidden.</p></div></div>' +
        '<div class="bc-note info">' + ui.icon('zap', 16) + '<span>Switch to an EV to see battery &amp; range.</span><button type="button" class="btn btn-primary" data-action="chg-use-ev">Use EV</button></div>';
      Eco.icons.hydrate(host);
      return;
    }
    host.innerHTML =
      '<div class="bc-top"><div class="batt-ic" id="bc-ic"><span id="bc-fill"></span></div>' +
      '<div class="bc-main"><div class="bc-pct"><span id="bc-pct">' + b + '</span>%</div><p class="bc-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(v.label) + '</p><p class="bc-sub">~<b id="bc-range">' + Eco.calc.rangeLeft(v, b) + '</b> km range</p></div>' +
      '<label class="input-wrap" style="height:44px;width:84px;padding:0 10px;gap:4px" for="bc-num"><input id="bc-num" type="number" inputmode="numeric" min="0" max="100" step="1" aria-label="Battery percentage" style="text-align:right;font-weight:650"><span style="font-weight:650;color:var(--text-2)">%</span></label></div>' +
      '<div class="bc-slider"><input type="range" class="range" id="bc-slider" min="1" max="100" step="1" aria-label="Battery percentage slider"><div class="bc-scale"><span>Empty</span><span>Full</span></div></div>' +
      '<div class="chip-row chip-row-sm" id="bc-quick" style="margin-top:8px"><button type="button" class="chip" data-set="20">20%</button><button type="button" class="chip" data-set="50">50%</button><button type="button" class="chip" data-set="80">80%</button><button type="button" class="chip" data-set="100">Full</button></div>' +
      '<div id="bc-note"></div>';
    var slider = $('#bc-slider'), num = $('#bc-num');
    num.value = b; paintBattery(b);
    Eco.vehicles.bindBatterySlider(slider, function (p) { num.value = p; paintBattery(p); renderList(); });
    num.addEventListener('input', function () {
      var n = parseInt(num.value, 10); if (isNaN(n)) return;
      n = ui.clamp(n, 0, 100);
      Eco.vehicles.setBattery(n, true); slider.value = Math.max(1, n); Eco.vehicles.paintRange(slider); paintBattery(n); renderList();
    });
    num.addEventListener('change', function () { var n = ui.clamp(parseInt(num.value, 10) || 0, 0, 100); num.value = n; Eco.vehicles.setBattery(n); });
    $('#bc-quick').addEventListener('click', function (e) {
      var c = e.target.closest('[data-set]'); if (!c) return;
      var n = Eco.vehicles.setBattery(c.getAttribute('data-set'));
      slider.value = n; Eco.vehicles.paintRange(slider); num.value = n; paintBattery(n); renderList();
      ui.toast(n === 100 ? 'Battery set to full' : 'Battery set to ' + n + '%', 'success', { duration: 1600 });
    });
    Eco.icons.hydrate(host);
  }

  function paintBattery(p) {
    var v = vehicle();
    var pct = $('#bc-pct'); if (!pct) return;
    pct.textContent = p;
    $('#bc-fill').style.width = ui.clamp(p, 2, 100) + '%';
    $('#bc-ic').classList.toggle('low', p <= 20);
    $('#bc-range').textContent = Eco.calc.rangeLeft(v, p);
    var note = $('#bc-note');
    if (state !== 'ok') { note.innerHTML = ''; return; }
    var inRange = stations.filter(function (s) { return dist(s) <= Eco.calc.rangeLeft(v, p) * 0.9; }).length;
    if (p <= 20) note.innerHTML = '<div class="bc-note">' + ui.icon('alert-triangle', 16) + '<span>Low battery. ' + (inRange ? inRange + ' station' + (inRange === 1 ? '' : 's') + ' within range.' : 'No stations within range.') + '</span></div>';
    else note.innerHTML = '<div class="bc-note info">' + ui.icon('check-circle', 16) + '<span>' + inRange + ' of ' + stations.length + ' stations within comfortable range.</span></div>';
    Eco.icons.hydrate(note);
  }

  /* ---------- filter chips ---------- */
  function renderFilters() {
    var v = vehicle();
    var none = !filters.fast && !filters.reach && !filters.conn.length;
    var chips = [{ k: 'all', t: 'All', on: none }, { k: 'fast', t: 'Fast 50 kW+', on: filters.fast, icon: 'zap' }];
    if (v.ev) chips.push({ k: 'reach', t: 'In range', on: filters.reach, icon: 'battery-charging' });
    CONNECTORS.forEach(function (c) { chips.push({ k: 'c:' + c, t: c, on: filters.conn.indexOf(c) > -1 }); });
    $('#chg-filters').innerHTML = chips.map(function (c) {
      return '<button type="button" class="chip' + (c.on ? ' active' : '') + '" data-f="' + esc(c.k) + '" aria-pressed="' + c.on + '">' + (c.icon ? ui.icon(c.icon, 16) : '') + esc(c.t) + '</button>';
    }).join('');
  }

  function toggleFilter(k) {
    if (k === 'all') { filters = { fast: false, reach: false, conn: [] }; }
    else if (k.indexOf('c:') === 0) {
      var c = k.slice(2), i = filters.conn.indexOf(c);
      if (i > -1) filters.conn.splice(i, 1); else filters.conn.push(c);
    } else filters[k] = !filters[k];
    renderFilters(); renderList(); renderMarkers(true);
  }

  /* ---------- station list ---------- */
  function stationCard(s, i) {
    var v = vehicle(), sel = s.id === selectedId, reach = '';
    if (v.ev) {
      var ab = arriveBattery(s);
      reach = reachable(s)
        ? '<span class="st-reach">' + ui.icon('check-circle', 14) + 'Arrive with ~' + Math.max(0, ab) + '%</span>'
        : '<span class="st-reach no">' + ui.icon('alert-triangle', 14) + 'Out of range at ' + Eco.vehicles.battery() + '%</span>';
    }
    var ports = s.total ? s.total + (s.total === 1 ? ' port' : ' ports') : 'Ports not listed';
    var power = s.kw ? Math.round(s.kw * 10) / 10 + ' kW' + (s.kw >= 50 ? ' · DC fast' : '') : 'Power not listed';
    return '<article class="station fade-up' + (sel ? ' selected' : '') + '" style="--d:' + Math.min(i, 8) * 0.04 + 's" data-sid="' + esc(s.id) + '" id="st-' + esc(s.id) + '">' +
      '<div class="st-head"><span class="st-ic available">' + ui.icon('zap', 22) + '</span>' +
      '<div class="st-title"><h3>' + esc(s.name) + '</h3><p>' + ui.icon('map-pin', 13) + fmt.km(dist(s)) + ' km' + (s.area ? ' · ' + esc(s.area) : '') + '</p></div>' +
      '<span class="badge badge-grey">' + esc(ports) + '</span></div>' +
      '<div class="st-tags"><span class="tag tag-power">' + ui.icon('zap', 13) + esc(power) + '</span>' +
      s.connectors.map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') + (s.fee === 'no' ? '<span class="tag">Free to use</span>' : '') + '</div>' +
      '<div class="st-foot"><div><small>Availability isn’t live · OpenStreetMap data</small><br>' + reach + '</div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-nav-st="' + esc(s.id) + '">' + ui.icon('navigation', 16) + 'Navigate</button></div></article>';
  }

  function emptyBox(icon, title, text, buttons) {
    return '<div class="empty"><div class="empty-ic">' + ui.icon(icon, 28) + '</div><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p>' + (buttons || '') + '</div>';
  }

  function renderList() {
    var host = $('#chg-list'), count = $('#chg-count'), r = RADII[radiusIdx];
    if (state === 'nolocation') {
      count.textContent = 'Your position is needed to find chargers near you';
      host.innerHTML = emptyBox('locate-fixed', 'Where are you?', 'Allow location to see EV chargers around you.', '<button type="button" class="btn btn-primary" data-action="chg-locate">Use my location</button>');
    } else if (state === 'loading') {
      count.textContent = 'Looking for chargers within ' + r + ' km…';
      host.innerHTML = [1, 2, 3].map(function () { return '<div class="skeleton" style="height:150px;border-radius:22px"></div>'; }).join('');
    } else if (state === 'error') {
      count.textContent = 'Couldn’t load chargers';
      host.innerHTML = emptyBox('zap-off', 'Chargers can’t be loaded right now', 'The free OpenStreetMap data service is busy, or you are offline. Check your internet and try again.', '<button type="button" class="btn btn-primary" data-action="charging-refresh">Try again</button>');
    } else if (state === 'ok') {
      var list = filtered();
      count.textContent = list.length + ' of ' + stations.length + ' stations within ' + r + ' km · nearest first' + (loadedAt ? ' · updated ' + fmt.clock(loadedAt) : '');
      if (!stations.length) {
        host.innerHTML = emptyBox('zap-off', 'No chargers found within ' + r + ' km', 'OpenStreetMap has no charging stations mapped around here. Coverage varies by area.',
          radiusIdx < RADII.length - 1 ? '<button type="button" class="btn btn-primary" data-action="chg-wider">Search within ' + RADII[radiusIdx + 1] + ' km</button>' : '');
      } else if (!list.length) {
        host.innerHTML = emptyBox('zap-off', 'No stations match', 'Try removing a filter or raising your battery level.', '<button type="button" class="btn btn-secondary" data-f="all">Clear filters</button>');
      } else {
        host.innerHTML = (fromBackup ? '<div class="bc-note" id="chg-backup">' + ui.icon('alert-triangle', 16) + '<span>The main charger service is busy, so this is a shorter list from a backup source. It may miss some stations.</span><button type="button" class="btn btn-secondary btn-sm" data-action="charging-refresh">Retry</button></div>' : '') +
          list.slice(0, 40).map(stationCard).join('') +
          (radiusIdx < RADII.length - 1 ? '<button type="button" class="btn btn-secondary btn-block more-btn" data-action="chg-wider">Search wider (' + RADII[radiusIdx + 1] + ' km)</button>' : '');
      }
    }
    Eco.icons.hydrate(host);
  }

  /* ---------- map ---------- */
  function renderMarkers(refit) {
    if (!cmap) return;
    var list = filtered().slice(0, 40), c = center(), markers = list.map(function (s) {
      return { id: s.id, type: 'station', lat: s.lat, lon: s.lon, status: 'unknown', selected: s.id === selectedId, label: s.id === selectedId ? s.name : '' };
    });
    if (c) markers.push({ id: 'current', type: 'current', lat: c.lat, lon: c.lon });
    cmap.setMarkers(markers);
    if (refit) {
      var pts = list.slice(0, 12).map(function (s) { return { lat: s.lat, lon: s.lon }; });
      if (c) pts.push(c);
      if (pts.length) cmap.fit(pts, { pad: [36, 36, 36, 36], maxZoom: 15, animate: 400 });
      else if (c) cmap.setView({ lat: c.lat, lon: c.lon, zoom: 13 }, 400);
    }
  }

  function select(id, fromMap) {
    selectedId = id;
    var s = stations.filter(function (x) { return x.id === id; })[0];
    $$('#chg-list .station').forEach(function (c) { c.classList.toggle('selected', c.getAttribute('data-sid') === id); });
    renderMarkers(false);
    if (s && cmap) cmap.setView({ lat: s.lat, lon: s.lon, zoom: Math.max(cmap.getView().zoom, 15) }, 450);
    if (fromMap) { var card = $('#st-' + id); if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    else if (s) { var m = $('#charging-map'); if (m && m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function navigateTo(id) {
    var s = stations.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    trip.destination = { id: s.id, name: s.name, area: s.area || s.operator || '', lat: s.lat, lon: s.lon, icon: 'zap', type: 'station' };
    trip.routes = []; trip.selectedId = null;
    Eco.routes.addRecent(trip.destination);
    Eco.routes.start();
  }

  /* ---------- loading ---------- */
  function load(force) {
    var c = center();
    if (!c) { state = 'nolocation'; renderList(); paintBattery(Eco.vehicles.battery()); return; }
    if (force) Eco.geo.clearCaches();
    var my = ++token;
    state = 'loading'; renderList();
    Eco.geo.chargers(c, RADII[radiusIdx], function (full) {        // the complete list arrived after the shorter backup one
      if (my !== token) return;
      stations = full; fromBackup = false;
      renderList(); renderMarkers(false); paintBattery(Eco.vehicles.battery());
      ui.toast('Full charger list loaded', 'success', { duration: 2200 });
    }).then(function (list) {
      if (my !== token) return;
      stations = list; fromBackup = !!list.backup; state = 'ok'; loadedAt = Date.now(); loadedFrom = c;
      if (selectedId && !stations.some(function (s) { return s.id === selectedId; })) selectedId = null;
      renderList(); renderMarkers(true); paintBattery(Eco.vehicles.battery());
    }, function () {
      if (my !== token) return;
      state = 'error'; renderList(); renderMarkers(false);
    });
  }

  function stale() {
    var c = center();
    return state === 'idle' || state === 'nolocation' || state === 'error' || !loadedAt || Date.now() - loadedAt > 10 * 60000 || (c && loadedFrom && Eco.geo.haversine(c, loadedFrom) > 1500);
  }

  function enter() {
    renderBattery(); renderFilters();
    var c = center();
    if (!cmap) {
      cmap = Eco.Map.create($('#charging-map'), {
        label: 'Map of nearby EV charging stations', center: c || undefined, zoom: 13,
        onMarkerClick: function (id) { if (id !== 'current') select(id, true); },
        onLocate: function () { Eco.location.refresh().then(function (f) { cmap.setView({ lat: f.lat, lon: f.lon, zoom: 15 }, 450); }, function () { ui.toast('Couldn’t get your position', 'warn'); }); }
      });
    } else { cmap.resize(); }
    Eco.location.retain('charging');
    if (!off) off = Eco.location.onChange(function () {
      if (Eco.nav.current() === 'charging' && state === 'nolocation' && center()) load(false);
    });
    if (stale()) load(false); else { renderList(); renderMarkers(true); paintBattery(Eco.vehicles.battery()); }
  }
  function leave() { if (off) { off(); off = null; } Eco.location.release('charging'); }

  function init() {
    $('#chg-filters').addEventListener('click', function (e) { var c = e.target.closest('[data-f]'); if (c) toggleFilter(c.getAttribute('data-f')); });
    $('#chg-list').addEventListener('click', function (e) {
      var f = e.target.closest('[data-f]'); if (f) { toggleFilter(f.getAttribute('data-f')); return; }
      var n = e.target.closest('[data-nav-st]'); if (n) { navigateTo(n.getAttribute('data-nav-st')); return; }
      var card = e.target.closest('[data-sid]'); if (card) select(card.getAttribute('data-sid'), false);
    });
    ui.actions['charging-refresh'] = function () { load(true); };
    ui.actions['chg-wider'] = function () { radiusIdx = Math.min(RADII.length - 1, radiusIdx + 1); load(false); };
    ui.actions['chg-locate'] = function () {
      Eco.location.refresh().then(function () { load(false); }, function (err) {
        ui.toast(err && err.code === 1 ? Eco.location.blockedToast : 'Couldn’t get your position. Try again outdoors.', 'warn', { duration: 3600 });
      });
    };
    ui.actions['chg-use-ev'] = function () {
      var g = Eco.store.state.garage.filter(function (v) { return v.ev; })[0];
      Eco.vehicles.select(g ? g.id : 'generic-electric-car');
      ui.toast(Eco.vehicles.active().label + ' selected', 'success');
      enter();
    };
    Eco.nav.register('charging', { enter: enter, leave: leave });
  }

  Eco.charging = { navigateTo: navigateTo };
  Eco.onReady(init);
})();
