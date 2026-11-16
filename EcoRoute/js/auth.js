/* ==========================================================================
   EcoRoute - auth.js
   Screens 1-3: Splash, Onboarding, Login / Register (+ Forgot password).
   Also exports Eco.forms, the small validation helper reused by other forms.

   With the EcoRoute backend running, accounts live in the MySQL database: passwords are
   hashed (BCrypt) on the server and the browser only keeps a login token. Without a
   backend the screens work as a local demo (nothing is stored or sent anywhere).
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* =====================================================================
     Eco.forms : tiny validation helper
     ===================================================================== */
  var forms = {
    EMAIL_RE: EMAIL_RE,
    setError: function (field, msg) {
      if (!field) return;
      field.classList.toggle('invalid', !!msg);
      var p = $('.field-error', field); if (p) p.textContent = msg || '';
      var input = $('input, select', field);
      if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    },
    /** rules: { fieldName: function(value, allValues) -> '' | 'error message' } */
    validate: function (form, rules) {
      var values = {}, ok = true, firstBad = null;
      $$('[data-field]', form).forEach(function (f) {
        var input = $('input, select', f);
        if (input && !f.classList.contains('hidden')) values[f.getAttribute('data-field')] = input.value.trim ? input.value.trim() : input.value;
      });
      $$('[data-field]', form).forEach(function (f) {
        var name = f.getAttribute('data-field');
        if (f.classList.contains('hidden') || !rules[name]) { forms.setError(f, ''); return; }
        var msg = rules[name](values[name], values);
        forms.setError(f, msg);
        if (msg) { ok = false; if (!firstBad) firstBad = f; }
      });
      if (firstBad) {
        firstBad.classList.remove('shake'); void firstBad.offsetWidth; firstBad.classList.add('shake');
        var inp = $('input, select', firstBad); if (inp) inp.focus();
        ui.vibrate(25);
      }
      return { ok: ok, values: values };
    },
    /** Show the server's per-field messages (ApiError.fields) next to their fields. Returns true when one was shown. */
    applyServer: function (form, err) {
      var first = null;
      $$('[data-field]', form).forEach(function (f) {
        var msg = err && err.fields && err.fields[f.getAttribute('data-field')];
        if (msg) { forms.setError(f, msg); if (!first) first = f; }
      });
      if (first) {
        first.classList.remove('shake'); void first.offsetWidth; first.classList.add('shake');
        var inp = $('input, select', first); if (inp) inp.focus();
        ui.vibrate(25);
      }
      return !!first;
    },
    /** Re-validate a field as the user edits it (only after the first failed submit). */
    live: function (form, rules) {
      form.addEventListener('input', function (e) {
        var f = e.target.closest('[data-field]');
        if (!f || !f.classList.contains('invalid')) return;
        var name = f.getAttribute('data-field');
        var all = {}; $$('[data-field]', form).forEach(function (x) { var i = $('input, select', x); if (i) all[x.getAttribute('data-field')] = i.value.trim(); });
        if (rules[name]) forms.setError(f, rules[name](all[name], all));
      });
    }
  };
  Eco.forms = forms;

  var DEMO_EMAIL = 'alex.morgan@example.com', DEMO_PASSWORD = 'Demo@1234';      // the demo account the backend creates
  function noop() { /* ignore */ }

  /** Local demo only: show a spinner on a button, then run fn (simulates a network round-trip). */
  function simulate(btn, busyText, fn, ms) {
    if (!btn) { fn(); return; }
    var html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin" style="display:inline-flex">' + ui.icon('refresh', 18) + '</span> ' + ui.esc(busyText);
    setTimeout(function () { btn.disabled = false; btn.innerHTML = html; fn(); }, ms || 750);
  }

  var busy = ui.busy;

  /* =====================================================================
     1. Splash
     ===================================================================== */
  function start() {
    var splash = new Promise(function (resolve) { setTimeout(resolve, 2700); });
    Promise.all([splash, Eco.api.detect()]).then(function (r) { route(r[1]); });
  }

  /** After the splash: no backend = the local demo; backend = sign in (or pick the session up again). */
  function route(hasApi) {
    var s = Eco.store.state;
    paintAuthNote(hasApi);
    if (!hasApi) {
      // Signed in to a backend that is not answering right now (stopped, or no network): stay in the app with the
      // last saved data instead of dropping into the local demo, where edits would never reach the database.
      if (Eco.api.token && s.loggedIn && s.user && s.user.id) { goOffline(); return; }
      if (s.loggedIn) Eco.nav.go('home', { replace: true });
      else if (s.onboarded) Eco.nav.go('auth', { replace: true });
      else Eco.nav.go('onboarding', { replace: true });
      return;
    }
    if (!Eco.api.token) {                                   // nobody is signed in (a local-demo flag from before does not count)
      s.loggedIn = false; Eco.store.save();
      Eco.nav.go(s.onboarded ? 'auth' : 'onboarding', { replace: true });
      return;
    }
    resume();
  }

  function paintAuthNote(hasApi) {
    var n = $('#auth-note'), srv = Eco.api.server();
    if (n) n.textContent = hasApi
      ? (srv ? 'Connected to ' + srv.replace(/^https?:\/\//, '') + '. Your account is saved in that server’s database; passwords are stored hashed.'
        : 'Your account is saved in the EcoRoute database (MySQL) on this computer. Passwords are stored hashed.')
      : 'Local mode: your profile and journeys stay on this device. Nothing is sent to an EcoRoute server.';
    var link = $('#auth-server-link');
    if (link) link.classList.toggle('hidden', !!(hasApi && !srv));     // when the backend itself delivered the app there is nothing to choose
  }

  /** "Use my own server": point the app at an EcoRoute backend (Java + MySQL). Tested before it is saved. */
  function serverSheet() {
    var cur = Eco.api.server();
    ui.sheet({
      title: 'Server',
      html:
        '<p class="muted" style="margin-bottom:14px">By default EcoRoute keeps your profile and journeys on this device. If you run the EcoRoute backend (Java + MySQL), enter its address to keep your account and journeys in its database.</p>' +
        '<form id="form-server" novalidate><div class="field" data-field="url"><label for="srv-url">Server address</label>' +
        '<div class="input-wrap"><i data-icon="at-sign"></i><input id="srv-url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" placeholder="https://your-server.example.com" value="' + ui.esc(cur) + '"></div>' +
        '<p class="field-error" role="alert"></p></div>' +
        '<div class="sheet-actions">' + (cur ? '<button type="button" class="btn btn-secondary btn-lg" id="srv-clear">This device only</button>' : '<button type="button" class="btn btn-secondary btn-lg" data-sheet-close>Cancel</button>') +
        '<button type="submit" class="btn btn-primary btn-lg">Connect</button></div></form>',
      onMount: function (body) {
        var form = $('#form-server', body), clear = $('#srv-clear', body);
        if (clear) clear.addEventListener('click', function () { Eco.api.setServer(''); location.reload(); });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var url = $('#srv-url', body).value.trim().replace(/\/+$/, '');
          if (!/^https?:\/\/[^\s/]+/i.test(url)) { forms.setError($('[data-field="url"]', form), 'Enter an address that starts with http:// or https://'); return; }
          forms.setError($('[data-field="url"]', form), '');
          var ctrl = typeof AbortController === 'function' ? new AbortController() : null, timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
          var p = fetch(url + '/api/health', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }).then(function (r) { clearTimeout(timer); return r.json(); }).then(function (h) {
            if (!h || h.app !== 'EcoRoute') throw new Error('not-ecoroute');
            Eco.api.setServer(url); location.reload();
          });
          busy($('button[type="submit"]', form), 'Checking…', p);
          p.catch(function (err) {
            clearTimeout(timer);
            forms.setError($('[data-field="url"]', form), err && err.message === 'not-ecoroute' ? 'That address answered, but it is not an EcoRoute server.'
              : 'Can’t reach that address. Check it, that the server is running, and use https:// if this app runs on https.');
          });
        });
        setTimeout(function () { $('#srv-url', body).focus(); }, 350);
      }
    });
  }

  /** The server can't be reached but this device holds a session: show the last saved data, block writes, keep trying. */
  var offlineTimer = 0;
  function goOffline() {
    Eco.api.available = true; Eco.api.offline = true; Eco.api.ready = false;       // a backend exists, it just isn't answering
    paintAuthNote(true);
    Eco.nav.go('home', { replace: true });
    setTimeout(function () { ui.toast('The server is not reachable. Showing your last saved data.', 'warn', { duration: 4200 }); }, 400);
    clearInterval(offlineTimer);
    offlineTimer = setInterval(function () { if (Eco.api.offline) reconnect(); else clearInterval(offlineTimer); }, 20000);
  }

  /** A saved login token: load the account's data from the server and open Home. */
  function resume() {
    var s = Eco.store.state;
    Eco.api.get('/bootstrap').then(function (b) {
      s.loggedIn = true; s.onboarded = true;
      Eco.store.applyServer(b);
      Eco.api.ready = true; Eco.api.offline = false;
      Eco.api.flushOutbox();
      Eco.nav.go('home', { replace: true });
    }, function (err) {
      if (err.status === 401) return;                       // sessionExpired() has already sent the user to the login screen
      if (err.network && s.loggedIn && s.user && s.user.id) { goOffline(); return; }      // keep working from the data saved on this device
      s.loggedIn = false; Eco.store.save();
      Eco.nav.go('auth', { replace: true });
      setTimeout(function () { ui.toast(err.network ? 'Can’t reach the EcoRoute server. Is the backend running?' : err.message, 'error', { duration: 4200 }); }, 400);
    });
  }

  /** The network is back: send saved journeys and, if the app started offline, load the account again. */
  function reconnect() {
    if (!Eco.api.authed()) return;
    Eco.location.flush().catch(noop).then(function () { return Eco.api.flushOutbox(); }).then(function () {
      if (!Eco.api.offline) return;
      return Eco.api.get('/bootstrap').then(function (b) {
        Eco.store.applyServer(b);
        Eco.api.ready = true; Eco.api.offline = false;
        ui.toast('Reconnected. Your data is up to date.', 'success');
        if (Eco.nav.current() === 'home' && Eco.dashboard) Eco.dashboard.render();
      });
    }).catch(noop);
  }

  /** Forget the signed-in account on this device (the token, the cached data, the position). */
  function wipe() {
    if (Eco.tracking && Eco.tracking.abort) Eco.tracking.abort();
    Eco.api.clearToken(); Eco.api.ready = false; Eco.api.offline = false;
    Eco.location.reset();
    Eco.store.clearUserData();
    Eco.resetTrip();
    ui.closeAllSheets(); ui.closeDialogs();
  }

  var expiring = false;
  /** The server no longer accepts our token (it expired, or the account was removed). */
  function sessionExpired() {
    if (expiring || !Eco.api.token) return;
    expiring = true;
    var kept = Eco.tracking && Eco.tracking.rescue ? Eco.tracking.rescue() : false;     // a journey in progress is kept for this account
    wipe();
    Eco.nav.go('auth', { reset: [], force: true });
    setTimeout(function () {
      ui.toast(kept ? 'Your session has ended. Your journey was kept on this device and will be saved after you sign in again.' : 'Your session has ended. Please sign in again.',
        'warn', { duration: kept ? 6000 : 4200 });
      expiring = false;
    }, 400);
  }

  /* =====================================================================
     2. Onboarding (swipeable, 3 slides)
     ===================================================================== */
  var ob = { i: 0, n: 3, dragging: false, x0: 0, dx: 0, w: 1 };

  function obRender(animate) {
    var track = $('#ob-track');
    track.style.transition = animate === false ? 'none' : '';
    track.style.transform = 'translateX(' + (-ob.i * 100) + '%)';
    $$('.ob-slide').forEach(function (s, k) { s.classList.toggle('active', k === ob.i); s.setAttribute('aria-hidden', k === ob.i ? 'false' : 'true'); });
    $$('#ob-dots span').forEach(function (d, k) { d.classList.toggle('active', k === ob.i); });
    var next = $('#ob-next');
    next.textContent = ob.i === ob.n - 1 ? 'Get Started' : 'Next';
    $('[data-action="ob-skip"]').style.visibility = ob.i === ob.n - 1 ? 'hidden' : 'visible';
  }
  function obGo(i) { ob.i = Math.max(0, Math.min(ob.n - 1, i)); obRender(); }
  function obFinish() {
    Eco.store.state.onboarded = true; Eco.store.save();
    Eco.nav.go('auth');
  }
  function initOnboarding() {
    var vp = $('#ob-viewport'), track = $('#ob-track');
    vp.addEventListener('pointerdown', function (e) {
      ob.dragging = true; ob.x0 = e.clientX; ob.dx = 0; ob.w = vp.clientWidth;
      track.style.transition = 'none';
    });
    window.addEventListener('pointermove', function (e) {
      if (!ob.dragging) return;
      ob.dx = e.clientX - ob.x0;
      var edge = (ob.i === 0 && ob.dx > 0) || (ob.i === ob.n - 1 && ob.dx < 0) ? 0.3 : 1;
      track.style.transform = 'translateX(calc(' + (-ob.i * 100) + '% + ' + (ob.dx * edge) + 'px))';
    });
    function end() {
      if (!ob.dragging) return;
      ob.dragging = false;
      if (Math.abs(ob.dx) > Math.min(70, ob.w * 0.2)) obGo(ob.i + (ob.dx < 0 ? 1 : -1)); else obRender();
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    document.addEventListener('keydown', function (e) {
      if (Eco.nav.current() !== 'onboarding') return;
      if (e.key === 'ArrowRight') obGo(ob.i + 1); else if (e.key === 'ArrowLeft') obGo(ob.i - 1);
    });
    ui.actions['ob-next'] = function () { if (ob.i === ob.n - 1) obFinish(); else obGo(ob.i + 1); };
    ui.actions['ob-skip'] = obFinish;
    $$('#ob-dots span').forEach(function (d, k) { d.style.pointerEvents = 'auto'; d.addEventListener('click', function () { obGo(k); }); });
    Eco.nav.register('onboarding', { enter: function () { ob.i = 0; obRender(false); } });
  }

  /* =====================================================================
     3. Login / Register
     ===================================================================== */
  var rulesLogin = {
    email: function (v) { return !v ? 'Enter your email address' : EMAIL_RE.test(v) ? '' : 'Enter a valid email, e.g. you@example.com'; },
    password: function (v) { return !v ? 'Enter your password' : v.length < 6 ? 'Password must be at least 6 characters' : ''; }
  };
  var rulesRegister = {
    name: function (v) { return !v ? 'Enter your full name' : v.length < 2 ? 'Name is too short' : ''; },
    email: rulesLogin.email,
    password: function (v) {
      if (!v) return 'Create a password';
      if (v.length < 8) return 'Use at least 8 characters';
      if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number';
      return '';
    },
    confirm: function (v, all) { return !v ? 'Confirm your password' : v !== all.password ? 'Passwords do not match' : ''; }
  };

  function strengthOf(p) {
    var s = 0;
    if (p.length >= 8) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
    return p ? Math.max(1, s) : 0;
  }

  function nameFromEmail(email) {
    var local = email.split('@')[0].replace(/[._\-+]+/g, ' ').replace(/\d+/g, '').trim();
    if (!local) return 'Eco Driver';
    return local.split(' ').filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }

  function openHome(welcome) {
    Eco.resetTrip();
    $$('#form-login input, #form-register input').forEach(function (i) { i.value = ''; });
    $$('#screen-auth .field').forEach(function (f) { forms.setError(f, ''); });
    $('#pass-strength').setAttribute('data-level', 0);
    Eco.nav.go('home', { reset: [] });
    setTimeout(function () { ui.toast(welcome, 'success'); }, 350);
  }

  /** Local demo (no backend). */
  function signIn(user, welcome) {
    var s = Eco.store.state;
    s.user = Object.assign(s.user, user);
    s.loggedIn = true; s.onboarded = true;
    Eco.store.save();
    openHome(welcome);
  }

  /** Backend: remember the token, load the account from the database, open Home. */
  function signInServer(res, welcome) {
    Eco.api.setToken(res.token);
    return Eco.api.get('/bootstrap').then(function (b) {
      var s = Eco.store.state;
      s.loggedIn = true; s.onboarded = true;
      Eco.store.applyServer(b);
      Eco.api.ready = true; Eco.api.offline = false;
      Eco.api.flushOutbox();
      openHome(welcome);
    }, function (err) { Eco.api.clearToken(); throw err; });
  }

  function firstName(n) { return String(n || '').split(' ')[0] || 'there'; }

  /** Put the server's message next to the field it is about (or in a toast when it is not about one field). */
  function showAuthError(form, err) {
    if (forms.applyServer(form, err)) return;
    if (err.status === 401 && form.id === 'form-login') {           // wrong email or password
      forms.applyServer(form, { fields: { password: err.message } });
      return;
    }
    ui.toast(err.network ? 'Can’t reach the EcoRoute server. Is the backend running?' : err.message, 'error', { duration: 4200 });
  }

  /** POST credentials to the backend, then sign in. */
  function serverAuth(form, btn, busyText, path, body, welcome) {
    var p = Eco.api.post(path, body, { anon: true }).then(function (res) { return signInServer(res, welcome(res)); });
    busy(btn, busyText, p);
    p.catch(function (err) { showAuthError(form, err); });
  }

  function setTab(tab) {
    var seg = $('#auth-seg');
    var isLogin = tab === 'login';
    seg.style.setProperty('--i', isLogin ? 0 : 1);
    $$('.seg-btn', seg).forEach(function (b) {
      var on = b.getAttribute('data-auth-tab') === tab;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#form-login').classList.toggle('hidden', !isLogin);
    $('#form-register').classList.toggle('hidden', isLogin);
    $('#screen-auth .screen-body').scrollTop = 0;
  }

  function initAuth() {
    var fl = $('#form-login'), fr = $('#form-register');
    forms.live(fl, rulesLogin); forms.live(fr, rulesRegister);

    $('#auth-seg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-auth-tab]'); if (b) setTab(b.getAttribute('data-auth-tab'));
    });

    fl.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = forms.validate(fl, rulesLogin);
      if (!r.ok) return;
      if (Eco.api.available) {
        serverAuth(fl, $('button[type="submit"]', fl), 'Signing in…', '/auth/login', { email: r.values.email, password: $('#login-password').value },
          function (res) { return 'Welcome back, ' + firstName(res.user.name) + '!'; });
        return;
      }
      simulate($('button[type="submit"]', fl), 'Signing in…', function () {
        var s = Eco.store.state, same = s.user.email.toLowerCase() === r.values.email.toLowerCase();
        signIn(same ? {} : { email: r.values.email, name: nameFromEmail(r.values.email) }, 'Welcome back, ' + (same ? s.user.name : nameFromEmail(r.values.email)).split(' ')[0] + '!');
      });
    });

    fr.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = forms.validate(fr, rulesRegister);
      if (!r.ok) return;
      if (Eco.api.available) {
        serverAuth(fr, $('button[type="submit"]', fr), 'Creating account…', '/auth/register', { name: r.values.name, email: r.values.email, password: $('#reg-password').value },
          function (res) { return 'Account created. Welcome, ' + firstName(res.user.name) + '!'; });
        return;
      }
      simulate($('button[type="submit"]', fr), 'Creating account…', function () {
        Eco.store.freshProfile();                                   // a new local account starts with nothing in it
        signIn({ name: r.values.name, email: r.values.email, joined: new Date().toISOString() }, 'Account created. Welcome, ' + r.values.name.split(' ')[0] + '!');
      }, 900);
    });

    $('#reg-password').addEventListener('input', function (e) {
      $('#pass-strength').setAttribute('data-level', strengthOf(e.target.value));
    });

    ui.actions['toggle-pass'] = function (btn) {
      var input = $('input', btn.closest('.input-wrap'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.innerHTML = ui.icon(show ? 'eye-off' : 'eye', 20);
    };
    ui.actions['demo-login'] = function (btn) {
      if (Eco.api.available) {
        var p = Eco.api.post('/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD }, { anon: true })
          .then(function (res) { return signInServer(res, 'Welcome, ' + firstName(res.user.name) + '! Demo account loaded.'); });
        busy(btn, 'Loading demo…', p);
        p.catch(function (err) {
          ui.toast(err.network ? 'Can’t reach the EcoRoute server. Is the backend running?' : err.status === 401 ? 'The demo account is not available on this server.' : err.message, 'error', { duration: 4200 });
        });
        return;
      }
      simulate(btn, 'Loading demo…', function () {
        Eco.store.loadSample();                                     // the demo account comes with sample vehicles and journeys
        signIn({ name: 'Alex Morgan', email: 'alex.morgan@example.com' }, 'Welcome, Alex! Demo account loaded.');
      }, 600);
    };
    ui.actions['forgot-password'] = forgotPassword;
    ui.actions['set-server'] = serverSheet;

    Eco.nav.register('auth', { enter: function () { setTab('login'); paintAuthNote(Eco.api.available); } });
  }

  function forgotPassword() {
    var typed = $('#login-email').value.trim();
    ui.sheet({
      title: 'Reset password',
      html:
        '<div id="fp-form"><p class="muted" style="margin-bottom:16px">Enter the email you registered with and we’ll show you how a reset link would be sent.</p>' +
        '<form id="form-forgot" novalidate><div class="field" data-field="email"><label for="fp-email">Email</label>' +
        '<div class="input-wrap"><i data-icon="mail"></i><input id="fp-email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="' + ui.esc(typed) + '"></div>' +
        '<p class="field-error" role="alert"></p></div>' +
        '<button type="submit" class="btn btn-primary btn-lg btn-block">Send reset link</button></form></div>' +
        '<div id="fp-done" class="success-state hidden"><div class="empty-ic">' + ui.icon('mail', 30) + '</div><h3>Check your inbox</h3>' +
        '<p>If an account exists for <b id="fp-sent"></b>, a reset link would arrive shortly.<br><span class="small">Demo build: no email is actually sent (this app has no mail service).</span></p>' +
        '<button type="button" class="btn btn-secondary btn-block" data-sheet-close>Back to login</button></div>',
      onMount: function (body) {
        var form = $('#form-forgot', body), rules = { email: rulesLogin.email };
        forms.live(form, rules);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var r = forms.validate(form, rules);
          if (!r.ok) return;
          var done = function () {
            $('#fp-sent', body).textContent = r.values.email;
            $('#fp-form', body).classList.add('hidden'); $('#fp-done', body).classList.remove('hidden');
            ui.toast('Reset link sent (simulated)', 'success');
          };
          if (Eco.api.available) {
            var p = Eco.api.post('/auth/forgot', { email: r.values.email }, { anon: true }).then(done);
            busy($('button[type="submit"]', form), 'Sending…', p);
            p.catch(function (err) { showAuthError(form, err); });
            return;
          }
          simulate($('button[type="submit"]', form), 'Sending…', done, 800);
        });
        setTimeout(function () { $('#fp-email', body).focus(); }, 350);
      }
    });
  }

  /* ---------- logout (used by Profile) ---------- */
  function logout() {
    var server = Eco.api.authed();
    return ui.confirm({
      title: 'Log out?', icon: 'log-out', danger: true, confirmText: 'Log out',
      message: server ? 'You can sign back in any time. Your journeys and vehicles stay saved in the database.' : 'You can sign back in any time. Your demo data stays on this device.'
    }).then(function (ok) {
      if (!ok) return;
      if (Eco.tracking && Eco.tracking.abort) Eco.tracking.abort();
      if (!server) {
        Eco.store.state.loggedIn = false; Eco.store.save();
        Eco.resetTrip();
        ui.closeAllSheets();
        Eco.nav.go('auth', { reset: [], force: true });
        setTimeout(function () { ui.toast('You have been logged out', 'info'); }, 350);
        return;
      }
      // hand the last settings and positions to the server, end this device's session, then forget the account here
      Eco.api.flushSettings();
      var finish = Eco.location.flush().then(function () { return Eco.api.post('/auth/logout', {}, { soft401: true }); }).catch(noop);
      var cap = new Promise(function (resolve) { setTimeout(resolve, 2500); });
      Promise.race([finish, cap]).then(function () {
        wipe();
        Eco.nav.go('auth', { reset: [], force: true });
        setTimeout(function () { ui.toast('You have been logged out', 'info'); }, 350);
      });
    });
  }

  Eco.auth = { start: start, logout: logout, reconnect: reconnect, wipe: wipe, sessionExpired: sessionExpired };
  Eco.onReady(function () {
    initOnboarding(); initAuth();
    Eco.api.onUnauthorized = sessionExpired;
  });
})();
