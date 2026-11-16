/* ==========================================================================
   EcoRoute - profile.js
   Screen 14: Profile & Settings. Edit profile, saved vehicles, theme,
   notification toggles, privacy & data (location history, delete account),
   install prompt, about, reset and logout. With the backend running, profile
   edits go to the database; without it everything stays on this device.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc, fmt = ui.fmt;

  var THEMES = ['light', 'dark', 'system'];
  var NOTIF_LABEL = { trip: 'Trip reminders', tips: 'Eco tips', charging: 'Charging alerts', weekly: 'Weekly report' };

  /* ---------- render ---------- */
  function render() {
    var s = Eco.store.state, u = s.user, all = Eco.stats.totals(s.journeys), lvl = Eco.stats.level(all.savedG);
    var saved = fmt.co2(all.savedG);
    var since = new Date(u.joined);
    $('#profile-card').innerHTML =
      '<div class="pc-top"><div class="pc-avatar" style="' + Eco.avatar.style(u) + '">' + esc(Eco.avatar.initial(u)) + '</div>' +
      '<div class="pc-info"><h2>' + esc(u.name) + '</h2><p>' + esc(u.email) + '</p>' +
      '<span class="badge badge-green">' + ui.icon('award', 13) + esc(lvl.name) + '</span></div>' +
      '<button type="button" class="icon-btn icon-btn-sm" data-action="edit-profile" aria-label="Edit profile">' + ui.icon('pencil', 18) + '</button></div>' +
      '<div class="pc-level"><div class="row"><span>' + (lvl.next ? 'Next level: ' + esc(lvl.next) : 'Top level reached') + '</span><span>' + Math.round(lvl.pct) + '%</span></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(lvl.pct) + '" aria-label="Progress to next level"><span style="width:' + lvl.pct.toFixed(0) + '%"></span></div></div>' +
      '<div class="pc-stats"><div><b>' + all.count + '</b><small>Journeys</small></div><div><b>' + saved.v + ' ' + saved.u + '</b><small>CO₂ saved</small></div><div><b>' + (all.count ? all.score : '–') + '</b><small>Eco Score</small></div></div>' +
      '<p class="fine" style="margin:12px 0 0">Member since ' + fmt.months[since.getMonth()] + ' ' + since.getFullYear() + (u.city ? ' · ' + esc(u.city) : '') + '</p>';

    var v = Eco.vehicles.active();
    $('#mi-garage-sub').textContent = s.garage.length + ' saved · active: ' + v.label;

    // theme
    var i = Math.max(0, THEMES.indexOf(s.settings.theme));
    $('#theme-seg').style.setProperty('--i', i);
    $$('#theme-seg .seg-btn').forEach(function (b) {
      var on = b.getAttribute('data-theme-pref') === s.settings.theme;
      b.classList.toggle('active', on); b.setAttribute('aria-checked', on);
    });

    // notifications
    $$('[data-notif]').forEach(function (c) { c.checked = !!s.settings.notif[c.getAttribute('data-notif')]; });
    renderPrivacy();
    refreshInstall();
    Eco.icons.hydrate($('#screen-profile'));
  }

  /* ---------- privacy & data ---------- */
  function renderPrivacy() {
    var s = Eco.store.state, server = Eco.api.authed();
    var cb = $('[data-privacy="shareLocation"]');
    if (cb) cb.checked = s.settings.shareLocation !== false;
    $('#pv-share-row').classList.toggle('hidden', !server);        // with no backend nothing is saved anywhere but here
    $('#privacy-menu').classList.toggle('hidden', !server);
    var j = s.journeys.length, v = s.garage.length;
    $('#pv-store-title').textContent = server ? 'Saved in your database' : 'Saved on this device only';
    $('#pv-store-sub').textContent = server
      ? (Eco.api.offline ? 'The server is not reachable. Showing the last saved copy.'
        : 'MySQL on the EcoRoute server · ' + j + ' journey' + (j === 1 ? '' : 's') + ' · ' + v + ' vehicle' + (v === 1 ? '' : 's'))
      : 'This browser (localStorage). Start the EcoRoute backend to use the database.';
    $('#mi-reset-sub').textContent = server ? 'Replace your vehicles & journeys with the sample set' : 'Restore sample journeys & vehicles';
  }

  function clearLocationHistory() {
    ui.confirm({
      title: 'Delete location history?', icon: 'trash-2', danger: true, confirmText: 'Delete',
      message: 'Every GPS position saved for your account is removed from the database, including the recorded routes of your journeys. Your journeys themselves stay.'
    }).then(function (ok) {
      if (!ok) return;
      if (!Eco.api.canWrite()) { ui.toast('The server is not reachable right now. Try again in a moment.', 'warn'); return; }
      Eco.location.flush().catch(function () { /* nothing queued */ }).then(function () { return Eco.api.del('/me/location-history'); }).then(function (r) {
        var n = (r && r.deleted) || 0;
        ui.toast(n ? n + ' saved position' + (n === 1 ? '' : 's') + ' deleted' : 'No saved positions to delete', 'success');
      }, function (err) { ui.toast(Eco.api.errorText(err), 'error', { duration: 4000 }); });
    });
  }

  function deleteAccount() {
    if (!Eco.api.authed()) return;
    ui.sheet({
      title: 'Delete my account',
      html:
        '<p class="muted" style="margin-bottom:16px">This permanently erases your account, vehicles, journeys and saved locations from the database. It can’t be undone.</p>' +
        '<form id="form-delete" novalidate><div class="field" data-field="password"><label for="da-password">Confirm with your password</label>' +
        '<div class="input-wrap"><i data-icon="lock"></i><input id="da-password" type="password" autocomplete="current-password" placeholder="Your password"></div>' +
        '<p class="field-error" role="alert"></p></div>' +
        '<div class="sheet-actions"><button type="button" class="btn btn-secondary btn-lg" data-sheet-close>Cancel</button><button type="submit" class="btn btn-danger btn-lg">Delete account</button></div></form>',
      onMount: function (body, ctrl) {
        var form = $('#form-delete', body), rules = { password: function (v) { return v ? '' : 'Enter your password to confirm'; } };
        Eco.forms.live(form, rules);
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var r = Eco.forms.validate(form, rules);
          if (!r.ok) return;
          var req = Eco.api.del('/me', { password: $('#da-password', body).value }, { soft401: true }).then(function () {
            ctrl.close();
            Eco.api.clearOutbox();                 // unsent journeys of a deleted account must not linger on this device
            Eco.auth.wipe();
            Eco.nav.go('auth', { reset: [], force: true });
            setTimeout(function () { ui.toast('Your account has been deleted', 'info'); }, 350);
          });
          ui.busy($('button[type="submit"]', form), 'Deleting…', req);
          req.catch(function (err) {
            if (err.status === 401 || err.status === 400) Eco.forms.applyServer(form, { fields: err.fields && err.fields.password ? err.fields : { password: err.message } });
            else ui.toast(Eco.api.errorText(err), 'error', { duration: 4000 });
          });
        });
        setTimeout(function () { $('#da-password', body).focus(); }, 350);
      }
    });
  }

  /* ---------- install (PWA) ---------- */
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
  function refreshInstall() {
    var item = $('#mi-install'); if (!item) return;
    var show = !Eco.pwa.isStandalone() && (Eco.pwa.canInstall() || isIOS());
    item.classList.toggle('hidden', !show);
    var sm = $('small', item);
    if (sm) sm.textContent = Eco.pwa.canInstall() ? 'Add to your home screen' : 'Add via Share → Add to Home Screen';
  }
  function installApp() {
    if (Eco.pwa.canInstall()) { Eco.pwa.install().then(function (ok) { if (ok) ui.toast('Installing EcoRoute…', 'success'); }); return; }
    ui.sheet({
      title: 'Install EcoRoute',
      html: '<div class="about-list"><div class="row">' + ui.icon('share-2', 18) + '<span>Tap the <b>Share</b> button in Safari.</span></div>' +
        '<div class="row">' + ui.icon('plus', 18) + '<span>Choose <b>Add to Home Screen</b>.</span></div>' +
        '<div class="row">' + ui.icon('smartphone', 18) + '<span>Open EcoRoute from your home screen for a full-screen experience.</span></div></div>' +
        '<button type="button" class="btn btn-secondary btn-block" style="margin-top:18px" data-sheet-close>Got it</button>'
    });
  }

  /* ---------- edit profile ---------- */
  var epRules = {
    name: function (v) { return !v ? 'Enter your name' : v.length < 2 ? 'Name is too short' : ''; },
    email: function (v) { return !v ? 'Enter your email address' : Eco.forms.EMAIL_RE.test(v) ? '' : 'Enter a valid email address'; },
    phone: function (v) { return v && !/^[+\d][\d\s\-()]{6,}$/.test(v) ? 'Enter a valid phone number' : ''; }
  };

  function editProfile() {
    var u = Eco.store.state.user, color = u.color || 0;
    ui.sheet({
      title: 'Edit profile',
      html:
        '<form id="form-profile" novalidate>' +
        '<div class="field"><span class="lbl">Avatar colour</span><div class="color-row" role="radiogroup" aria-label="Avatar colour">' +
        Eco.avatar.gradients.map(function (g, i) { return '<button type="button" class="color-dot' + (i === color ? ' active' : '') + '" role="radio" aria-checked="' + (i === color) + '" data-color="' + i + '" aria-label="Colour ' + (i + 1) + '" style="background:linear-gradient(145deg,' + g[0] + ',' + g[1] + ')">' + (i === color ? ui.icon('check', 18) : '') + '</button>'; }).join('') +
        '</div></div>' +
        '<div class="field" data-field="name"><label for="ep-name">Full name</label><div class="input-wrap"><i data-icon="user"></i><input id="ep-name" type="text" autocomplete="name" value="' + esc(u.name) + '"></div><p class="field-error" role="alert"></p></div>' +
        '<div class="field" data-field="email"><label for="ep-email">Email</label><div class="input-wrap"><i data-icon="mail"></i><input id="ep-email" type="email" inputmode="email" autocomplete="email" value="' + esc(u.email) + '"></div><p class="field-error" role="alert"></p></div>' +
        '<div class="field" data-field="phone"><label for="ep-phone">Phone (optional)</label><div class="input-wrap"><i data-icon="phone"></i><input id="ep-phone" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(u.phone || '') + '"></div><p class="field-error" role="alert"></p></div>' +
        '<div class="field" data-field="city"><label for="ep-city">City</label><div class="input-wrap"><i data-icon="map-pin"></i><input id="ep-city" type="text" autocomplete="address-level2" value="' + esc(u.city || '') + '"></div><p class="field-error" role="alert"></p></div>' +
        '<div class="sheet-actions"><button type="button" class="btn btn-secondary btn-lg" data-sheet-close>Cancel</button><button type="submit" class="btn btn-primary btn-lg">Save changes</button></div></form>',
      onMount: function (body, ctrl) {
        var form = $('#form-profile', body);
        Eco.forms.live(form, epRules);
        $('.color-row', body).addEventListener('click', function (e) {
          var b = e.target.closest('[data-color]'); if (!b) return;
          color = +b.getAttribute('data-color');
          $$('.color-dot', body).forEach(function (d, i) { var on = i === color; d.classList.toggle('active', on); d.setAttribute('aria-checked', on); d.innerHTML = on ? ui.icon('check', 18) : ''; });
        });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var r = Eco.forms.validate(form, epRules);
          if (!r.ok) return;
          var next = { name: r.values.name, email: r.values.email, phone: r.values.phone, city: r.values.city, color: color };
          var saved = function (u) {
            Object.assign(Eco.store.state.user, u);
            Eco.store.save(); ctrl.close(); render();
            ui.toast('Profile updated', 'success');
          };
          if (!Eco.api.authed()) { saved(next); return; }
          if (!Eco.api.canWrite()) { ui.toast('The server is not reachable right now. Try again in a moment.', 'warn'); return; }
          var req = Eco.api.put('/me', next).then(function (u) {
            saved({ name: u.name, email: u.email, phone: u.phone || '', city: u.city || '', color: u.color || 0 });
          });
          ui.busy($('button[type="submit"]', form), 'Saving…', req);
          req.catch(function (err) {
            if (!Eco.forms.applyServer(form, err)) ui.toast(Eco.api.errorText(err), 'error', { duration: 4000 });
          });
        });
      }
    });
  }

  /* ---------- about ---------- */
  function about() {
    var server = Eco.api.authed();
    ui.sheet({
      title: 'About EcoRoute',
      html:
        '<div class="about-hero"><img src="assets/logo/logo.svg" alt="" width="72" height="72"><h2>EcoRoute</h2><p class="muted">Version 1.1.0 · Demo build</p><p style="margin-top:6px"><b>Travel Smarter. Drive Greener. Live Better.</b></p></div>' +
        '<div class="about-list">' +
        '<div class="row">' + ui.icon('map', 18) + '<span><b>The map and routes are real.</b> The map is OpenStreetMap, places come from Nominatim and routes from the OSRM routing service (free public services). Travel times have no live traffic, charger data comes from OpenStreetMap volunteers and has no live availability, and CO₂ figures are estimates.</span></div>' +
        '<div class="row">' + ui.icon('locate-fixed', 18) + '<span><b>Your location is real.</b> The Home screen shows where your device is (the browser’s location sensor, if you allow it). ' +
        (server
          ? 'While “Save my location history” is on, positions and the street address are kept in your database, and the server looks the address up with OpenStreetMap. Turn it off or delete the history any time in Profile.'
          : 'It is only shown on this device and never stored or sent.') + '</span></div>' +
        '<div class="row">' + ui.icon('navigation-2', 18) + '<span><b>Movement is yours.</b> During a journey the vehicle moves only when you really move (Live GPS) or when you hold the Demo drive button.' + (server ? ' A Live GPS journey also keeps the route your device recorded.' : ' Only the distance is kept.') + '</span></div>' +
        '<div class="row">' + ui.icon('leaf', 18) + '<span><b>How CO₂ is estimated.</b> Fuel vehicles use litres burned per km (petrol 2.31 kg/l, diesel 2.68 kg/l); EVs use battery size ÷ range × a sample grid factor. Route flow (stop-and-go vs steady) adjusts the result.</span></div>' +
        '<div class="row">' + ui.icon('award', 18) + '<span><b>Eco Score</b> rates a trip from 0–100 by its CO₂ per km. <b>Carbon saved</b> compares against an average petrol car (170 g/km).</span></div>' +
        '<div class="row">' + ui.icon('shield-check', 18) + '<span><b>Your data</b> ' + (server
          ? 'is saved in the MySQL database of the EcoRoute server on this computer (passwords are hashed). You can delete your location history or the whole account from Profile.'
          : 'stays in this browser (localStorage) and can be reset any time from Profile.') + '</span></div>' +
        '<div class="row">' + ui.icon('heart', 18) + '<span>Icons by Lucide (ISC). Typeface Inter (SIL OFL), bundled for offline use.</span></div></div>' +
        '<button type="button" class="btn btn-secondary btn-block" style="margin-top:18px" data-sheet-close>Close</button>'
    });
  }

  /* ---------- reset ---------- */
  function resetDemo() {
    var server = Eco.api.authed();
    ui.confirm({
      title: 'Reset demo data?', icon: 'rotate-ccw', danger: true, confirmText: 'Reset',
      message: server
        ? 'Your vehicles and journeys in the database are replaced by the sample data. Your account and saved locations are kept.'
        : 'Journeys, vehicles, settings and battery level return to the sample defaults. You will stay signed in.'
    }).then(function (ok) {
      if (!ok) return;
      if (!server) {
        var s = Eco.store.state, keep = { loggedIn: true, onboarded: true, user: s.user };
        Eco.store.reset(); Eco.store.load();
        Object.assign(Eco.store.state, keep); Eco.store.loadSample();
        Eco.theme.apply(); Eco.resetTrip(); render();
        ui.toast('Demo data restored', 'success');
        return;
      }
      if (!Eco.api.canWrite()) { ui.toast('The server is not reachable right now. Try again in a moment.', 'warn'); return; }
      Eco.api.post('/me/sample-data').then(function () { return Eco.api.get('/bootstrap'); }).then(function (b) {
        Eco.store.applyServer(b);
        Eco.resetTrip(); render();
        ui.toast('Demo data restored', 'success');
      }, function (err) { ui.toast(Eco.api.errorText(err), 'error', { duration: 4000 }); });
    });
  }

  /* ---------- init ---------- */
  function init() {
    $('#theme-seg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme-pref]'); if (!b) return;
      Eco.theme.set(b.getAttribute('data-theme-pref')); render();
    });
    $('#notif-card').addEventListener('change', function (e) {
      var c = e.target.closest('[data-notif]'); if (!c) return;
      var k = c.getAttribute('data-notif');
      Eco.store.state.settings.notif[k] = c.checked; Eco.store.save();
      ui.toast(NOTIF_LABEL[k] + (c.checked ? ' turned on' : ' turned off') + ' (demo)', 'info', { duration: 1600 });
    });
    $('#privacy-card').addEventListener('change', function (e) {
      var c = e.target.closest('[data-privacy]'); if (!c) return;
      Eco.store.state.settings.shareLocation = c.checked; Eco.store.save();
      ui.toast(c.checked ? 'Location history is on: your positions are saved to the database' : 'Location history is off: no new positions are saved. Existing ones stay until you delete them.', 'info', { duration: 3600 });
    });
    ui.actions['clear-location-history'] = clearLocationHistory;
    ui.actions['delete-account'] = deleteAccount;
    ui.actions['edit-profile'] = editProfile;
    ui.actions['about'] = about;
    ui.actions['logout'] = function () { Eco.auth.logout(); };
    ui.actions['reset-demo'] = resetDemo;
    ui.actions['install-app'] = installApp;
    Eco.nav.register('profile', { enter: render });
  }

  Eco.profile = { render: render, refreshInstall: refreshInstall };
  Eco.onReady(init);
})();
