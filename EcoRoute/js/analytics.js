/* ==========================================================================
   EcoRoute - analytics.js
   Screen 12: Journey History     Screen 13: Eco Analytics (weekly / monthly)

   Charts are hand-built SVG/HTML (no libraries) following a few fixed rules:
   one hue per single series, thin bars with 4px rounded data-ends, hairline
   solid grid, direct label on the extreme only, crosshair/tooltip on hover AND
   keyboard focus, and a table-view twin for every chart.
   All figures derive from the simulated journey history in the store.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var ui = Eco.ui, $ = ui.$, $$ = ui.$$, esc = ui.esc, fmt = ui.fmt;

  /* =====================================================================
     Shared: a journey row (used by Home and History)
     ===================================================================== */
  function journeyRow(j, i) {
    var vt = Eco.data.vehicleTypes[j.vehicleType] || Eco.data.vehicleTypes['petrol-car'];
    var d = new Date(j.date), co2 = fmt.co2(j.co2g), tone = Eco.calc.scoreTone(j.ecoScore);
    return '<button type="button" class="journey fade-up tone-' + tone + '" style="--d:' + Math.min(i || 0, 10) * 0.035 + 's" data-jid="' + j.id + '">' +
      '<span class="j-ic">' + ui.icon(vt.icon, 22) + '</span>' +
      '<span class="j-main"><b>' + esc(j.from) + ' → ' + esc(j.to) + '</b>' +
      '<small>' + fmt.dateShort(d) + ' · ' + fmt.clock(d) + ' · ' + esc(j.vehicleLabel) + (j.status === 'ended-early' ? ' · Ended early' : '') + '</small></span>' +
      '<span class="j-side"><b>' + fmt.km(j.distanceKm) + ' km</b><small>' + co2.v + ' ' + co2.u + ' CO₂</small></span></button>';
  }

  /* =====================================================================
     Screen 12: Journey history
     ===================================================================== */
  var hist = { filter: 'all', shown: 20 };
  function fuelGroup(t) { return t.indexOf('electric') === 0 ? 'electric' : t.indexOf('diesel') === 0 ? 'diesel' : 'petrol'; }

  function historyList() {
    return Eco.store.state.journeys.filter(function (j) { return hist.filter === 'all' || fuelGroup(j.vehicleType) === hist.filter; });
  }

  function renderHistory() {
    var all = Eco.store.state.journeys, list = historyList();
    var t = Eco.stats.totals(list);
    $('#hist-sub').textContent = all.length ? all.length + ' journey' + (all.length === 1 ? '' : 's') + ' recorded' : 'No journeys yet';

    var co2 = fmt.co2(t.co2g);
    $('#hist-stats').innerHTML =
      '<div class="mini-stat"><b>' + t.count + '</b><small>Journeys</small></div>' +
      '<div class="mini-stat"><b>' + fmt.km(t.km) + '</b><small>km travelled</small></div>' +
      '<div class="mini-stat"><b>' + co2.v + ' <span style="font-size:12px;color:var(--text-3)">' + co2.u + '</span></b><small>CO₂ emitted</small></div>';

    var counts = { all: all.length, electric: 0, petrol: 0, diesel: 0 };
    all.forEach(function (j) { counts[fuelGroup(j.vehicleType)]++; });
    var chips = [['all', 'All', null], ['electric', 'Electric', 'zap'], ['petrol', 'Petrol', 'fuel'], ['diesel', 'Diesel', 'droplets']];
    $('#hist-filters').innerHTML = chips.map(function (c) {
      var on = hist.filter === c[0];
      return '<button type="button" class="chip' + (on ? ' active' : '') + '" data-hf="' + c[0] + '" aria-pressed="' + on + '">' + (c[2] ? ui.icon(c[2], 16) : '') + c[1] + ' <span style="opacity:.7">' + counts[c[0]] + '</span></button>';
    }).join('');

    var host = $('#hist-list');
    if (!list.length) {
      host.innerHTML = all.length
        ? ui.empty('filter', 'No journeys match', 'Try a different vehicle filter.', '<button type="button" class="btn btn-secondary" data-hf="all">Show all</button>')
        : ui.empty('route', 'No journeys yet', 'Plan an eco-friendly route and your trips will appear here.', '<button type="button" class="btn btn-primary" data-go="planner">Plan a journey</button>');
      Eco.icons.hydrate(host); return;
    }

    var visible = list.slice(0, hist.shown), groups = [], map = {};
    visible.forEach(function (j) {
      var label = fmt.dayLabel(j.date);
      if (!map[label]) { map[label] = { label: label, items: [] }; groups.push(map[label]); }
      map[label].items.push(j);
    });
    var idx = 0;
    host.innerHTML = groups.map(function (g) {
      var gt = Eco.stats.totals(g.items);
      return '<div class="group-label">' + esc(g.label) + '<span>' + g.items.length + ' trip' + (g.items.length === 1 ? '' : 's') + ' · ' + fmt.km(gt.km) + ' km</span></div>' +
        '<div class="list">' + g.items.map(function (j) { return journeyRow(j, idx++); }).join('') + '</div>';
    }).join('') + (list.length > hist.shown ? '<button type="button" class="btn btn-secondary btn-block more-btn" data-action="hist-more">Show ' + Math.min(20, list.length - hist.shown) + ' more</button>' : '');
    Eco.icons.hydrate(host);
  }

  function initHistory() {
    $('#hist-filters').addEventListener('click', function (e) {
      var c = e.target.closest('[data-hf]'); if (!c) return;
      hist.filter = c.getAttribute('data-hf'); hist.shown = 20; renderHistory();
    });
    $('#hist-list').addEventListener('click', function (e) {
      var f = e.target.closest('[data-hf]'); if (f) { hist.filter = f.getAttribute('data-hf'); renderHistory(); return; }
      var r = e.target.closest('[data-jid]'); if (r) Eco.tracking.openSummary(r.getAttribute('data-jid'));
    });
    ui.actions['hist-more'] = function () { hist.shown += 20; renderHistory(); };
    ui.actions['history-clear'] = function () {
      if (!Eco.store.state.journeys.length) { ui.toast('There is no history to clear', 'info'); return; }
      ui.confirm({ title: 'Clear journey history?', message: 'All recorded journeys, analytics and your Eco Score will be reset. This can’t be undone (use “Reset demo data” in Profile to restore the samples).', confirmText: 'Clear history', icon: 'trash-2', danger: true })
        .then(function (ok) {
          if (!ok) return;
          var done = function () {
            Eco.store.state.journeys = []; Eco.store.save(); hist.shown = 20; renderHistory();
            ui.toast('Journey history cleared', 'success');
          };
          if (!Eco.api.authed()) { done(); return; }
          if (!Eco.api.canWrite()) { ui.toast('The server is not reachable right now. Try again in a moment.', 'warn'); return; }
          Eco.api.del('/journeys').then(done, function (err) { ui.toast(Eco.api.errorText(err), 'error', { duration: 4000 }); });
        });
    };
    Eco.nav.register('history', { enter: renderHistory });
  }

  /* =====================================================================
     Screen 13: Eco analytics
     ===================================================================== */
  var A = { period: 'week', metric: 'km', table: { bars: false, line: false, rank: false } };

  var METRICS = {
    km:    { title: 'Distance', unit: 'km', icon: 'route', tone: 'green', get: function (b) { return b.km; }, val: function (v) { return fmt.km(v); } },
    co2:   { title: 'Emissions', unit: 'kg CO₂', icon: 'cloud', tone: 'amber', get: function (b) { return b.co2g / 1000; }, val: function (v) { return v >= 100 ? String(Math.round(v)) : v.toFixed(1); } },
    saved: { title: 'Carbon saved', unit: 'kg CO₂', icon: 'leaf', tone: 'green', get: function (b) { return b.savedG / 1000; }, val: function (v) { return v >= 100 ? String(Math.round(v)) : v.toFixed(1); } }
  };

  function buckets() { return A.period === 'week' ? Eco.stats.byDay(7) : Eco.stats.byMonth(6); }
  function prevBuckets() { return A.period === 'week' ? Eco.stats.byDay(14).slice(0, 7) : Eco.stats.byMonth(12).slice(0, 6); }
  function flat(bs) { return bs.reduce(function (a, b) { return a.concat(b.list); }, []); }
  function windowLabel() { return A.period === 'week' ? 'Last 7 days' : 'Last 6 months'; }
  function bucketName(b, i, n) {
    if (A.period === 'week') return i === n - 1 ? 'Today' : b.label;
    return b.label;
  }
  function bucketLong(b, i, n) {
    if (A.period === 'week') return fmt.dateLong(b.date);
    return fmt.months[b.date.getMonth()] + ' ' + b.date.getFullYear() + (i === n - 1 ? ' (so far)' : '');
  }

  /** "Nice" axis maximum and step for roughly `ticks` intervals. */
  function niceScale(max, ticks) {
    var raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    return { step: step, max: Math.ceil(max / step - 1e-9) * step };
  }
  function tickText(v, step) { return step >= 1 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1); }

  function deltaChip(cur, prev, prevCount, goodWhen, asPoints) {
    if (prevCount < 3 || !prev) return '';
    var diff = asPoints ? Math.round(cur - prev) : Math.round((cur - prev) / prev * 100);
    if (diff === 0) return '<span class="delta neutral">no change</span>';
    var up = diff > 0, good = goodWhen === 'neutral' ? null : (goodWhen === 'up') === up;
    return '<span class="delta ' + (good === null ? 'neutral' : good ? '' : 'bad') + '">' + ui.icon(up ? 'trending-up' : 'trending-down', 12) +
      (up ? '+' : '−') + Math.abs(diff) + (asPoints ? ' pts' : '%') + '<span class="sr-only"> versus the previous period</span></span>';
  }

  /* ---------- tiles (three double as the metric selector) ---------- */
  function renderTiles() {
    var bs = buckets(), cur = Eco.stats.totals(flat(bs));
    var pl = flat(prevBuckets()), prev = Eco.stats.totals(pl);
    var win = windowLabel();
    var vals = {
      km: { v: fmt.km(cur.km), d: deltaChip(cur.km, prev.km, prev.count, 'neutral') },
      co2: { v: fmt.co2(cur.co2g), d: deltaChip(cur.co2g, prev.co2g, prev.count, 'down') },
      saved: { v: fmt.co2(cur.savedG), d: deltaChip(cur.savedG, prev.savedG, prev.count, 'up') }
    };
    function metricTile(k) {
      var M = METRICS[k], sel = A.metric === k, x = vals[k];
      var unit = k === 'km' ? 'km' : x.v.u, value = k === 'km' ? x.v : x.v.v;
      return '<button type="button" class="stat-tile tone-' + M.tone + (sel ? ' selected' : '') + '" data-metric="' + k + '" aria-pressed="' + sel + '">' +
        '<div class="st-top"><span class="st-ic">' + ui.icon(M.icon, 18) + '</span>' + x.d + '</div>' +
        '<div class="st-val">' + value + '<small>' + unit + '</small></div><div class="st-label">' + (k === 'km' ? 'Total distance' : k === 'co2' ? 'Total emissions' : 'Carbon saved') + '</div><div class="st-sub">' + win + '</div></button>';
    }
    var tone = Eco.calc.scoreTone(cur.score || 0);
    $('#an-tiles').innerHTML = metricTile('km') + metricTile('co2') + metricTile('saved') +
      '<div class="stat-tile tone-' + (cur.count ? tone : 'grey') + '"><div class="st-top"><span class="st-ic">' + ui.icon('award', 18) + '</span>' + deltaChip(cur.score, prev.score, prev.count, 'up', true) + '</div>' +
      '<div class="st-val">' + (cur.count ? cur.score : '–') + '<small>/100</small></div><div class="st-label">Eco Score' + (cur.count ? ' · ' + Eco.calc.scoreLabel(cur.score) : '') + '</div><div class="st-sub">' + win + '</div></div>';
  }

  /* ---------- tooltip plumbing ---------- */
  function placeTip(host, tip, cx, topY) {
    var w = host.clientWidth, tw = tip.offsetWidth;
    var x = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, cx));
    var y = topY < tip.offsetHeight + 8 ? tip.offsetHeight + topY + 28 : topY;      // flip below when there is no room above
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function setTip(tip, value, label, key) {
    tip.textContent = '';
    var v = document.createElement('span'); v.className = 'tip-val';
    if (key) { var k = document.createElement('i'); k.className = 'tip-key'; v.appendChild(k); }
    v.appendChild(document.createTextNode(value));
    var l = document.createElement('span'); l.className = 'tip-lbl'; l.textContent = label;
    tip.appendChild(v); tip.appendChild(l);
  }
  function hideTips() { $$('.chart-tip.show').forEach(function (t) { t.classList.remove('show'); }); $$('.ch-bar.active,.ch-dot.active').forEach(function (e) { e.classList.remove('active'); }); $$('.ch-cross.show').forEach(function (e) { e.classList.remove('show'); }); }

  /** Wire hover (mouse), tap (touch) and keyboard focus to the same handler. */
  function wireHits(host, onShow) {
    $$('.ch-hit', host).forEach(function (r) {
      var i = +r.getAttribute('data-i');
      r.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') onShow(i); });
      r.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') { e.stopPropagation(); onShow(i); } });
      r.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') hideTips(); });
      r.addEventListener('focus', function () { onShow(i); });
      r.addEventListener('blur', hideTips);
    });
  }

  /* ---------- bar chart: single series, thin bars, extreme labelled ---------- */
  function drawBars() {
    var host = $('#an-bars'), M = METRICS[A.metric], bs = buckets(), n = bs.length;
    var vals = bs.map(M.get), max = Math.max.apply(null, vals);
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    $('#an-chart-title').textContent = M.title;
    $('#an-chart-sub').textContent = (A.period === 'week' ? 'Per day · last 7 days' : 'Per month · last 6 months') + (max > 0 ? ' · avg ' + M.val(total / n) + ' ' + (M.unit === 'km' ? 'km' : 'kg') : '');
    if (!(max > 0)) { host.innerHTML = '<div class="chart-empty">No journeys in this period yet.<br>Plan a trip and it will appear here.</div>'; return; }

    var W = host.clientWidth || 320, H = host.clientHeight || 218, m = { t: 22, r: 6, b: 26, l: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b, sc = niceScale(max, 3), slot = pw / n, bw = Math.min(24, slot * 0.5);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(M.title + ' ' + (A.period === 'week' ? 'per day' : 'per month')) + '">', t, i;
    for (t = 0; t <= sc.max + 1e-9; t += sc.step) {
      var y = m.t + ph - (t / sc.max) * ph;
      s += '<line class="' + (t === 0 ? 'ch-base' : 'ch-grid') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="ch-axis" x="' + (m.l - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + tickText(t, sc.step) + '</text>';
    }
    var maxI = vals.indexOf(max), tipY = [], cxs = [];
    for (i = 0; i < n; i++) {
      var cx = m.l + slot * i + slot / 2, h = vals[i] / sc.max * ph, x = cx - bw / 2, y2 = m.t + ph - h, r = Math.min(4, bw / 2, h);
      cxs.push(cx); tipY.push(y2);
      if (vals[i] > 0) {
        // 4px rounded data-end, square at the baseline
        s += '<path class="ch-bar" data-i="' + i + '" style="--i:' + i + '" d="M' + x.toFixed(1) + ' ' + (m.t + ph) + ' V' + (y2 + r).toFixed(1) + ' Q' + x.toFixed(1) + ' ' + y2.toFixed(1) + ' ' + (x + r).toFixed(1) + ' ' + y2.toFixed(1) +
          ' H' + (x + bw - r).toFixed(1) + ' Q' + (x + bw).toFixed(1) + ' ' + y2.toFixed(1) + ' ' + (x + bw).toFixed(1) + ' ' + (y2 + r).toFixed(1) + ' V' + (m.t + ph) + ' Z"/>';
      }
      var last = i === n - 1 && A.period === 'week';
      s += '<text class="ch-axis' + (last ? ' strong' : '') + '" x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(bucketName(bs[i], i, n)) + '</text>';
    }
    s += '<text class="ch-val" x="' + cxs[maxI].toFixed(1) + '" y="' + (tipY[maxI] - 6).toFixed(1) + '">' + M.val(vals[maxI]) + '</text>';
    for (i = 0; i < n; i++) {
      s += '<rect class="ch-hit" data-i="' + i + '" tabindex="0" role="img" x="' + (m.l + slot * i).toFixed(1) + '" y="' + m.t + '" width="' + slot.toFixed(1) + '" height="' + (ph + 20) + '" aria-label="' +
        esc(bucketLong(bs[i], i, n) + ': ' + M.val(vals[i]) + ' ' + (M.unit === 'km' ? 'kilometres' : 'kilograms') + ', ' + bs[i].count + ' journeys') + '"/>';
    }
    host.innerHTML = s + '</svg><div class="chart-tip" role="status"></div>';

    var tip = $('.chart-tip', host);
    wireHits(host, function (k) {
      hideTips();
      var bar = $('.ch-bar[data-i="' + k + '"]', host); if (bar) bar.classList.add('active');
      setTip(tip, vals[k] > 0 ? M.val(vals[k]) + ' ' + (M.unit === 'km' ? 'km' : 'kg ' + (A.metric === 'saved' ? 'saved' : 'CO₂')) : 'No journeys', bucketLong(bs[k], k, n) + (bs[k].count ? ' · ' + bs[k].count + ' journey' + (bs[k].count === 1 ? '' : 's') : ''));
      tip.classList.add('show'); placeTip(host, tip, cxs[k], vals[k] > 0 ? tipY[k] - 10 : m.t + ph - 6);
    });
  }

  /* ---------- line chart: Eco Score trend ---------- */
  function drawLine() {
    var host = $('#an-line'), bs = buckets(), n = bs.length;
    var pts = [], i;
    bs.forEach(function (b, k) { if (b.count > 0) pts.push({ i: k, v: b.score }); });
    $('#an-line-sub').textContent = (A.period === 'week' ? 'Per day' : 'Per month') + ' · weighted by distance';
    if (pts.length < 2) { host.innerHTML = '<div class="chart-empty">' + (pts.length ? 'One journey so far. Take another trip to see a trend.' : 'No journeys in this period yet.') + '</div>'; return; }

    var W = host.clientWidth || 320, H = host.clientHeight || 168, m = { t: 16, r: 14, b: 26, l: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b, slot = pw / n;
    var lo = Math.max(0, Math.floor((Math.min.apply(null, pts.map(function (p) { return p.v; })) - 8) / 10) * 10);
    var hi = Math.min(100, Math.ceil((Math.max.apply(null, pts.map(function (p) { return p.v; })) + 8) / 10) * 10);
    if (hi - lo < 20) hi = Math.min(100, lo + 20);
    var step = (hi - lo) <= 30 ? 10 : 20;
    var X = function (k) { return m.l + slot * k + slot / 2; }, Y = function (v) { return m.t + ph - (v - lo) / (hi - lo) * ph; };

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Eco Score trend">', t;
    for (t = lo; t <= hi + 1e-9; t += step) {
      s += '<line class="' + (t === lo ? 'ch-base' : 'ch-grid') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/>' +
        '<text class="ch-axis" x="' + (m.l - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + t + '</text>';
    }
    var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + X(p.i).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(' ');
    var len = 0; pts.forEach(function (p, k) { if (k) len += Math.hypot(X(p.i) - X(pts[k - 1].i), Y(p.v) - Y(pts[k - 1].v)); });
    s += '<path class="ch-wash" d="' + d + ' L' + X(pts[pts.length - 1].i).toFixed(1) + ' ' + (m.t + ph) + ' L' + X(pts[0].i).toFixed(1) + ' ' + (m.t + ph) + ' Z"/>';
    s += '<path class="ch-line ch-line-draw" style="--len:' + Math.ceil(len + 4) + '" d="' + d + '"/>';
    s += '<line class="ch-cross" id="an-cross" y1="' + m.t + '" y2="' + (m.t + ph) + '" x1="0" x2="0"/>';
    for (i = 0; i < n; i++) {
      s += '<text class="ch-axis' + (i === n - 1 && A.period === 'week' ? ' strong' : '') + '" x="' + X(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + esc(bucketName(bs[i], i, n)) + '</text>';
    }
    pts.forEach(function (p) { s += '<circle class="ch-dot" data-i="' + p.i + '" cx="' + X(p.i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="4"/>'; });
    var lastP = pts[pts.length - 1];
    s += '<text class="ch-val" x="' + Math.min(X(lastP.i), W - 18).toFixed(1) + '" y="' + (Y(lastP.v) - 11).toFixed(1) + '">' + lastP.v + '</text>';
    for (i = 0; i < n; i++) {
      s += '<rect class="ch-hit" data-i="' + i + '" tabindex="0" role="img" x="' + (m.l + slot * i).toFixed(1) + '" y="' + m.t + '" width="' + slot.toFixed(1) + '" height="' + (ph + 20) + '" aria-label="' +
        esc(bucketLong(bs[i], i, n) + ': ' + (bs[i].count ? 'Eco Score ' + bs[i].score : 'no journeys')) + '"/>';
    }
    host.innerHTML = s + '</svg><div class="chart-tip" role="status"></div>';

    var tip = $('.chart-tip', host), cross = $('#an-cross', host);
    wireHits(host, function (k) {
      hideTips();
      var b = bs[k], pt = pts.filter(function (p) { return p.i === k; })[0];
      cross.setAttribute('x1', X(k)); cross.setAttribute('x2', X(k)); cross.classList.add('show');
      var dot = $('.ch-dot[data-i="' + k + '"]', host); if (dot) dot.classList.add('active');
      setTip(tip, b.count ? 'Eco Score ' + b.score : 'No journeys', bucketLong(b, k, n) + (b.count ? ' · ' + Eco.calc.scoreLabel(b.score) : ''), !!b.count);
      tip.classList.add('show'); placeTip(host, tip, X(k), pt ? Y(pt.v) - 12 : m.t + ph - 6);
    });
  }

  /* ---------- ranked bars: part-to-whole by vehicle type ---------- */
  function drawRank() {
    var host = $('#an-rank'), list = flat(buckets()), rows = Eco.stats.byVehicleType(list);
    var total = rows.reduce(function (a, r) { return a + r.co2g; }, 0), max = rows.length ? rows[0].co2g : 0;
    $('#an-rank-sub').textContent = windowLabel() + (total ? ' · ' + fmt.co2Text(total) + ' in total' : '');
    if (!rows.length) { host.innerHTML = '<div class="chart-empty" style="height:80px">No journeys in this period yet.</div>'; return; }
    host.innerHTML = rows.map(function (r, i) {
      var vt = Eco.data.vehicleTypes[r.type], share = Math.round(r.co2g / total * 100), perKm = r.km ? Math.round(r.co2g / r.km) : 0;
      return '<div class="rank-row" tabindex="0" aria-label="' + esc(vt.label + ': ' + fmt.co2Text(r.co2g) + ', ' + share + ' percent of emissions, ' + r.count + ' journeys') + '">' +
        '<div class="rank-top"><span class="rank-name">' + ui.icon(vt.icon, 18) + esc(vt.label) + '</span><span class="rank-val">' + fmt.co2Text(r.co2g) + '<small>' + share + '%</small></span></div>' +
        '<div class="rank-track"><span class="rank-bar" style="--i:' + i + ';width:' + Math.max(2, r.co2g / max * 100).toFixed(1) + '%"></span></div>' +
        '<div class="rank-meta">' + r.count + ' journey' + (r.count === 1 ? '' : 's') + ' · ' + fmt.km(r.km) + ' km · ' + perKm + ' g/km</div></div>';
    }).join('');
  }

  /* ---------- table-view twins ---------- */
  function table(caption, head, rows) {
    return '<table class="data-table"><caption>' + esc(caption) + '</caption><thead><tr>' +
      head.map(function (h, i) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th>' + r.slice(1).map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table>';
  }
  function renderTables() {
    var bs = buckets(), n = bs.length, per = A.period === 'week' ? 'Day' : 'Month';
    $('#an-bars-table').innerHTML = table(METRICS[A.metric].title + ' per ' + per.toLowerCase(), [per, 'Distance (km)', 'CO₂ (kg)', 'Saved (kg)', 'Journeys'],
      bs.map(function (b, i) { return [bucketName(b, i, n) + (A.period === 'week' ? ' ' + b.date.getDate() : ''), fmt.km(b.km), (b.co2g / 1000).toFixed(2), (b.savedG / 1000).toFixed(2), String(b.count)]; }));
    $('#an-line-table').innerHTML = table('Eco Score per ' + per.toLowerCase(), [per, 'Eco Score', 'Journeys'],
      bs.map(function (b, i) { return [bucketName(b, i, n) + (A.period === 'week' ? ' ' + b.date.getDate() : ''), b.count ? String(b.score) : '–', String(b.count)]; }));
    var rows = Eco.stats.byVehicleType(flat(bs)), total = rows.reduce(function (a, r) { return a + r.co2g; }, 0);
    $('#an-rank-table').innerHTML = table('Emissions by vehicle type, ' + windowLabel().toLowerCase(), ['Vehicle', 'Journeys', 'Distance (km)', 'CO₂ (kg)', 'Share'],
      rows.map(function (r) { return [Eco.data.vehicleTypes[r.type].label, String(r.count), fmt.km(r.km), (r.co2g / 1000).toFixed(2), total ? Math.round(r.co2g / total * 100) + '%' : '–']; }));
  }
  function applyTableVisibility() {
    [['bars', '#an-bars'], ['line', '#an-line'], ['rank', '#an-rank']].forEach(function (c) {
      var on = A.table[c[0]];
      $(c[1]).classList.toggle('hidden', on); $('#an-' + c[0] + '-table').classList.toggle('hidden', !on);
      var b = $('[data-table-toggle="' + c[0] + '"]');
      b.setAttribute('aria-pressed', on); $('span', b).textContent = on ? 'Chart' : 'Table';
    });
  }

  /* ---------- goal meter (always "this month", outside the period filter) ---------- */
  function renderGoal() {
    var s = Eco.store.state, saved = Eco.stats.monthSavedKg(), goal = s.goalKg, pct = Math.min(100, saved / goal * 100);
    var now = new Date(), left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    var done = saved >= goal;
    $('#an-goal').innerHTML =
      '<span class="mi-ic" style="width:48px;height:48px;border-radius:16px">' + ui.icon(done ? 'award' : 'target', 24) + '</span>' +
      '<div class="gc-main"><p class="eyebrow">This month</p><h3>' + (done ? 'Goal reached!' : 'Carbon-saving goal') + '</h3>' +
      '<p><b style="color:var(--text)">' + saved.toFixed(1) + '</b> of ' + goal + ' kg saved · ' + (done ? 'keep it going' : left + ' day' + (left === 1 ? '' : 's') + ' left') + '</p>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + saved.toFixed(1) + '" aria-label="Carbon saved this month"><span style="width:' + pct.toFixed(1) + '%"></span></div></div>' +
      '<button type="button" class="icon-btn icon-btn-sm" data-action="goal-edit" aria-label="Edit monthly goal">' + ui.icon('pencil', 18) + '</button>';
  }
  function editGoal() {
    var s = Eco.store.state;
    ui.sheet({
      title: 'Monthly goal',
      html: '<p class="muted" style="margin-bottom:14px">How much CO₂ do you want to save compared with an average petrol car this month?</p>' +
        '<div class="bb-top" style="margin-bottom:4px"><span>Goal</span><b style="font-size:22px"><span id="goal-val">' + s.goalKg + '</span> kg</b></div>' +
        '<input type="range" class="range" id="goal-range" min="5" max="60" step="5" aria-label="Monthly goal in kilograms">' +
        '<div class="bc-scale" style="margin-bottom:18px"><span>5 kg</span><span>60 kg</span></div>' +
        '<button type="button" class="btn btn-primary btn-lg btn-block" id="goal-save">Save goal</button>',
      onMount: function (body, ctrl) {
        var r = $('#goal-range', body); r.value = s.goalKg; Eco.vehicles.paintRange(r);
        r.addEventListener('input', function () { Eco.vehicles.paintRange(r); $('#goal-val', body).textContent = r.value; });
        $('#goal-save', body).addEventListener('click', function () { s.goalKg = +r.value; Eco.store.save(); renderGoal(); ctrl.close(); ui.toast('Goal set to ' + r.value + ' kg', 'success'); });
      }
    });
  }

  /* ---------- orchestration ---------- */
  function renderAll() {
    applyTableVisibility();                    // first, so charts are measured while visible
    renderTiles(); drawBars(); drawLine(); drawRank(); renderTables(); renderGoal();
    Eco.icons.hydrate($('#screen-analytics'));
  }
  function swap() {
    var areas = $$('#screen-analytics .chart-area'); areas.forEach(function (a) { a.classList.add('updating'); });
    setTimeout(function () { renderAll(); areas.forEach(function (a) { a.classList.remove('updating'); }); }, 140);
  }

  function initAnalytics() {
    var seg = $('#an-seg');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-period]'); if (!b || b.getAttribute('data-period') === A.period) return;
      A.period = b.getAttribute('data-period');
      seg.style.setProperty('--i', A.period === 'week' ? 0 : 1);
      $$('.seg-btn', seg).forEach(function (x) { var on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
      swap();
    });
    $('#an-tiles').addEventListener('click', function (e) {
      var t = e.target.closest('[data-metric]'); if (!t || t.getAttribute('data-metric') === A.metric) return;
      A.metric = t.getAttribute('data-metric'); renderTiles(); drawBars(); renderTables(); Eco.icons.hydrate($('#an-tiles'));
    });
    $('#screen-analytics').addEventListener('click', function (e) {
      var t = e.target.closest('[data-table-toggle]'); if (!t) return;
      var k = t.getAttribute('data-table-toggle'); A.table[k] = !A.table[k]; applyTableVisibility();
      if (!A.table[k]) { drawBars(); drawLine(); }         // back to the chart: redraw at its real width
    });
    document.addEventListener('pointerdown', function (e) { if (!e.target.closest('.ch-hit')) hideTips(); });
    window.addEventListener('resize', ui.debounce(function () { if (Eco.nav.current() === 'analytics') { drawBars(); drawLine(); } }, 180));
    ui.actions['goal-edit'] = editGoal;
    Eco.nav.register('analytics', { enter: function () { renderAll(); } });
  }

  Eco.analytics = { journeyRow: journeyRow };
  Eco.onReady(function () { initHistory(); initAnalytics(); });
})();
