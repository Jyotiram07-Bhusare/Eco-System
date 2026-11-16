/* ==========================================================================
   EcoRoute - vehicles.js
   Screens 5-6: Vehicle selection + Add vehicle.
   Also the single source of truth for the active vehicle and EV battery %.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc;

  var mode = 'select';        // 'select' (pick for a trip) | 'manage' (saved vehicles from Profile)
  var pendingId = null;       // selection waiting for "Confirm" in select mode
  var batteryListeners = [];

  /* ---------- active vehicle ---------- */
  function resolve(id) {
    if (!id) return null;
    if (id.indexOf('generic-') === 0) { var t = id.slice(8); return Eco.data.vehicleTypes[t] ? Eco.data.genericVehicle(t) : null; }
    var g = Eco.store.state.garage, i;
    for (i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }
  function active() {
    var s = Eco.store.state, v = resolve(s.activeVehicleId);
    if (!v) { v = s.garage[0] || Eco.data.genericVehicle('petrol-car'); s.activeVehicleId = v.id; Eco.store.save(); }
    return v;
  }
  function select(id) { Eco.store.state.activeVehicleId = id; Eco.store.save(); }

  /* ---------- battery % (shared by Home, Planner, Charging, Navigation) ---------- */
  function battery() { return Eco.store.state.battery; }
  function setBattery(pct, silent) {
    pct = Math.round(ui.clamp(Number(pct) || 0, 0, 100));
    Eco.store.state.battery = pct;
    if (!silent) Eco.store.save();
    batteryListeners.forEach(function (fn) { try { fn(pct); } catch (e) { /* ignore */ } });
    return pct;
  }
  function onBattery(fn) { batteryListeners.push(fn); }
  function paintRange(el) {
    var min = +el.min || 0, max = +el.max || 100;
    el.style.setProperty('--fill', ((el.value - min) / (max - min) * 100) + '%');
    el.classList.toggle('low', +el.value <= 20);
  }
  /** Wire a range input to the shared battery state. */
  function bindBatterySlider(el, onChange) {
    el.value = battery(); paintRange(el);
    el.addEventListener('input', function () { paintRange(el); setBattery(el.value, true); if (onChange) onChange(+el.value); });
    el.addEventListener('change', function () { Eco.store.save(); });
  }

  /* ---------- small renderers reused by other screens ---------- */
  function iconBox(v, size, cls) {
    var t = Eco.data.vehicleTypes[v.type];
    return '<span class="' + (cls || 'vc-ic') + '">' + ui.icon(t.icon, size || 26) + (t.ev ? '<em class="ev-tag">EV</em>' : '') + '</span>';
  }
  function describe(v) {
    var t = Eco.data.vehicleTypes[v.type];
    return t.label + ' · ' + (v.ev ? v.battery + ' kWh' : v.mileage + ' km/l') + ' · ' + v.range + ' km range';
  }
  function ecoRating(g) { return g <= 70 ? 'A' : g <= 110 ? 'B' : g <= 150 ? 'C' : g <= 190 ? 'D' : 'E'; }

  /* =====================================================================
     Screen 5: Vehicle selection
     ===================================================================== */
  function renderSelect() {
    var s = Eco.store.state;
    var manage = mode === 'manage';
    $('#veh-title').textContent = manage ? 'Saved Vehicles' : 'Select Vehicle';
    $('#veh-lead').textContent = manage
      ? 'Tap a vehicle to make it your active vehicle. Swipe the list or use the bin to remove one.'
      : 'Pick the vehicle you’ll be travelling in. Emissions are estimated from its fuel type.';
    $('#veh-foot').classList.toggle('hidden', manage);
    $('#screen-vehicles .screen-body').classList.toggle('with-footer', !manage);

    var curId = manage ? s.activeVehicleId : pendingId;

    $('#veh-types').innerHTML = Object.keys(Eco.data.vehicleTypes).map(function (k, i) {
      var v = Eco.data.genericVehicle(k), t = Eco.data.vehicleTypes[k], sel = curId === v.id;
      return '<button type="button" class="veh-card fade-up' + (sel ? ' selected' : '') + '" style="--d:' + i * 0.04 + 's" data-vid="' + v.id + '" aria-pressed="' + sel + '">' +
        iconBox(v, 28) +
        '<span class="vc-text"><b>' + t.label + '</b><small>' + t.blurb + '</small>' +
        '<span class="vc-meta"><span class="tag">' + v.gPerKm + ' g/km</span><span class="tag ' + (t.ev ? 'tag-power' : '') + '">' + t.fuel + '</span></span></span>' +
        '<span class="vc-check">' + ui.icon('check', 15) + '</span></button>';
    }).join('');

    var garage = s.garage;
    $('#veh-garage').innerHTML = garage.length ? garage.map(function (v) {
      var sel = curId === v.id;
      return '<div class="garage-item' + (sel ? ' selected' : '') + '" role="button" tabindex="0" data-vid="' + v.id + '" aria-pressed="' + sel + '">' +
        iconBox(v, 24) +
        '<div class="gi-main"><b>' + esc(v.label) + '</b><small>' + esc(describe(v)) + '</small></div>' +
        '<div class="gi-co2"><b>' + v.gPerKm + '</b><small>g CO₂/km</small></div>' +
        (manage ? '<button type="button" class="icon-btn icon-btn-sm danger" data-del="' + v.id + '" aria-label="Remove ' + esc(v.label) + '">' + ui.icon('trash-2', 18) + '</button>' : '<span class="vc-check" style="position:static">' + ui.icon('check', 15) + '</span>') +
        '</div>';
    }).join('') : ui.empty('car', 'No saved vehicles', 'Add your own vehicle for more accurate emission estimates.',
      '<button type="button" class="btn btn-primary" data-go="add-vehicle">Add vehicle</button>');
    Eco.icons.hydrate($('#screen-vehicles'));
  }

  function pick(id) {
    if (mode === 'manage') {
      select(id); renderSelect();
      ui.toast(resolve(id).label + ' is now your active vehicle', 'success');
    } else { pendingId = id; renderSelect(); }
    ui.vibrate(10);
  }

  function removeVehicle(id) {
    var s = Eco.store.state, v = resolve(id);
    if (!v) return;
    ui.confirm({ title: 'Remove vehicle?', message: v.label + ' will be removed from your saved vehicles.', confirmText: 'Remove', icon: 'trash-2', danger: true })
      .then(function (ok) {
        if (!ok) return;
        var done = function () {
          s.garage = s.garage.filter(function (g) { return g.id !== id; });
          if (s.activeVehicleId === id) select(s.garage[0] ? s.garage[0].id : 'generic-petrol-car');
          if (pendingId === id) pendingId = s.activeVehicleId;
          Eco.store.save(); renderSelect();
          ui.toast('Vehicle removed', 'info');
        };
        if (!Eco.api.authed()) { done(); return; }
        if (!Eco.api.canWrite()) { ui.toast('The server is not reachable right now. Try again in a moment.', 'warn'); return; }
        Eco.api.del('/vehicles/' + encodeURIComponent(id)).then(done, function (err) {
          if (err.status === 404) { done(); return; }              // already gone on the server
          ui.toast(Eco.api.errorText(err), 'error', { duration: 4000 });
        });
      });
  }

  function initSelect() {
    $('#screen-vehicles').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) { e.stopPropagation(); removeVehicle(del.getAttribute('data-del')); return; }
      var card = e.target.closest('[data-vid]');
      if (card) pick(card.getAttribute('data-vid'));
    });
    $('#screen-vehicles').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.garage-item')) { e.preventDefault(); pick(e.target.getAttribute('data-vid')); }
    });
    ui.actions['vehicle-confirm'] = function () {
      select(pendingId);
      ui.toast(resolve(pendingId).label + ' selected', 'success');
      Eco.nav.back();
    };
    ui.actions['open-garage'] = function () { Eco.nav.go('vehicles', { params: { mode: 'manage' } }); };
    Eco.nav.register('vehicles', {
      enter: function (params, isBack) {
        if (!isBack) { mode = params && params.mode === 'manage' ? 'manage' : 'select'; pendingId = Eco.store.state.activeVehicleId; }
        renderSelect();
      }
    });
  }

  /* =====================================================================
     Screen 6: Add vehicle
     ===================================================================== */
  var form = { cat: 'car', fuel: 'Petrol', rangeTouched: false };
  var COMPANIES = {
    car: ['Tata', 'Hyundai', 'Honda', 'Maruti Suzuki', 'Toyota', 'Mahindra', 'Kia', 'MG', 'BYD', 'Tesla', 'Volkswagen'],
    bike: ['Honda', 'Hero', 'TVS', 'Bajaj', 'Yamaha', 'Royal Enfield', 'Ather', 'Ola Electric', 'Revolt']
  };
  var PLACEHOLDERS = {
    car:  { company: 'e.g. Tata', model: 'e.g. Nexon EV', mileage: '15', battery: '40', range: '300' },
    bike: { company: 'e.g. Honda', model: 'e.g. Activa 6G', mileage: '45', battery: '3.2', range: '110' }
  };

  function currentType() {
    var map = { 'car-Petrol': 'petrol-car', 'car-Diesel': 'diesel-car', 'car-Electric': 'electric-car', 'bike-Petrol': 'petrol-bike', 'bike-Electric': 'electric-bike' };
    return map[form.cat + '-' + form.fuel];
  }

  function syncFormUI() {
    var ev = form.fuel === 'Electric', ph = PLACEHOLDERS[form.cat];
    $$('#av-category .chip').forEach(function (c) {
      var on = c.getAttribute('data-cat') === form.cat; c.classList.toggle('active', on); c.setAttribute('aria-checked', on);
    });
    $$('#av-fuel .chip').forEach(function (c) {
      var f = c.getAttribute('data-fuel'), on = f === form.fuel;
      c.classList.toggle('active', on); c.setAttribute('aria-checked', on);
      c.disabled = form.cat === 'bike' && f === 'Diesel';     // no diesel bikes in this demo
    });
    $('#av-mileage-field').classList.toggle('hidden', ev);
    $('#av-battery-field').classList.toggle('hidden', !ev);
    $('#av-company').placeholder = ph.company; $('#av-model').placeholder = ph.model;
    $('#av-mileage').placeholder = ph.mileage; $('#av-battery').placeholder = ph.battery; $('#av-range').placeholder = ph.range;
    $('#av-company-list').innerHTML = COMPANIES[form.cat].map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
    $('#av-hint').textContent = ev
      ? 'Range is estimated from battery size. Adjust it to match your real-world range.'
      : 'Range is estimated for a full tank (' + (form.cat === 'car' ? '40' : '10') + ' L). Adjust it if you know better.';
    autoRange();
    preview();
  }

  function autoRange() {
    if (form.rangeTouched) return;
    var ev = form.fuel === 'Electric', r = $('#av-range'), n;
    if (ev) { n = parseFloat($('#av-battery').value); if (n > 0) r.value = Math.round(n * (form.cat === 'car' ? 7.5 : 34)); else r.value = ''; }
    else { n = parseFloat($('#av-mileage').value); if (n > 0) r.value = Math.round(n * (form.cat === 'car' ? 40 : 10)); else r.value = ''; }
    if (r.value) Eco.forms.setError(r.closest('.field'), '');     // a filled-in estimate clears a stale "enter the range" error
  }

  function draft() {
    var ev = form.fuel === 'Electric', ph = PLACEHOLDERS[form.cat];
    var mileage = parseFloat($('#av-mileage').value), battery = parseFloat($('#av-battery').value), range = parseFloat($('#av-range').value);
    return Eco.data.makeVehicle({
      id: 'draft', type: currentType(), company: $('#av-company').value.trim(), model: $('#av-model').value.trim(),
      mileage: !ev ? (mileage > 0 ? mileage : parseFloat(ph.mileage)) : undefined,
      battery: ev ? (battery > 0 ? battery : parseFloat(ph.battery)) : undefined,
      range: range > 0 ? range : undefined
    });
  }

  function preview() {
    var v = draft(), g = v.gPerKm, diff = Math.round((1 - g / Eco.calc.BASELINE_G_PER_KM) * 100);
    var rating = ecoRating(g), tone = g <= 110 ? 'green' : g <= 150 ? 'amber' : 'red';
    $('#av-preview').innerHTML =
      ui.ring({ value: Math.max(5, 100 - g / 2.2), size: 64, stroke: 7, tone: tone, label: rating, fontScale: 0.38 }) +
      '<div class="pv-main"><p class="eyebrow">Estimated emissions</p>' +
      '<div class="pv-val">' + g + '<small>g CO₂/km</small></div>' +
      '<p class="pv-sub">' + (diff >= 0 ? diff + '% lower' : Math.abs(diff) + '% higher') + ' than an average petrol car · ' + v.range + ' km range</p></div>';
  }

  var addRules = {
    company: function (v) { return !v ? 'Enter the company name' : v.length < 2 ? 'Company name is too short' : ''; },
    model: function (v) { return !v ? 'Enter the model name' : ''; },
    mileage: function (v) { var n = parseFloat(v); return !(n > 0) ? 'Enter mileage in km/l' : (n < 3 || n > 120) ? 'Mileage should be between 3 and 120 km/l' : ''; },
    battery: function (v) { var n = parseFloat(v); return !(n > 0) ? 'Enter battery capacity in kWh' : (n < 0.5 || n > 150) ? 'Battery should be between 0.5 and 150 kWh' : ''; },
    range: function (v) { var n = parseFloat(v); return !(n > 0) ? 'Enter the estimated range' : (n < 10 || n > 900) ? 'Range should be between 10 and 900 km' : ''; }
  };

  function resetForm() {
    form.cat = 'car'; form.fuel = 'Petrol'; form.rangeTouched = false;
    $('#form-vehicle').reset();
    $$('#form-vehicle .field').forEach(function (f) { Eco.forms.setError(f, ''); });
    syncFormUI();
  }

  function initAdd() {
    var f = $('#form-vehicle');
    Eco.forms.live(f, addRules);
    $('#av-category').addEventListener('click', function (e) {
      var c = e.target.closest('[data-cat]'); if (!c) return;
      form.cat = c.getAttribute('data-cat');
      if (form.cat === 'bike' && form.fuel === 'Diesel') form.fuel = 'Petrol';
      syncFormUI();
    });
    $('#av-fuel').addEventListener('click', function (e) {
      var c = e.target.closest('[data-fuel]'); if (!c || c.disabled) return;
      form.fuel = c.getAttribute('data-fuel'); form.rangeTouched = false;
      syncFormUI();
    });
    f.addEventListener('input', function (e) {
      if (e.target.id === 'av-range') form.rangeTouched = !!e.target.value;
      if (e.target.id === 'av-mileage' || e.target.id === 'av-battery') autoRange();
      preview();
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = Eco.forms.validate(f, addRules);
      if (!r.ok) return;
      var ev = form.fuel === 'Electric';
      var spec = {
        type: currentType(), company: r.values.company, model: r.values.model,
        mileage: ev ? undefined : parseFloat(r.values.mileage), battery: ev ? parseFloat(r.values.battery) : undefined, range: parseFloat(r.values.range)
      };
      var added = function (v) {
        Eco.store.state.garage.push(v);
        if (mode === 'manage') select(v.id); else pendingId = v.id;
        Eco.store.save();
        ui.toast(v.label + ' added to your garage', 'success');
        Eco.nav.back();
      };
      if (!Eco.api.authed()) {
        added(Eco.data.makeVehicle(Object.assign({ id: 'veh-' + Date.now().toString(36) }, spec)));
        return;
      }
      if (!Eco.api.canWrite()) { ui.toast('The server is not reachable right now. Try again in a moment.', 'warn'); return; }
      var req = Eco.api.post('/vehicles', spec).then(function (dto) {
        // the id (veh-N) and the CO₂ figures come from the database
        added(Eco.data.makeVehicle({ id: dto.id, type: dto.type, company: dto.company, model: dto.model, mileage: dto.mileage || undefined, battery: dto.battery || undefined, range: dto.range }));
      });
      ui.busy($('button[type="submit"][form="form-vehicle"]'), 'Saving…', req);      // the button sits outside the <form>, tied to it by the form attribute
      req.catch(function (err) {
        if (!Eco.forms.applyServer(f, err)) ui.toast(Eco.api.errorText(err), 'error', { duration: 4000 });
      });
    });
    Eco.nav.register('add-vehicle', { enter: function (p, isBack) { if (!isBack) resetForm(); } });
  }

  Eco.vehicles = {
    active: active, select: select, resolve: resolve, iconBox: iconBox, describe: describe, ecoRating: ecoRating,
    battery: battery, setBattery: setBattery, onBattery: onBattery, bindBatterySlider: bindBatterySlider, paintRange: paintRange
  };
  Eco.onReady(function () { initSelect(); initAdd(); });
})();
