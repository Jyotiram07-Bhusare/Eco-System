/* ==========================================================================
   EcoRoute - charging.js
   Screen 10: EV Charging Station Finder.
   Stations, ports and availability are clearly-labelled SAMPLE DATA.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc, fmt = ui.fmt;
  var trip = Eco.trip;

  var CONNECTORS = ['CCS2', 'Type 2', 'CHAdeMO', '3-Pin AC'];
  var cmap = null, selectedId = null, updatedAt = new Date();
  var filters = { avail: false, fast: false, reach: false, conn: [] };

  function cur() { return Eco.data.currentLocation; }
  function status(s) { return s.free === 0 ? 'full' : s.free / s.total <= 0.34 ? 'busy' : 'available'; }
  function statusText(s) { return { available: 'Available', busy: 'Busy', full: 'Full' }[status(s)]; }
  function dist(s) { return Eco.calc.mapKm(cur(), s); }

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
    return Eco.data.stations.filter(function (s) {
      if (filters.avail && s.free === 0) return false;
      if (filters.fast && s.kw < 50) return false;
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
        '<div class="bc-main"><h3>Showing sample stations</h3><p class="bc-sub">' + esc(v.label) + ' isn’t electric, so range estimates are hidden.</p></div></div>' +
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
      ui.toast(n === 100 ? 'Battery set to full (simulated charge)' : 'Battery set to ' + n + '%', 'success', { duration: 1600 });
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
    var inRange = Eco.data.stations.filter(function (s) { return dist(s) <= Eco.calc.rangeLeft(v, p) * 0.9; }).length;
    var note = $('#bc-note');
    if (p <= 20) note.innerHTML = '<div class="bc-note">' + ui.icon('alert-triangle', 16) + '<span>Low battery. ' + (inRange ? inRange + ' station' + (inRange === 1 ? '' : 's') + ' within range.' : 'No stations within range.') + '</span></div>';
    else note.innerHTML = '<div class="bc-note info">' + ui.icon('check-circle', 16) + '<span>' + inRange + ' of ' + Eco.data.stations.length + ' stations within comfortable range.</span></div>';
    Eco.icons.hydrate(note);
  }

  /* ---------- filter chips ---------- */
  function renderFilters() {
    var v = vehicle();
    var none = !filters.avail && !filters.fast && !filters.reach && !filters.conn.length;
    var chips = [{ k: 'all', t: 'All', on: none }, { k: 'avail', t: 'Available', on: filters.avail, icon: 'check-circle' }, { k: 'fast', t: 'Fast 50 kW+', on: filters.fast, icon: 'zap' }];
    if (v.ev) chips.push({ k: 'reach', t: 'In range', on: filters.reach, icon: 'battery-charging' });
    CONNECTORS.forEach(function (c) { chips.push({ k: 'c:' + c, t: c, on: filters.conn.indexOf(c) > -1 }); });
    $('#chg-filters').innerHTML = chips.map(function (c) {
      return '<button type="button" class="chip' + (c.on ? ' active' : '') + '" data-f="' + esc(c.k) + '" aria-pressed="' + c.on + '">' + (c.icon ? ui.icon(c.icon, 16) : '') + esc(c.t) + '</button>';
    }).join('');
  }

  function toggleFilter(k) {
    if (k === 'all') { filters = { avail: false, fast: false, reach: false, conn: [] }; }
    else if (k.indexOf('c:') === 0) {
      var c = k.slice(2), i = filters.conn.indexOf(c);
      if (i > -1) filters.conn.splice(i, 1); else filters.conn.push(c);
    } else filters[k] = !filters[k];
    renderFilters(); renderList(); renderMarkers(true);
  }

  /* ---------- station list ---------- */
  function stationCard(s, i) {
    var st = status(s), v = vehicle(), sel = s.id === selectedId;
    var reach = '';
    if (v.ev) {
      var ab = arriveBattery(s);
      reach = reachable(s)
        ? '<span class="st-reach">' + ui.icon('check-circle', 14) + 'Arrive with ~' + Math.max(0, ab) + '%</span>'
        : '<span class="st-reach no">' + ui.icon('alert-triangle', 14) + 'Out of range at ' + Eco.vehicles.battery() + '%</span>';
    }
    var meter = ''; var n;
    for (n = 0; n < s.total; n++) meter += '<span class="' + (n < s.free ? 'on' : '') + '"></span>';
    return '<article class="station fade-up' + (sel ? ' selected' : '') + '" style="--d:' + Math.min(i, 8) * 0.04 + 's" data-sid="' + s.id + '" id="st-' + s.id + '">' +
      '<div class="st-head"><span class="st-ic ' + st + '">' + ui.icon('zap', 22) + '</span>' +
      '<div class="st-title"><h3>' + esc(s.name) + '</h3><p>' + ui.icon('map-pin', 13) + fmt.km(dist(s)) + ' km · ' + esc(s.area) + '</p></div>' +
      '<span class="avail avail-' + st + '"><i></i>' + s.free + '/' + s.total + ' free</span></div>' +
      '<div class="st-tags"><span class="tag tag-power">' + ui.icon('zap', 13) + s.kw + ' kW' + (s.kw >= 50 ? ' · DC fast' : ' · AC') + '</span>' +
      s.connectors.map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') + '</div>' +
      '<div class="st-meter ' + st + '" aria-label="' + s.free + ' of ' + s.total + ' ports free">' + meter + '</div>' +
      '<div class="st-foot"><div><small>' + statusText(s) + ' · sample data</small><br>' + reach + '</div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-nav-st="' + s.id + '">' + ui.icon('navigation', 16) + 'Navigate</button></div></article>';
  }

  function renderList() {
    var list = filtered();
    $('#chg-count').textContent = list.length + ' of ' + Eco.data.stations.length + ' stations · nearest first · updated ' + fmt.clock(updatedAt);
    $('#chg-list').innerHTML = list.length ? list.map(stationCard).join('') :
      ui.empty('zap-off', 'No stations match', 'Try removing a filter or raising your battery level.', '<button type="button" class="btn btn-secondary" data-f="all">Clear filters</button>');
    Eco.icons.hydrate($('#chg-list'));
  }

  /* ---------- map ---------- */
  function renderMarkers(refit) {
    if (!cmap) return;
    var ids = filtered().map(function (s) { return s.id; });
    var markers = Eco.data.stations.filter(function (s) { return ids.indexOf(s.id) > -1; }).map(function (s) {
      return { id: s.id, type: 'station', x: s.x, y: s.y, status: status(s), selected: s.id === selectedId, label: s.id === selectedId ? s.name : '' };
    });
    markers.push({ id: 'current', type: 'current', x: cur().x, y: cur().y });
    cmap.setMarkers(markers);
    if (refit) {
      var pts = Eco.data.stations.filter(function (s) { return ids.indexOf(s.id) > -1; }).slice(0, 12).map(function (s) { return { x: s.x, y: s.y }; }).concat([cur()]);
      cmap.fit(pts, { pad: [36, 36, 36, 36], maxZoom: 0.8, animate: 400 });
    }
  }

  function select(id, fromMap) {
    selectedId = id;
    var s = Eco.data.findPlace(id);
    $$('#chg-list .station').forEach(function (c) { c.classList.toggle('selected', c.getAttribute('data-sid') === id); });
    renderMarkers(false);
    if (s && cmap) cmap.setView({ cx: s.x, cy: s.y, s: Math.max(cmap.getView().s, 0.65) }, 450);
    if (fromMap) { var card = $('#st-' + id); if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    else if (s) { var m = $('#charging-map'); if (m && m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function navigateTo(id) {
    var s = Eco.data.findPlace(id); if (!s) return;
    trip.destination = s; trip.routes = []; trip.selectedId = null;
    Eco.routes.addRecent(s.id);
    Eco.routes.start();
  }

  function refresh(btn) {
    var repaint = function () {
      updatedAt = new Date();
      renderList(); renderMarkers(false);
      ui.toast('Availability refreshed (sample data)', 'info');
    };
    if (Eco.api.authed()) {                 // the stations live in the database; the server moves the sample availability
      var req = Eco.api.post('/stations/refresh').then(function (list) { Eco.data.setStations(list); repaint(); });
      if (btn && btn.tagName === 'BUTTON') { btn.disabled = true; req.then(function () { btn.disabled = false; }, function () { btn.disabled = false; }); }
      req.catch(function (err) { ui.toast(Eco.api.errorText(err), 'warn', { duration: 3600 }); });
      return;
    }
    Eco.data.stations.forEach(function (s) {
      var d = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
      s.free = Math.max(0, Math.min(s.total, s.free + d));
    });
    repaint();
  }

  function enter() {
    renderBattery(); renderFilters(); renderList();
    if (!cmap) {
      cmap = Eco.Map.create($('#charging-map'), {
        label: 'Simulated map of nearby EV charging stations',
        onMarkerClick: function (id) { if (id !== 'current') select(id, true); },
        onLocate: function () { cmap.setView({ cx: cur().x, cy: cur().y, s: 0.8 }, 450); }
      });
      renderMarkers(true);
    } else { cmap.resize(); renderMarkers(true); }
  }

  function init() {
    $('#chg-filters').addEventListener('click', function (e) { var c = e.target.closest('[data-f]'); if (c) toggleFilter(c.getAttribute('data-f')); });
    $('#chg-list').addEventListener('click', function (e) {
      var f = e.target.closest('[data-f]'); if (f) { toggleFilter(f.getAttribute('data-f')); return; }
      var n = e.target.closest('[data-nav-st]'); if (n) { navigateTo(n.getAttribute('data-nav-st')); return; }
      var card = e.target.closest('[data-sid]'); if (card) select(card.getAttribute('data-sid'), false);
    });
    ui.actions['charging-refresh'] = refresh;
    ui.actions['chg-use-ev'] = function () {
      var g = Eco.store.state.garage.filter(function (v) { return v.ev; })[0];
      Eco.vehicles.select(g ? g.id : 'generic-electric-car');
      ui.toast(Eco.vehicles.active().label + ' selected', 'success');
      enter();
    };
    Eco.nav.register('charging', { enter: enter });
  }

  Eco.charging = { navigateTo: navigateTo };
  Eco.onReady(init);
})();
