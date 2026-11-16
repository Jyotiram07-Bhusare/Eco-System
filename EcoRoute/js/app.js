/* ==========================================================================
   EcoRoute - app.js
   Application core: persisted demo store (localStorage), theme, stats
   aggregation shared by Home / History / Analytics / Profile, PWA helpers
   and the boot sequence.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

  var KEY = 'ecoroute.v1';
  var readyFns = [];

  /* ---------- Store ---------- */
  function defaults() {
    var garage = Eco.data.seedGarage.map(function (g) { return Eco.data.makeVehicle(g); });
    return {
      version: 1,
      onboarded: false, loggedIn: false,
      user: { name: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '+91 98765 43210', city: 'Greenville', color: 0, joined: new Date(Date.now() - 96 * 86400000).toISOString() },
      // moveMode: where vehicle movement comes from during a journey: 'gps' (you really move) or 'demo' (hold to drive)
      // shareLocation: save my GPS positions in the database (only used when the backend is running)
      settings: { theme: 'system', notif: { trip: true, tips: true, charging: true, weekly: false }, moveMode: 'gps', gpsScale: 1, demoScale: 10, shareLocation: true },
      garage: garage, activeVehicleId: 'veh-nexon', battery: 64,
      journeys: null, recent: ['lakeside-mall', 'tech-park', 'riverside-college'],
      goalKg: 20
    };
  }

  var store = {
    state: null,
    load: function () {
      var s = defaults();
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) {
          var saved = JSON.parse(raw);
          if (saved && saved.version === 1) {
            s = Object.assign(s, saved);
            s.settings = Object.assign(defaults().settings, saved.settings || {});
            s.settings.notif = Object.assign(defaults().settings.notif, (saved.settings || {}).notif || {});
            s.user = Object.assign(defaults().user, saved.user || {});
          }
        }
      } catch (e) { /* storage blocked: run in-memory */ }
      // seed only the very first time (null). An empty array means the user cleared their history on purpose.
      if (!Array.isArray(s.journeys)) s.journeys = Eco.data.seedJourneys(s.garage);
      this.state = s;
      this.save();
    },
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* ignore */ }
      if (Eco.api && Eco.api.touch) Eco.api.touch();          // with a backend: settings follow into the database
    },
    reset: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
    /** Replace the account data with what the server returned (GET /api/bootstrap). The database is the source of truth. */
    applyServer: function (b) {
      var s = this.state, d = defaults(), u = b.user || {}, st = b.settings || {};
      s.user = { id: u.id, name: u.name || '', email: u.email || '', phone: u.phone || '', city: u.city || '', color: u.color || 0, joined: u.joined || new Date().toISOString() };
      s.garage = (b.vehicles || []).map(function (v) {
        return Eco.data.makeVehicle({ id: v.id, type: v.type, company: v.company, model: v.model, mileage: v.mileage || undefined, battery: v.battery || undefined, range: v.range });
      });
      s.journeys = (b.journeys || []).slice().sort(function (x, y) { return new Date(y.date) - new Date(x.date); });
      s.settings = Object.assign(d.settings, {
        theme: st.theme || 'system', moveMode: st.moveMode || 'gps', gpsScale: st.gpsScale || 1, demoScale: st.demoScale || 10, shareLocation: st.shareLocation !== false
      });
      s.settings.notif = Object.assign(d.settings.notif, st.notif || {});
      s.goalKg = st.goalKg || 20;
      s.battery = st.battery == null ? 64 : st.battery;
      s.notifRead = !!st.notifRead;
      s.activeVehicleId = st.activeVehicleId || (s.garage[0] ? s.garage[0].id : null);
      if (!Array.isArray(s.recent) || !s.recent.length) {          // "Recent" destinations come from this account's history
        var seen = {};
        s.recent = [];
        s.journeys.forEach(function (j) {
          if (s.recent.length < 5 && j.toId && !seen[j.toId] && Eco.data.findPlace(j.toId)) { seen[j.toId] = 1; s.recent.push(j.toId); }
        });
      }
      Eco.data.setStations(b.stations);
      theme.apply();
      this.save();
      if (Eco.api) Eco.api.markSynced();
    },
    /** Sign-out with a backend: nothing of the account stays in this browser (the theme and the intro flag do). */
    clearUserData: function () {
      var d = defaults(), keepTheme = this.state.settings.theme;
      d.onboarded = true; d.loggedIn = false;
      d.user = { name: '', email: '', phone: '', city: '', color: 0, joined: new Date().toISOString() };
      d.garage = []; d.journeys = []; d.activeVehicleId = null; d.recent = []; d.notifRead = false;
      d.settings.theme = keepTheme;
      this.state = d;
      this.save();
    }
  };

  /* ---------- Theme ---------- */
  var theme = {
    isDark: function () {
      var p = store.state.settings.theme;
      return p === 'dark' || (p === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    },
    apply: function () {
      var dark = theme.isDark();
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', dark ? '#0F1511' : '#237B50');
    },
    set: function (pref) { store.state.settings.theme = pref; store.save(); theme.apply(); }
  };

  /* ---------- Stats (single source of truth for every dashboard number) ---------- */
  var DAY = 86400000;
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  var stats = {
    list: function () { return store.state.journeys; },
    within: function (days) {
      var from = Date.now() - days * DAY;
      return store.state.journeys.filter(function (j) { return new Date(j.date).getTime() >= from; });
    },
    totals: function (list) {
      var t = { count: list.length, km: 0, co2g: 0, savedG: 0, score: 0 };
      var w = 0;
      list.forEach(function (j) { t.km += j.distanceKm; t.co2g += j.co2g; t.savedG += j.savedG; t.score += j.ecoScore * j.distanceKm; w += j.distanceKm; });
      t.score = w ? Math.round(t.score / w) : 0;
      return t;
    },
    /** Last n days, one bucket per day (oldest first). */
    byDay: function (n) {
      var out = [], today = sod(new Date()), i, map = {};
      for (i = n - 1; i >= 0; i--) {
        var d = new Date(today.getTime() - i * DAY);
        var b = { date: d, label: Eco.ui.fmt.days[d.getDay()], key: d.getTime(), list: [] };
        map[b.key] = b; out.push(b);
      }
      store.state.journeys.forEach(function (j) { var k = sod(j.date).getTime(); if (map[k]) map[k].list.push(j); });
      return out.map(finish);
    },
    /** Last n months, one bucket per calendar month (oldest first). */
    byMonth: function (n) {
      var out = [], now = new Date(), i, map = {};
      for (i = n - 1; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var b = { date: d, label: Eco.ui.fmt.months[d.getMonth()], key: d.getFullYear() * 12 + d.getMonth(), list: [] };
        map[b.key] = b; out.push(b);
      }
      store.state.journeys.forEach(function (j) { var d = new Date(j.date), k = d.getFullYear() * 12 + d.getMonth(); if (map[k]) map[k].list.push(j); });
      return out.map(finish);
    },
    byVehicleType: function (list) {
      var map = {};
      list.forEach(function (j) {
        var m = map[j.vehicleType] || (map[j.vehicleType] = { type: j.vehicleType, km: 0, co2g: 0, count: 0 });
        m.km += j.distanceKm; m.co2g += j.co2g; m.count++;
      });
      return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.co2g - a.co2g; });
    },
    /** Carbon saved so far in the current calendar month, in kg. */
    monthSavedKg: function () {
      var now = new Date(), s = 0;
      store.state.journeys.forEach(function (j) { var d = new Date(j.date); if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) s += j.savedG; });
      return s / 1000;
    },
    level: function (savedG) {
      var kg = savedG / 1000;
      if (kg >= 60) return { name: 'Planet Guardian', next: null, pct: 100 };
      if (kg >= 30) return { name: 'Green Champion', next: 'Planet Guardian', pct: (kg - 30) / 30 * 100 };
      if (kg >= 10) return { name: 'Eco Explorer', next: 'Green Champion', pct: (kg - 10) / 20 * 100 };
      return { name: 'Seedling', next: 'Eco Explorer', pct: kg / 10 * 100 };
    }
  };
  function finish(b) {
    var t = stats.totals(b.list);
    b.km = t.km; b.co2g = t.co2g; b.savedG = t.savedG; b.score = t.score; b.count = t.count;
    return b;
  }

  /* ---------- Trip (transient planning state, shared by planner / routes / tracking) ---------- */
  var trip = { origin: null, destination: null, routes: [], selectedId: null };
  function resetTrip() { trip.origin = Eco.data.currentLocation; trip.destination = null; trip.routes = []; trip.selectedId = null; }

  /* ---------- PWA helpers ---------- */
  var pwa = {
    deferred: null,
    canInstall: function () { return !!pwa.deferred; },
    isStandalone: function () { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; },
    install: function () {
      if (!pwa.deferred) return Promise.resolve(false);
      pwa.deferred.prompt();
      return pwa.deferred.userChoice.then(function (c) { pwa.deferred = null; return c.outcome === 'accepted'; });
    }
  };
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); pwa.deferred = e;
    if (Eco.profile && Eco.profile.refreshInstall) Eco.profile.refreshInstall();
  });
  window.addEventListener('appinstalled', function () {
    pwa.deferred = null; Eco.ui.toast('EcoRoute installed', 'success');
    if (Eco.profile && Eco.profile.refreshInstall) Eco.profile.refreshInstall();
  });

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;          // service workers need http(s) / localhost
    navigator.serviceWorker.register('service-worker.js').catch(function () { /* offline support unavailable */ });
  }

  /* ---------- Boot ---------- */
  function onReady(fn) { readyFns.push(fn); }

  function boot() {
    store.load();
    resetTrip();
    theme.apply();
    Eco.api.detect();                                  // is a backend there? (the splash screen waits for the answer)
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if (store.state.settings.theme === 'system') theme.apply(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }
    Eco.ui.bindGlobal();
    Eco.icons.hydrate();
    readyFns.forEach(function (fn) { try { fn(); } catch (e) { console.error('init failed', e); } });
    Eco.nav.init();
    registerServiceWorker();
    window.addEventListener('offline', function () { Eco.ui.toast(Eco.api.authed() ? 'You are offline. Journeys are saved on this device and sent later.' : 'You are offline. EcoRoute still works with sample data.', 'warn'); });
    window.addEventListener('online', function () {
      Eco.ui.toast('Back online', 'success');
      if (Eco.auth && Eco.auth.reconnect) Eco.auth.reconnect();
    });
    Eco.auth.start();
  }

  Eco.store = store; Eco.theme = theme; Eco.stats = stats; Eco.trip = trip; Eco.resetTrip = resetTrip; Eco.pwa = pwa;
  Eco.onReady = onReady; Eco.boot = boot;
  document.addEventListener('DOMContentLoaded', boot);
})();
