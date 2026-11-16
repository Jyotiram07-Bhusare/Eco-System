/* ==========================================================================
   EcoRoute - dashboard.js
   Screen 4: Home dashboard. Greeting, your real location on a map, destination
   search, vehicle + battery, impact summary, recent journeys and an eco tip.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc, fmt = ui.fmt;
  var trip = Eco.trip;
  var map = null, search = null;

  /* ---------- avatar helper (shared with Profile) ---------- */
  var GRADIENTS = [
    ['#2F9A68', '#1A5F3E'], ['#2A9A9A', '#146A6A'], ['#3F8FE0', '#1F5BA3'], ['#8A6AE0', '#5B3FB0'], ['#E0A03A', '#B06A00']
  ];
  var avatar = {
    gradients: GRADIENTS,
    initial: function (u) { return (u.name || '?').trim().charAt(0).toUpperCase() || '?'; },
    style: function (u) { var g = GRADIENTS[(u.color || 0) % GRADIENTS.length]; return 'background:linear-gradient(145deg,' + g[0] + ',' + g[1] + ')'; }
  };
  Eco.avatar = avatar;

  function greeting() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

  /* ---------- vehicle strip ---------- */
  function renderVehicle() {
    var v = Eco.vehicles.active(), t = Eco.data.vehicleTypes[v.type], b = Eco.vehicles.battery();
    var host = $('#home-veh');
    host.innerHTML =
      Eco.vehicles.iconBox(v, 24, 'vs-ic') +
      '<div class="vs-main"><p class="eyebrow">Travelling in</p><h3>' + esc(v.label) + '</h3><p>' + esc(t.label) + ' · ' + v.gPerKm + ' g CO₂/km</p></div>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-go="vehicles">Change</button>' +
      (v.ev
        ? '<div class="vs-battery"><span class="ic">' + ui.icon('battery-charging', 20) + '</span>' +
          '<input type="range" class="range" id="home-batt" min="1" max="100" step="1" aria-label="Battery percentage">' +
          '<b id="home-batt-pct">' + b + '%</b></div>' +
          '<div id="home-batt-note"></div>'
        : '');
    if (v.ev) {
      var note = function (p) {
        $('#home-batt-pct').textContent = p + '%';
        $('#home-batt-note').innerHTML = p <= 20
          ? '<div class="bc-note" style="flex:1 0 100%;margin-top:10px">' + ui.icon('alert-triangle', 16) + '<span>Battery low (~' + Eco.calc.rangeLeft(v, p) + ' km left)</span><button type="button" class="btn btn-secondary" data-go="charging">Find chargers</button></div>'
          : '';
        Eco.icons.hydrate($('#home-batt-note'));
      };
      Eco.vehicles.bindBatterySlider($('#home-batt'), note);
      note(b);
    }
    Eco.icons.hydrate(host);
  }

  /* ---------- impact summary ---------- */
  function renderStats() {
    var list = Eco.stats.within(30), t = Eco.stats.totals(list), host = $('#home-stats');
    if (!t.count) {
      host.innerHTML = '<div class="impact-score" style="grid-column:1/-1;cursor:default"><div><h3>No journeys yet</h3><p>Take your first trip to get an Eco Score and see your CO₂ impact.</p></div></div>';
      return;
    }
    var co2 = fmt.co2(t.co2g), saved = fmt.co2(t.savedG);
    var tile = function (icon, tone, count, dec, unit, label) {
      return '<div class="stat-tile tone-' + tone + ' fade-up"><div class="st-top"><span class="st-ic">' + ui.icon(icon, 18) + '</span></div>' +
        '<div class="st-val"><span data-count="' + count + '" data-dec="' + dec + '">0</span><small>' + unit + '</small></div><div class="st-label">' + label + '</div></div>';
    };
    host.innerHTML =
      '<article class="impact-score fade-up" data-go="analytics" role="button" tabindex="0" aria-label="Eco Score ' + t.score + ' out of 100. Open analytics">' +
      ui.ring({ value: t.score, size: 80, stroke: 9, fontScale: 0.34 }) +
      '<div><p class="eyebrow" style="color:rgba(255,255,255,.8)">Eco Score</p><h3>' + Eco.calc.scoreLabel(t.score) + '</h3><p>Across ' + t.count + ' journey' + (t.count === 1 ? '' : 's') + ' in the last 30 days</p></div></article>' +
      tile('route', 'green', t.km.toFixed(1), 1, 'km', 'Total distance') +
      tile('cloud', 'amber', co2.v, co2.u === 'kg' ? (t.co2g >= 10000 ? 1 : 2) : 0, co2.u + ' CO₂', 'CO₂ emitted') +
      tile('leaf', 'green', saved.v, saved.u === 'kg' ? (t.savedG >= 10000 ? 1 : 2) : 0, saved.u + ' CO₂', 'Carbon saved') +
      tile('route', 'blue', t.count, 0, '', 'Journeys');
    $$('[data-count]', host).forEach(function (el) { ui.countUp(el, parseFloat(el.getAttribute('data-count')), { decimals: +el.getAttribute('data-dec') }); });
    // the Journeys tile icon should read as a count, not a route
    var last = $$('.stat-tile .st-ic', host).pop(); if (last) last.innerHTML = ui.icon('history', 18);
  }

  function renderRecent() {
    var list = Eco.store.state.journeys.slice(0, 3), host = $('#home-recent');
    host.innerHTML = list.length ? list.map(function (j, i) { return Eco.analytics.journeyRow(j, i); }).join('')
      : ui.empty('route', 'No journeys yet', 'Search a destination above to plan your first eco-friendly trip.');
    Eco.icons.hydrate(host);
  }

  function renderTip() {
    var tip = Eco.data.ecoTips[Math.floor(Math.random() * Eco.data.ecoTips.length)];
    $('#home-tip').innerHTML = '<span class="ic">' + ui.icon('sparkles', 20) + '</span><div><b>Eco tip</b><p>' + esc(tip) + '</p></div>';
  }

  /* ---------- destination ---------- */
  function renderDestination() {
    var d = trip.destination, ch = $('#home-chosen');
    search.set(d);
    $('#home-search-clear').classList.toggle('hidden', !d);
    if (!d) { ch.classList.add('hidden'); ch.innerHTML = ''; return; }
    ch.classList.remove('hidden');
    ch.innerHTML = '<span class="s-ic">' + ui.icon(d.icon, 18) + '</span><span class="s-main"><b>' + esc(d.name) + '</b><small>' + esc(d.area) + ' · about ' + Eco.routes.distLabel(d) + ' away</small></span>' +
      '<span class="badge badge-green">' + ui.icon('check', 13) + 'Selected</span>';
    Eco.icons.hydrate(ch);
  }

  /* ---------- your real location (Eco.location) ---------- */
  var locOff = null, locTick = 0;

  function renderLocation() {
    var L = Eco.location.state, f = L.fix, loc = Eco.location;
    var name = $('#home-loc-name'), sub = $('#home-loc-sub'), coords = $('#home-loc-coords'), pill = $('#home-loc-pill');
    if (!name) return;
    var pillText = '', pillCls = 'live-pill hidden';
    if (f && L.status === 'ok') {
      var age = Date.now() - f.ts, live = age < 30000;
      var addr = loc.label();                                      // null when the lookup is unavailable or history is off
      name.textContent = addr || loc.coordText(f);
      var parts = [];
      if (f.acc != null) parts.push(f.acc > 200 ? 'Approximate · ' + loc.accText(f.acc) : 'Accuracy ' + loc.accText(f.acc));
      parts.push('updated ' + loc.agoText(f.ts));
      sub.textContent = parts.join(' · ') + (f.acc != null && f.acc > 200 ? '. A phone with GPS is more precise.' : '');
      var saved = Eco.api.authed() && Eco.store.state.settings.shareLocation !== false;
      var bits = [];
      if (addr) bits.push(loc.coordText(f));
      if (Eco.api.authed()) bits.push(saved ? (L.stored ? 'saved to your database' : 'saving…') : 'not saved (history is off)');
      else bits.push('address lookup needs the EcoRoute server');
      coords.textContent = bits.join(' · ');
      pillText = live ? 'Live' : 'Last known'; pillCls = 'live-pill' + (live ? '' : ' stale') + (f.acc != null && f.acc > 200 ? ' warn' : '');
      if (live && f.acc != null && f.acc > 200) pillText = 'Approx.';
    } else if (L.status === 'denied') {
      name.textContent = 'Location is blocked';
      sub.textContent = 'Allow location for this site in your browser settings, then tap refresh.';
      coords.textContent = '';
    } else if (L.status === 'unavailable') {
      name.textContent = 'Location isn’t available';
      sub.textContent = L.error || 'This device cannot share its location.';
      coords.textContent = '';
    } else {
      name.textContent = 'Finding your location…';
      sub.textContent = L.error || 'Allow location access if your browser asks.';
      coords.textContent = '';
    }
    pill.textContent = pillText; pill.className = pillCls;
  }

  /** The little map follows the device: a blue dot on the real map. */
  var mapFix = null;
  function paintHomeMap(force) {
    if (!map) return;
    var f = Eco.location.state.fix;
    if (!f) { if (force) map.setMarkers([]); return; }
    if (!force && mapFix && Eco.geo.haversine(mapFix, f) < 4) return;
    mapFix = { lat: f.lat, lon: f.lon };
    map.setMarkers([{ id: 'current', type: 'current', lat: f.lat, lon: f.lon }]);
    map.setView({ lat: f.lat, lon: f.lon, zoom: f.acc != null && f.acc > 600 ? 14 : 16 }, force ? 0 : 500);
  }

  function refreshLocation(btn) {
    var svg = $('svg', btn);
    if (svg) svg.classList.add('spin');
    btn.disabled = true;
    var done = function () { if (svg) svg.classList.remove('spin'); btn.disabled = false; renderLocation(); };
    Eco.location.refresh().then(function () {
      done(); ui.toast('Location updated', 'success', { duration: 1600 });
    }, function (err) {
      done();
      if (err && err.code === 1) ui.toast(Eco.location.blockedToast, 'warn', { duration: 4200 });
      else ui.toast('Couldn’t get a position. Try again outdoors or near a window.', 'warn', { duration: 3600 });
    });
  }

  function startLocation() {
    Eco.location.retain('home');
    if (!locOff) locOff = Eco.location.onChange(function () { if (Eco.nav.current() === 'home') { renderLocation(); paintHomeMap(false); } });
    clearInterval(locTick);
    locTick = setInterval(function () { if (Eco.nav.current() === 'home') renderLocation(); }, 1000);     // the "updated 5 s ago" text keeps counting
    renderLocation();
  }
  function stopLocation() {
    clearInterval(locTick); locTick = 0;
    if (locOff) { locOff(); locOff = null; }
    Eco.location.release('home');
  }

  function openNotifications() {
    var items = Eco.data.notifications, s = Eco.store.state;
    ui.sheet({
      title: 'Notifications',
      html: items.map(function (n) {
        return '<div class="notif' + (!s.notifRead && n.unread ? ' unread' : '') + '"><span class="n-ic">' + ui.icon(n.icon, 20) + '</span><div class="n-main"><b>' + esc(n.title) + '</b><p>' + esc(n.text) + '</p><small>' + esc(n.time) + '</small></div></div>';
      }).join('') + '<p class="fine center" style="margin-top:10px">Sample notifications for demonstration. Manage alerts in Profile.</p>',
      onClose: function () { s.notifRead = true; Eco.store.save(); $('#home-bell-dot').classList.add('hidden'); }
    });
  }

  /* ---------- screen lifecycle ---------- */
  function enter() {
    var s = Eco.store.state, u = s.user;
    $('#home-greet').textContent = greeting();
    $('#home-name').textContent = u.name.split(' ')[0];
    var av = $('#home-avatar'); av.textContent = avatar.initial(u); av.setAttribute('style', avatar.style(u));
    $('#home-bell-dot').classList.toggle('hidden', !!s.notifRead);
    startLocation();

    if (!map) map = Eco.Map.create($('#home-map'), { interactive: false, label: 'Map showing where you are', center: Eco.location.last() || undefined, zoom: 16 });
    else map.resize();
    paintHomeMap(true);

    renderVehicle(); renderStats(); renderRecent(); renderTip(); renderDestination();
    Eco.icons.hydrate($('#screen-home'));
  }

  function init() {
    search = Eco.routes.attachSearch({
      input: $('#home-search'), list: $('#home-suggest'), clearBtn: $('#home-search-clear'),
      get: function () { return trip.destination; },
      onSelect: function (p) { trip.destination = p; trip.routes = []; trip.selectedId = null; renderDestination(); ui.vibrate(10); },
      onClear: function () { trip.destination = null; trip.routes = []; renderDestination(); }
    });
    $('#home-recent').addEventListener('click', function (e) {
      var r = e.target.closest('[data-jid]'); if (r) Eco.tracking.openSummary(r.getAttribute('data-jid'));
    });
    $('#home-stats').addEventListener('keydown', function (e) {
      var c = e.target.closest('[data-go]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); Eco.nav.go(c.getAttribute('data-go')); }
    });
    ui.actions['find-route'] = Eco.routes.start;
    ui.actions['refresh-location'] = refreshLocation;
    ui.actions['open-notifications'] = openNotifications;
    Eco.nav.register('home', { enter: enter, leave: function () { search.close(); stopLocation(); } });
  }

  Eco.dashboard = { render: enter };
  Eco.onReady(init);
})();
