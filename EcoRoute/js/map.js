/* ==========================================================================
   EcoRoute - map.js
   1) Eco.geo : route geometry + simulated route metrics (grid-following paths)
   2) Eco.Map : a lightweight pan / zoom SVG map of a *stylised, fictional* city.

   No tiles, no network, no real coordinates. Everything is drawn locally,
   so the map is clearly a simulation and works fully offline.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var WORLD = Eco.data.WORLD;
  var W = WORLD.w, H = WORLD.h, G = WORLD.grid;

  /* =====================================================================
     Eco.geo : routes
     ===================================================================== */
  function snap(v) { return Math.round(v / G) * G; }
  function P(x, y) { return { x: x, y: y }; }
  function clampX(v) { return Math.max(100, Math.min(W - 100, v)); }
  function clampY(v) { return Math.max(100, Math.min(H - 100, v)); }

  /** Remove duplicate and collinear points so corners are real corners. */
  function clean(pts) {
    var out = [], i;
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], last = out[out.length - 1];
      if (last && last.x === p.x && last.y === p.y) continue;
      out.push(P(p.x, p.y));
    }
    var res = [out[0]];
    for (i = 1; i < out.length - 1; i++) {
      var a = res[res.length - 1], b = out[i], c = out[i + 1];
      var collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (!collinear) res.push(b);
    }
    res.push(out[out.length - 1]);
    return res;
  }

  /**
   * Waypoints (axis-aligned, on road lines) for one route kind.
   *  shortest: Z-shape through the middle of the bounding box (Manhattan minimum)
   *  fastest : sweeps out to the outer ring road on the x axis
   *  eco     : takes the green corridor on the other axis
   */
  function waypoints(o, d, kind) {
    var dx = d.x - o.x, dy = d.y - o.y, man = Math.abs(dx) + Math.abs(dy);
    var midX = (o.x + d.x) / 2, midY = (o.y + d.y) / 2, pts;
    var cX = function (xo) { return [o, P(xo, o.y), P(xo, d.y), d]; };
    var cY = function (yo) { return [o, P(o.x, yo), P(d.x, yo), d]; };

    if (kind === 'shortest') {
      if (dx === 0 || dy === 0) pts = [o, d];
      else if (Math.abs(dx) >= Math.abs(dy)) { var mx = snap(midX); pts = [o, P(mx, o.y), P(mx, d.y), d]; }
      else { var my = snap(midY); pts = [o, P(o.x, my), P(d.x, my), d]; }
    } else if (kind === 'fastest') {
      if (dy === 0) pts = cY(clampY(o.y + (o.y < H / 2 ? 200 : -200)));
      else if (man >= 900) pts = cX(midX >= W / 2 ? clampX(Math.max(o.x, d.x) + 200) : clampX(Math.min(o.x, d.x) - 200));
      else pts = [o, P(d.x, o.y), d];
    } else { // eco
      if (dx === 0) pts = cX(clampX(o.x + (o.x < W / 2 ? 100 : -100)));
      else if (man >= 900) pts = cY(midY >= H / 2 ? clampY(Math.max(o.y, d.y) + 100) : clampY(Math.min(o.y, d.y) - 100));
      else pts = [o, P(o.x, d.y), d];
    }
    return clean(pts);
  }

  function polyLen(pts) {
    var s = 0, i;
    for (i = 1; i < pts.length; i++) s += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    return s;
  }

  /** SVG path through the points with softly rounded corners. */
  function roundedPath(pts, r) {
    if (pts.length < 2) return '';
    var d = 'M' + pts[0].x + ' ' + pts[0].y, i;
    for (i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      var rr = Math.min(r, l1 / 2, l2 / 2);
      var p1 = P(b.x - (b.x - a.x) / l1 * rr, b.y - (b.y - a.y) / l1 * rr);
      var p2 = P(b.x + (c.x - b.x) / l2 * rr, b.y + (c.y - b.y) / l2 * rr);
      d += ' L' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1) + ' Q' + b.x + ' ' + b.y + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    d += ' L' + pts[pts.length - 1].x + ' ' + pts[pts.length - 1].y;
    return d;
  }

  function hash01(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }

  var GAP_KM = { shortest: 0, eco: 0.5, fastest: 1.0 };   // guarantees "shortest" really is the shortest

  /** Simulated metrics for one route kind between two places for a vehicle. */
  function routeMetrics(a, b, kind, vehicle, variant) {
    var kd = Eco.data.routeKinds[kind];
    var o = P(snap(a.x), snap(a.y)), d = P(snap(b.x), snap(b.y));
    var seed = a.id + '>' + b.id + ':' + kind + (variant ? '#' + variant : '');
    var jitter = hash01(seed), jitter2 = hash01(seed + 'x');
    var shortestKm = polyLen(waypoints(o, d, 'shortest')) * WORLD.kmPerUnit;
    var pts = waypoints(o, d, kind);
    var km = Math.max(polyLen(pts) * WORLD.kmPerUnit, shortestKm + GAP_KM[kind]);
    km = Math.round(km * 10) / 10;
    var speed = kd.speed * (0.94 + 0.12 * jitter);
    var timeMin = Math.max(2, Math.round(km / speed * 60));
    var flow = kd.flow * (0.97 + 0.06 * jitter2);
    var gKm = vehicle ? vehicle.gPerKm : 154;
    var co2g = Math.round(km * gKm * flow);
    return {
      kind: kind, points: pts, d: roundedPath(pts, 26), distanceKm: km, timeMin: timeMin,
      co2g: co2g, ecoScore: Eco.calc.ecoScore(co2g / km), flow: flow, avgSpeed: Math.round(km / (timeMin / 60)),
      signals: Math.max(2, Math.round(kd.signals * (0.8 + 0.4 * jitter) * Math.max(0.4, km / 12)))
    };
  }

  /** The three route options with their comparison badges. */
  function buildRoutes(a, b, vehicle, variant) {
    var routes = ['shortest', 'eco', 'fastest'].map(function (k) {      // card order: shortest first
      var m = routeMetrics(a, b, k, vehicle, variant);
      m.id = k; m.title = Eco.data.routeKinds[k].title; m.via = Eco.data.routeKinds[k].via; m.note = Eco.data.routeKinds[k].note;
      return m;
    });
    function argmin(key) { return routes.reduce(function (best, r) { return r[key] < best[key] ? r : best; }, routes[0]); }
    var s = argmin('distanceKm'), e = argmin('co2g'), f = argmin('timeMin');
    routes.forEach(function (r) { r.badges = []; });
    s.badges.push('shortest'); e.badges.push('eco'); f.badges.push('fastest');
    return routes;
  }

  Eco.geo = { snap: snap, waypoints: waypoints, polyLen: polyLen, roundedPath: roundedPath, routeMetrics: routeMetrics, buildRoutes: buildRoutes };

  /* =====================================================================
     Eco.Map : the SVG map component
     ===================================================================== */
  var baseMarkup = null;

  function buildBase() {
    if (baseMarkup) return baseMarkup;
    var s = [], i, j;
    var parks = { '6,2': 1, '7,2': 1, '6,3': 1, '7,3': 1, '1,12': 1, '2,12': 1, '1,13': 1, '2,13': 1, '3,5': 1, '9,13': 1, '4,10': 1, '10,2': 1, '5,14': 1, '2,8': 1 };

    s.push('<rect class="m-land" x="-600" y="-600" width="' + (W + 1200) + '" height="' + (H + 1200) + '"/>');
    // city blocks
    for (i = 0; i < W / G; i++) {
      for (j = 0; j < H / G; j++) {
        var isPark = parks[i + ',' + j];
        var inset = 10;
        var n = (i * 7 + j * 13) % 5;
        s.push('<rect class="' + (isPark ? 'm-park' : (n === 0 ? 'm-block m-block2' : 'm-block')) + '" x="' + (i * G + inset) + '" y="' + (j * G + inset) + '" width="' + (G - inset * 2) + '" height="' + (G - inset * 2) + '" rx="' + (isPark ? 16 : 8) + '"/>');
        // little buildings for texture
        if (!isPark && n > 1) {
          var bx = i * G + 22, by = j * G + 22, bw = 22 + (i * 5 + j) % 18, bh = 18 + (i + j * 3) % 20;
          s.push('<rect class="m-bldg" x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="4"/>');
          s.push('<rect class="m-bldg" x="' + (bx + bw + 8) + '" y="' + (by + 6) + '" width="' + (16 + (i + j) % 12) + '" height="' + (26 + (i * j) % 14) + '" rx="4"/>');
        }
      }
    }
    // river (roads are drawn after it so they read as bridges) + lake
    s.push('<path class="m-water-bank" d="M-300 975 C 200 935 400 995 600 955 S 1000 925 1500 985" fill="none"/>');
    s.push('<path class="m-water" d="M-300 975 C 200 935 400 995 600 955 S 1000 925 1500 985" fill="none"/>');
    // roads
    for (i = 0; i <= W / G; i++) {
      var maj = (i % 3 === 0);
      s.push('<line class="m-road' + (maj ? ' m-major' : '') + '" x1="' + i * G + '" y1="-600" x2="' + i * G + '" y2="' + (H + 600) + '"/>');
    }
    for (j = 0; j <= H / G; j++) {
      var majj = (j % 3 === 0);
      s.push('<line class="m-road' + (majj ? ' m-major' : '') + '" x1="-600" y1="' + j * G + '" x2="' + (W + 600) + '" y2="' + j * G + '"/>');
    }
    // lake sits above the roads so streets end at the shore instead of crossing the water
    s.push('<ellipse class="m-lake" cx="1190" cy="640" rx="86" ry="150"/>');
    // district labels
    [['NORTH HILLS', 330, 130], ['CITY CENTRE', 700, 720], ['SOUTH PARK', 760, 1480], ['WEST END', 90, 820], ['EAST QUARTER', 960, 850]].forEach(function (L) {
      s.push('<text class="m-district" x="' + L[1] + '" y="' + L[2] + '" text-anchor="middle">' + L[0] + '</text>');
    });
    baseMarkup = s.join('');
    return baseMarkup;
  }

  /** Marker body markup (drawn in screen px around the anchor point). */
  function markerMarkup(m) {
    var t = m.type, s = '';
    if (t === 'current') {
      s = '<circle class="mk-pulse" r="11"/><circle class="mk-cur-ring" r="11"/><circle class="mk-cur-dot" r="6.5"/>';
    } else if (t === 'start') {
      s = '<circle class="mk-start" r="7"/>';
    } else if (t === 'dest') {
      s = '<path class="mk-pin" d="M0 0 C -7 -10 -17 -19 -17 -31 a17 17 0 1 1 34 0 C 17 -19 7 -10 0 0 Z"/>' +
        '<g class="mk-pin-ic" transform="translate(0 -31)">' + Eco.icons.group(m.icon || 'flag', 18) + '</g>';
    } else if (t === 'station') {
      s = (m.selected ? '<circle class="mk-pulse mk-pulse-st" r="16"/>' : '') +
        '<circle class="mk-st mk-st-' + (m.status || 'available') + '" r="' + (m.selected ? 17 : 14) + '"/>' +
        '<g class="mk-ic-white">' + Eco.icons.group('zap', m.selected ? 18 : 15) + '</g>';
    } else if (t === 'vehicle') {
      s = '<circle class="mk-pulse" r="17"/><circle class="mk-veh" r="17"/><g class="mk-veh-ic" transform="rotate(' + (m.rotation || 0) + ')">' + Eco.icons.group('navigation-2', 20, 'fill="currentColor"') + '</g>';
    } else { // poi
      s = '<circle class="mk-poi' + (m.selected ? ' sel' : '') + '" r="' + (m.selected ? 15 : 12) + '"/><g class="mk-poi-ic">' + Eco.icons.group(m.icon || 'map-pin', m.selected ? 16 : 13) + '</g>';
    }
    if (m.label) s += '<text class="mk-label" y="' + (t === 'dest' ? 16 : (t === 'poi' || t === 'station' ? 28 : 26)) + '" text-anchor="middle">' + Eco.ui.esc(m.label) + '</text>';
    return s;
  }

  function create(container, opts) {
    opts = opts || {};
    var interactive = opts.interactive !== false;
    var minS = 0.2, maxS = opts.maxZoom || 1.9;
    var view = { cx: 600, cy: 800, s: opts.zoom || 0.4 };
    var wrap = document.createElement('div');
    wrap.className = 'map' + (interactive ? ' map-interactive' : ' map-static');
    wrap.innerHTML =
      '<svg class="map-svg" xmlns="' + NS + '" role="img" aria-label="' + Eco.ui.esc(opts.label || 'Simulated city map') + '">' +
      '<g class="map-vp"><g class="map-base">' + buildBase() + '</g><g class="map-routes"></g><g class="map-markers"></g></g></svg>';
    container.innerHTML = '';
    container.appendChild(wrap);
    var svg = wrap.querySelector('svg'), vp = wrap.querySelector('.map-vp');
    var routesG = wrap.querySelector('.map-routes'), markersG = wrap.querySelector('.map-markers');
    var size = { w: 1, h: 1 };
    var markers = {}, routes = {}, anim = null;

    function measure() {
      var r = wrap.getBoundingClientRect();
      size.w = r.width || container.clientWidth || 1; size.h = r.height || container.clientHeight || 1;
      // zoom out far enough that fit() can squeeze two distant points into a small free area between overlays
      minS = Math.max(size.w / (W + 2000), 0.08);
    }

    /** Keep the view centre near the city. Free enough that fit() with panel padding always works. */
    function clampView() {
      view.s = Math.max(minS, Math.min(maxS, view.s));
      view.cx = Math.max(-100, Math.min(W + 100, view.cx));
      view.cy = Math.max(-100, Math.min(H + 100, view.cy));
    }

    function apply() {
      measure(); clampView();
      var tx = size.w / 2 - view.cx * view.s, ty = size.h / 2 - view.cy * view.s;
      vp.setAttribute('transform', 'translate(' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ') scale(' + view.s.toFixed(4) + ')');
      var k = 1 / view.s;
      Object.keys(markers).forEach(function (id) {
        var mk = markers[id];
        mk.el.setAttribute('transform', 'translate(' + mk.x + ' ' + mk.y + ') scale(' + k.toFixed(4) + ')');
      });
      Object.keys(routes).forEach(function (id) {
        var r = routes[id];
        r.els.forEach(function (e) { e.el.setAttribute('stroke-width', (e.w * k).toFixed(3)); if (e.dash) e.el.setAttribute('stroke-dasharray', (e.dash[0] * k).toFixed(2) + ' ' + (e.dash[1] * k).toFixed(2)); });
        if (r.doneEl) r.applyDone();
      });
      wrap.classList.toggle('zoom-far', view.s < 0.46);
      wrap.classList.toggle('zoom-near', view.s > 0.9);
    }

    function setView(v, animateMs) {
      cancelAnim();
      var from = { cx: view.cx, cy: view.cy, s: view.s };
      var to = { cx: v.cx != null ? v.cx : view.cx, cy: v.cy != null ? v.cy : view.cy, s: v.s != null ? v.s : view.s };
      if (!animateMs) { view.cx = to.cx; view.cy = to.cy; view.s = to.s; apply(); return; }
      var t0 = performance.now();
      (function step(now) {
        var p = Math.min(1, (now - t0) / animateMs), e = 1 - Math.pow(1 - p, 3);
        view.cx = from.cx + (to.cx - from.cx) * e; view.cy = from.cy + (to.cy - from.cy) * e;
        view.s = from.s * Math.pow(to.s / from.s, e);
        apply();
        if (p < 1) anim = requestAnimationFrame(step); else anim = null;
      })(t0);
    }
    function cancelAnim() { if (anim) { cancelAnimationFrame(anim); anim = null; } }

    function zoomAt(factor, px, py) {
      measure();
      var ns = Math.max(minS, Math.min(maxS, view.s * factor));
      if (px == null) { px = size.w / 2; py = size.h / 2; }
      var wx = view.cx + (px - size.w / 2) / view.s, wy = view.cy + (py - size.h / 2) / view.s;
      view.s = ns; view.cx = wx - (px - size.w / 2) / ns; view.cy = wy - (py - size.h / 2) / ns;
      apply();
    }

    /** Fit world points into the viewport. pad = [top, right, bottom, left] in px. */
    function fit(points, o) {
      o = o || {};
      measure();
      var pad = o.pad || [40, 40, 40, 40];
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      points.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      var bw = Math.max(maxX - minX, 120), bh = Math.max(maxY - minY, 120);
      var aw = size.w - pad[1] - pad[3], ah = size.h - pad[0] - pad[2];
      var s = Math.max(minS, Math.min(o.maxZoom || 1.3, Math.min(aw / bw, ah / bh)));
      var acx = pad[3] + aw / 2, acy = pad[0] + ah / 2;
      var cx = (minX + maxX) / 2 - (acx - size.w / 2) / s, cy = (minY + maxY) / 2 - (acy - size.h / 2) / s;
      setView({ cx: cx, cy: cy, s: s }, o.animate);
    }

    /* ---- markers ---- */
    function setMarkers(list) {
      markersG.innerHTML = ''; markers = {};
      list.forEach(function (m) {
        var g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'mk mk-' + m.type + (m.cls ? ' ' + m.cls : ''));
        g.setAttribute('data-id', m.id);
        g.innerHTML = markerMarkup(m);
        markersG.appendChild(g);
        markers[m.id] = { el: g, x: m.x, y: m.y, def: m };
      });
      // keep the current location / vehicle above everything else
      ['vehicle', 'current'].forEach(function (t) { Object.keys(markers).forEach(function (id) { if (markers[id].def.type === t) markersG.appendChild(markers[id].el); }); });
      apply();
    }
    function moveMarker(id, x, y, rotation) {
      var mk = markers[id]; if (!mk) return;
      mk.x = x; mk.y = y;
      mk.el.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(' + (1 / view.s).toFixed(4) + ')');
      if (rotation != null) { var ic = mk.el.querySelector('.mk-veh-ic'); if (ic) ic.setAttribute('transform', 'rotate(' + rotation.toFixed(1) + ')'); }
    }

    /* ---- routes ---- */
    function setRoutes(list) {
      routesG.innerHTML = ''; routes = {};
      // draw inactive routes first so the active one sits on top
      list.slice().sort(function (a, b) { return (a.active ? 1 : 0) - (b.active ? 1 : 0); }).forEach(function (r) {
        var g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'route' + (r.active ? ' active' : ' dim') + (r.cls ? ' ' + r.cls : ''));
        g.setAttribute('data-id', r.id);
        var w = r.active ? (r.width || 7) : 5;
        var els = [];
        function add(cls, width, dash) {
          var p = document.createElementNS(NS, 'path');
          p.setAttribute('d', r.d); p.setAttribute('class', cls);
          p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
          if (r.color && cls === 'route-line') p.style.stroke = r.color;
          g.appendChild(p); els.push({ el: p, w: width, dash: dash }); return p;
        }
        add('route-casing', w + 5);
        var line = add('route-line', w, r.dashed ? [1, 12] : null);
        var rec = { g: g, els: els, line: line, d: r.d };
        if (r.progress) {
          var done = add('route-done', w);
          rec.doneEl = done; rec.travelled = 0;
          rec.applyDone = function () { done.setAttribute('stroke-dasharray', (rec.travelled).toFixed(1) + ' 100000'); };
          rec.applyDone();
        }
        routesG.appendChild(g);
        routes[r.id] = rec;
      });
      apply();
    }
    function routeLength(id) { var r = routes[id]; return r ? r.line.getTotalLength() : 0; }
    function pointAt(id, len) {
      var r = routes[id]; if (!r) return null;
      var total = r.line.getTotalLength(), L = Math.max(0, Math.min(total, len));
      var p = r.line.getPointAtLength(L), q = r.line.getPointAtLength(Math.min(total, L + 6)), q0 = r.line.getPointAtLength(Math.max(0, L - 6));
      var ang = Math.atan2(q.x - q0.x, -(q.y - q0.y)) * 180 / Math.PI;
      return { x: p.x, y: p.y, angle: ang, total: total };
    }
    function setProgress(id, len) { var r = routes[id]; if (r && r.doneEl) { r.travelled = len; r.applyDone(); } }
    function setActiveRoute(id) {
      Object.keys(routes).forEach(function (k) {
        var a = k === id;
        routes[k].g.classList.toggle('active', a); routes[k].g.classList.toggle('dim', !a);
        var w = a ? 7 : 5;
        routes[k].els.forEach(function (e, i) { e.w = i === 0 ? w + 5 : w; });
        if (a) routesG.appendChild(routes[k].g);
      });
      apply();
    }

    /* ---- interaction ---- */
    var pointers = {}, moved = 0, lastMid = null, lastDist = 0, suppressClick = false;
    function onDown(e) {
      cancelAnim();
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = 0; suppressClick = false;
      var ids = Object.keys(pointers);
      if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      wrap.classList.add('dragging');
    }
    function onMove(e) {
      var p = pointers[e.pointerId]; if (!p) return;
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        var dx = e.clientX - p.x, dy = e.clientY - p.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) suppressClick = true;
        view.cx -= dx / view.s; view.cy -= dy / view.s;
        p.x = e.clientX; p.y = e.clientY;
        apply();
        if (opts.onUserMove) opts.onUserMove();
      } else if (ids.length === 2) {
        p.x = e.clientX; p.y = e.clientY;
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        var rect = wrap.getBoundingClientRect();
        if (lastDist) zoomAt(dist / lastDist, mid.x - rect.left, mid.y - rect.top);
        if (lastMid) { view.cx -= (mid.x - lastMid.x) / view.s; view.cy -= (mid.y - lastMid.y) / view.s; apply(); }
        lastDist = dist; lastMid = mid; suppressClick = true;
        if (opts.onUserMove) opts.onUserMove();
      }
    }
    function onUp(e) {
      delete pointers[e.pointerId];
      if (!Object.keys(pointers).length) wrap.classList.remove('dragging');
      lastMid = null; lastDist = 0;
    }
    function onWheel(e) {
      e.preventDefault();
      var rect = wrap.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - rect.left, e.clientY - rect.top);
      if (opts.onUserMove) opts.onUserMove();
    }
    function onClick(e) {
      if (suppressClick) { suppressClick = false; return; }
      var mk = e.target.closest('.mk');
      if (mk && opts.onMarkerClick) { opts.onMarkerClick(mk.getAttribute('data-id'), markers[mk.getAttribute('data-id')] && markers[mk.getAttribute('data-id')].def); return; }
      var rt = e.target.closest('.route');
      if (rt && opts.onRouteClick) { opts.onRouteClick(rt.getAttribute('data-id')); return; }
      if (opts.onMapClick) {
        var rect = wrap.getBoundingClientRect();
        opts.onMapClick({ x: view.cx + (e.clientX - rect.left - size.w / 2) / view.s, y: view.cy + (e.clientY - rect.top - size.h / 2) / view.s });
      }
    }

    if (interactive) {
      svg.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      svg.addEventListener('wheel', onWheel, { passive: false });
      svg.addEventListener('click', onClick);
      svg.addEventListener('dblclick', function (e) { var r = wrap.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top); });
      if (opts.controls !== false) {
        var ctl = document.createElement('div');
        ctl.className = 'map-ctrl';
        ctl.innerHTML =
          '<button type="button" class="map-btn" data-z="in" aria-label="Zoom in">' + Eco.icons.svg('plus', 18) + '</button>' +
          '<button type="button" class="map-btn" data-z="out" aria-label="Zoom out">' + Eco.icons.svg('minus', 18) + '</button>' +
          (opts.onLocate ? '<button type="button" class="map-btn map-btn-loc" data-z="loc" aria-label="My location">' + Eco.icons.svg('locate-fixed', 18) + '</button>' : '');
        ctl.addEventListener('click', function (e) {
          var b = e.target.closest('[data-z]'); if (!b) return;
          var z = b.getAttribute('data-z');
          if (z === 'in') zoomAt(1.4); else if (z === 'out') zoomAt(1 / 1.4); else if (opts.onLocate) opts.onLocate();
        });
        wrap.appendChild(ctl);
      }
    }

    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { apply(); }); ro.observe(wrap); }
    measure(); apply();

    return {
      el: wrap, svg: svg, setView: setView, fit: fit, zoomAt: zoomAt, resize: apply,
      setMarkers: setMarkers, moveMarker: moveMarker, setRoutes: setRoutes, routeLength: routeLength, pointAt: pointAt,
      setProgress: setProgress, setActiveRoute: setActiveRoute, getView: function () { return { cx: view.cx, cy: view.cy, s: view.s }; },
      centerOn: function (x, y, s, ms) { setView({ cx: x, cy: y, s: s }, ms); },
      destroy: function () {
        cancelAnim();
        if (ro) ro.disconnect();
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
        container.innerHTML = '';
      }
    };
  }

  /**
   * Padding [top, right, bottom, left] that keeps points clear of UI floating over a full-screen map.
   * Measured from the real elements so it stays right on any screen size / panel content.
   * extra = { top, right, bottom, left } adds breathing room (e.g. the height of a pin).
   */
  function overlayPads(mapEl, topEl, bottomEl, extra) {
    extra = extra || {};
    var m = mapEl.getBoundingClientRect();
    var t = topEl ? Math.max(0, topEl.getBoundingClientRect().bottom - m.top) : 0;
    var b = bottomEl ? Math.max(0, m.bottom - bottomEl.getBoundingClientRect().top) : 0;
    return [t + (extra.top || 0), extra.right || 0, b + (extra.bottom || 0), extra.left || 0];
  }

  Eco.Map = { create: create, overlayPads: overlayPads };
})();
