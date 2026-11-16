/* ==========================================================================
   EcoRoute - api.js
   The connection to the EcoRoute backend (Java / Spring Boot + MySQL).

   * The backend also serves this app, so every call is a same-origin "api/..." request:
     no CORS, and http://localhost counts as a secure context for the location sensor.
   * With no backend (file:// or a plain static web server) Eco.api.available is false and the
     app runs exactly as before on its local sample data.
   * Eco.api also keeps the settings in step with the database (debounced) and holds journeys
     that could not be saved because the server was unreachable (outbox), so nothing is lost.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

  var C = window.ECOROUTE_CONFIG || {};
  var TOKEN_KEY = 'ecoroute.token';
  var SERVER_KEY = 'ecoroute.server';
  var OUTBOX_KEY = 'ecoroute.outbox';

  var api = {
    available: null,        // null = not checked yet, true = backend found, false = static mode
    token: null,            // login token (kept in localStorage, sent as a Bearer header)
    ready: false,           // true once this page has loaded the account's data from the server
    offline: false,         // signed in, but the server could not be reached on start-up
    info: null,             // /api/health response
    onUnauthorized: null    // set by auth.js: called when the server rejects the token
  };

  /* ---------- errors ---------- */
  function ApiError(status, message, fields, network, code) {
    this.name = 'ApiError';
    this.status = status;
    this.message = message;
    this.fields = fields || {};
    this.network = !!network;
    this.code = code || '';
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;
  api.ApiError = ApiError;

  /* ---------- which server ---------- */
  // '' = the server that delivered this page (the backend serves the app), else the address from config.js or the one
  // the user typed on the login screen ("Use my own server"). The Android app has no server of its own.
  function readServer() { try { return localStorage.getItem(SERVER_KEY) || ''; } catch (e) { return ''; } }
  function trimSlash(u) { return String(u).trim().replace(/\/+$/, ''); }
  function makeBase() { var u = trimSlash(C.serverUrl || readServer() || ''); return u ? u + '/' : ''; }
  api.base = makeBase();
  api.server = function () { return api.base ? trimSlash(api.base) : ''; };
  /** Remember (or, with '', forget) a server address. The page has to reload to use it. */
  api.setServer = function (url) {
    try { if (url) localStorage.setItem(SERVER_KEY, trimSlash(url)); else localStorage.removeItem(SERVER_KEY); } catch (e) { /* storage blocked */ }
    api.base = makeBase();
  };

  /* ---------- token ---------- */
  function readToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  api.token = readToken();
  api.setToken = function (t) { api.token = t || null; try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage blocked: the token lives in memory only */ } };
  api.clearToken = function () { api.setToken(null); };
  api.authed = function () { return !!(api.available && api.token); };
  /** Changes can be saved: always in the local demo, and with a backend once the account has been loaded from it. */
  api.canWrite = function () { return !api.authed() || api.ready; };
  api.errorText = function (err) {
    return err && err.network ? 'Can’t reach the EcoRoute server. Please try again.' : (err && err.message) || 'Something went wrong.';
  };

  /* ---------- request ---------- */
  function parse(text) { try { return text ? JSON.parse(text) : null; } catch (e) { return null; } }

  /**
   * request(method, path, body?, { anon, timeout, keepalive, soft401 })  ->  Promise<json | null>
   * Rejects with an ApiError ({ status, message, fields, network }).
   */
  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    var hasBody = body !== undefined && body !== null;
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (api.token && !opts.anon) headers.Authorization = 'Bearer ' + api.token;
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 15000) : 0;

    return fetch(api.base + 'api' + path, {
      method: method, headers: headers, body: hasBody ? JSON.stringify(body) : undefined,
      cache: 'no-store', credentials: 'same-origin', keepalive: !!opts.keepalive, signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (text) {
        var data = parse(text);
        if (res.ok) return data;
        throw new ApiError(res.status, (data && data.message) || ('The server answered with an error (' + res.status + ').'), data && data.fields, false, data && data.error);
      });
    }, function () {
      clearTimeout(timer);
      throw new ApiError(0, 'Can’t reach the EcoRoute server.', null, true, 'network');
    }).catch(function (err) {
      // 401 = the server no longer accepts our token. (soft401: the caller deals with a 401 itself, e.g. logout)
      if (err && err.status === 401 && api.token && !opts.anon && !opts.soft401 && api.onUnauthorized) api.onUnauthorized(err);
      throw err;
    });
  }
  api.request = request;
  api.get = function (path, o) { return request('GET', path, undefined, o); };
  api.post = function (path, body, o) { return request('POST', path, body === undefined ? {} : body, o); };
  api.put = function (path, body, o) { return request('PUT', path, body, o); };
  api.del = function (path, body, o) { return request('DELETE', path, body, o); };

  /** Is there a backend behind this page? Resolves true / false (never rejects). Asked once; repeat calls share the answer. */
  var detecting = null;
  api.detect = function (again) {
    if (detecting && !again) return detecting;
    // no network protocol, or the Android app with no server chosen: there is nothing to ask
    if (!/^https?:$/.test(location.protocol) || (C.app && !api.base)) { api.available = false; return (detecting = Promise.resolve(false)); }
    detecting = request('GET', '/health', undefined, { anon: true, timeout: 3500 }).then(function (h) {
      api.info = h;
      api.available = !!(h && h.app === 'EcoRoute');
      return api.available;
    }, function () { api.available = false; return false; });
    return detecting;
  };

  api.clientRef = function () {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  };

  /* ---------- settings: keep the database in step with the app ---------- */
  var lastSynced = null, syncTimer = 0, syncing = false;

  function snapshot() {
    var s = Eco.store.state, st = s.settings, n = st.notif || {};
    return {
      theme: st.theme,
      notif: { trip: !!n.trip, tips: !!n.tips, charging: !!n.charging, weekly: !!n.weekly },
      moveMode: st.moveMode, gpsScale: st.gpsScale, demoScale: st.demoScale,
      goalKg: s.goalKg, battery: s.battery, activeVehicleId: s.activeVehicleId, notifRead: !!s.notifRead,
      shareLocation: st.shareLocation !== false
    };
  }
  /** Call after the app state was replaced from the server: what the server holds is now the baseline. */
  api.markSynced = function () { lastSynced = snapshot(); };

  /** Called by Eco.store.save(). Sends only what changed, a moment after the last change. */
  api.touch = function () {
    if (!api.authed() || !api.ready) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { flushSettings(false); }, 600);
  };

  function flushSettings(keepalive) {
    clearTimeout(syncTimer);
    if (!api.authed() || !api.ready) return;
    if (syncing) { syncTimer = setTimeout(function () { flushSettings(false); }, 400); return; }
    var now = snapshot(), patch = {}, changed = false;
    Object.keys(now).forEach(function (k) {
      if (!lastSynced || JSON.stringify(now[k]) !== JSON.stringify(lastSynced[k])) { patch[k] = now[k]; changed = true; }
    });
    if (!changed) return;
    syncing = true;
    request('PUT', '/me/settings', patch, { keepalive: keepalive }).then(function () {
      syncing = false; lastSynced = now;
      if (JSON.stringify(snapshot()) !== JSON.stringify(now)) api.touch();       // changed again while saving
    }, function (err) {
      syncing = false;
      if (err.network) syncTimer = setTimeout(function () { flushSettings(false); }, 15000);      // try again later
      else if (err.status !== 401) { lastSynced = now; if (window.console) console.warn('Settings were not accepted by the server:', err.message); }
    });
  }
  api.flushSettings = function () { flushSettings(true); };

  document.addEventListener('visibilitychange', function () { if (document.hidden) flushSettings(true); });
  window.addEventListener('pagehide', function () { flushSettings(true); });

  /* ---------- journeys: save now, or keep in an outbox until the server is reachable ---------- */
  function readBox() { try { var l = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function writeBox(list) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-50))); } catch (e) { /* ignore */ } }
  function uid() { var u = Eco.store.state.user; return u && u.id ? u.id : 0; }
  var retryTimer = 0;

  api.pendingJourneys = function () { return readBox().filter(function (e) { return e.uid === uid(); }).length; };
  /** Forget the unsent journeys of the signed-in account (used when the account itself is deleted). */
  api.clearOutbox = function () { var me = uid(); writeBox(readBox().filter(function (e) { return e.uid !== me; })); };

  /** Keep a journey for an account (default: the signed-in one) until it can be sent. It is only ever sent by that account. */
  function queueJourney(payload, owner) {
    var l = readBox();
    l.push({ uid: owner == null ? uid() : owner, payload: payload });
    writeBox(l);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { api.flushOutbox(); }, 30000);       // keep trying in the background
  }
  api.queueJourney = queueJourney;

  /**
   * A journey the server now has: copy its fields (id, derived numbers...) onto the copy we already show, so every
   * place holding that object stays valid. When the list was replaced meanwhile, the journey is added instead.
   */
  api.adoptJourney = function (dto, clientRef) {
    if (!api.authed()) return dto;                   // signed out meanwhile: the server has it, the next sign-in will list it
    var list = Eco.store.state.journeys, i, j;
    for (i = 0; i < list.length; i++) {
      if (clientRef && list[i].clientRef === clientRef) {
        j = list[i];
        var localId = j.id;
        Object.assign(j, dto);
        j.localId = localId;                         // a list drawn a moment ago may still hold the old id
        delete j.sync; delete j.clientRef;
        Eco.store.save();
        return j;
      }
    }
    for (i = 0; i < list.length; i++) if (list[i].id === dto.id) return list[i];
    list.push(dto);
    list.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    Eco.store.save();
    return dto;
  };

  /**
   * Save a finished journey. Resolves with { state: 'saved', dto } | { state: 'queued', reason } | { state: 'rejected', message }.
   * A journey the server could not be asked about (offline, server error) or that arrived after the login session ended
   * (401) is kept for `owner` (the account that made it) and sent later; the server ignores a clientRef it has already
   * seen, so a retry never creates a duplicate. A 401 signs the app out before this handler runs, so the owner has to be
   * passed in by the caller instead of being looked up here.
   */
  api.saveJourney = function (payload, owner) {
    return request('POST', '/journeys', payload).then(function (dto) {
      return { state: 'saved', dto: dto };
    }, function (err) {
      if (err.status === 401) { queueJourney(payload, owner); return { state: 'queued', reason: 'auth' }; }
      if (err.network || err.status >= 500) { queueJourney(payload, owner); return { state: 'queued', reason: 'network' }; }
      return { state: 'rejected', message: err.message };
    });
  };

  /**
   * Send queued journeys. Resolves with the number saved (never rejects).
   * api.beforeOutbox (set by location.js) runs first: the server links a journey to its recorded GPS points
   * when the journey is created, so those points have to be there before the journey is.
   */
  api.beforeOutbox = null;
  var flushing = null;
  api.flushOutbox = function () {
    if (!api.authed()) return Promise.resolve(0);
    if (flushing) return flushing;                                   // one run at a time (reconnect + the retry timer can coincide)
    var mine = readBox().filter(function (e) { return e.uid === uid(); });
    if (!mine.length) return Promise.resolve(0);
    var saved = 0, retry = false;
    function drop(entry) { writeBox(readBox().filter(function (e) { return !(e.uid === entry.uid && e.payload.clientRef === entry.payload.clientRef); })); }
    var before = api.beforeOutbox ? Promise.resolve().then(api.beforeOutbox).catch(function () { /* send the journeys anyway */ }) : Promise.resolve();
    flushing = mine.reduce(function (p, entry) {
      return p.then(function () {
        if (retry) return;
        return request('POST', '/journeys', entry.payload).then(function (dto) {
          saved++; drop(entry);
          var j = api.adoptJourney(dto, entry.payload.clientRef);
          if (api.onJourneySynced) api.onJourneySynced(j);
        }, function (err) {
          if (err.network || err.status === 401 || err.status >= 500) { retry = true; return; }     // later
          drop(entry);                                                                              // refused for good
        });
      });
    }, before).then(function () {
      flushing = null;
      if (retry) { clearTimeout(retryTimer); retryTimer = setTimeout(function () { api.flushOutbox(); }, 30000); }
      return saved;
    }, function (e) { flushing = null; throw e; });
    return flushing;
  };

  api.onJourneySynced = null;     // set by tracking.js: refreshes the summary screen when a queued journey finally arrives

  Eco.api = api;
})();
