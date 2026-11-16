/* ==========================================================================
   EcoRoute - map.js
   Eco.Map: the map component of every screen. A real map: Leaflet + OpenStreetMap tiles.

   Eco.Map.create(container, opts) returns an object with
     setMarkers(list) moveMarker(id, lat, lon, rotation)      markers: current | start | dest | vehicle | station | poi
     setRoutes(list)  setProgress(id, metres) setActiveRoute(id) pointAt(id, metres) routeLength(id)
     fit(points, { pad:[top,right,bottom,left], maxZoom, animate })  setView({ lat, lon, zoom }, ms)  getView()
     follow(lat, lon, offsetPx, zoom, ms)  resize()  destroy()  setAttributionOffset(px)
   opts: interactive, controls, label, maxZoom, center, zoom, onUserMove, onMarkerClick(id, def), onRouteClick(id),
         onMapClick({ lat, lon }), onLocate
   Every point is { lat, lon }.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';
  var C = window.ECOROUTE_CONFIG || {};
  var NO_VIEW = { lat: 20.5937, lon: 78.9629, zoom: 4.5 };          // India, until we know where the user is
  var Z = { poi: 100, station: 200, start: 400, dest: 500, current: 900, vehicle: 1000 };

  function esc(s) { return Eco.ui.esc(s); }
  function ic(name, size) { return Eco.icons.svg(name, size); }

  /** What a marker looks like: { html, size, anchor } (anchor = the pixel that sits on the coordinate). */
  function markerSpec(m) {
    var t = m.type, lab = m.label ? '<span class="mk-label">' + esc(m.label) + '</span>' : '';
    if (t === 'current') return { html: '<div class="mk mk-current"><i class="mk-pulse"></i><i class="mk-ring"></i><i class="mk-dot"></i></div>', size: [30, 30], anchor: [15, 15] };
    if (t === 'start') return { html: '<div class="mk mk-start"><i></i></div>', size: [22, 22], anchor: [11, 11] };
    if (t === 'dest') return { html: '<div class="mk mk-dest"><svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true"><path d="M17 43C10 33 0 26 0 15a17 17 0 1 1 34 0C34 26 24 33 17 43Z"/></svg><span class="mk-dest-ic">' + ic(m.icon || 'flag', 17) + '</span>' + lab + '</div>', size: [34, 44], anchor: [17, 43] };
    if (t === 'station') {
      var s = m.selected ? 38 : 32;
      return { html: '<div class="mk mk-station st-' + (m.status || 'unknown') + (m.selected ? ' sel' : '') + '">' + ic('zap', m.selected ? 19 : 16) + lab + '</div>', size: [s, s], anchor: [s / 2, s / 2] };
    }
    if (t === 'vehicle') return { html: '<div class="mk mk-vehicle"><i class="mk-pulse"></i><span class="mk-veh-body"><span class="mk-veh-rot" style="transform:rotate(' + (m.rotation || 0) + 'deg)">' + Eco.icons.svg('navigation-2', 20, 'mk-veh-svg') + '</span></span></div>', size: [38, 38], anchor: [19, 19] };
    return { html: '<div class="mk mk-poi' + (m.selected ? ' sel' : '') + '">' + ic(m.icon || 'map-pin', 15) + lab + '</div>', size: [30, 30], anchor: [15, 15] };
  }
  function signature(m) { return [m.type, m.icon, m.label, m.status, m.selected ? 1 : 0].join('|'); }

  function create(container, opts) {
    opts = opts || {};
    if (!window.L) throw new Error('The map library (Leaflet) did not load.');
    var interactive = opts.interactive !== false;
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'map' + (interactive ? ' map-interactive' : ' map-static');
    var host = document.createElement('div');
    host.className = 'eco-map';
    host.setAttribute('role', 'region'); host.setAttribute('aria-label', opts.label || 'Map');
    wrap.appendChild(host);
    container.appendChild(wrap);

    var map = L.map(host, {
      zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: opts.maxZoom || 19, zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 90,
      dragging: interactive, touchZoom: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, boxZoom: false, keyboard: false, tap: false,
      inertia: true, worldCopyJump: false
    });
    var tiles = L.tileLayer(C.tiles, { maxZoom: 19, minZoom: 2, updateWhenIdle: !interactive, keepBuffer: 2 }).addTo(map);
    var attr = L.control.attribution({ prefix: false, position: 'bottomright' }).addAttribution(C.tileAttribution).addTo(map);
    var c0 = opts.center || NO_VIEW;
    map.setView([c0.lat, c0.lon], opts.zoom != null ? opts.zoom : (opts.center ? 15 : NO_VIEW.zoom), { animate: false });

    // when tiles cannot be fetched (offline), say so instead of showing an empty grey map
    var off = document.createElement('div');
    off.className = 'map-offline'; off.setAttribute('role', 'status'); off.textContent = 'The map can’t load. Check your internet connection.';
    wrap.appendChild(off);
    var tileErrors = 0;
    tiles.on('tileerror', function () { if (++tileErrors > 3) wrap.classList.add('tiles-offline'); });
    tiles.on('tileload', function () { tileErrors = 0; wrap.classList.remove('tiles-offline'); });

    var markers = {}, routes = {}, routesLayer = L.layerGroup().addTo(map), markersLayer = L.layerGroup().addTo(map), programmatic = 0;

    /* ---- user interaction ---- */
    function userMoved() { if (opts.onUserMove) opts.onUserMove(); }
    map.on('dragstart', userMoved);
    map.on('zoomstart', function () { if (!programmatic) userMoved(); });
    map.on('moveend', function () { programmatic = 0; });
    if (opts.onMapClick) map.on('click', function (e) { opts.onMapClick({ lat: e.latlng.lat, lon: e.latlng.lng }); });

    /* ---- view ---- */
    function setView(v, ms) {
      programmatic = 1;
      var cur = map.getCenter();
      map.setView([v.lat != null ? v.lat : cur.lat, v.lon != null ? v.lon : cur.lng], v.zoom != null ? v.zoom : map.getZoom(), { animate: !!ms, duration: (ms || 0) / 1000 });
    }
    function getView() { var c = map.getCenter(); return { lat: c.lat, lon: c.lng, zoom: map.getZoom() }; }
    /** Centre on a point, shifted by offsetPx downwards (so it sits above a panel that covers the bottom of the map). */
    function follow(lat, lon, offsetPx, zoom, ms) {
      var z = zoom != null ? zoom : map.getZoom(), p = map.project([lat, lon], z);
      p.y += offsetPx || 0;
      var c = map.unproject(p, z);
      programmatic = 1;
      map.setView(c, z, { animate: !!ms, duration: (ms || 0) / 1000 });
    }
    function fit(points, o) {
      o = o || {};
      var pts = (points || []).filter(function (p) { return p && isFinite(p.lat) && isFinite(p.lon); });
      if (!pts.length) return;
      var pad = o.pad || [40, 40, 40, 40], b = L.latLngBounds(pts.map(function (p) { return [p.lat, p.lon]; }));
      programmatic = 1;
      map.invalidateSize(false);
      map.fitBounds(b, { paddingTopLeft: [pad[3], pad[0]], paddingBottomRight: [pad[1], pad[2]], maxZoom: o.maxZoom || 17, animate: !!o.animate, duration: (o.animate || 0) / 1000 });
    }
    function resize() { map.invalidateSize(false); }

    /* ---- markers ---- */
    function build(m) {
      var s = markerSpec(m), icon = L.divIcon({ className: 'eco-mk', html: s.html, iconSize: s.size, iconAnchor: s.anchor });
      return { icon: icon, z: (Z[m.type] || 0) + (m.selected ? 100 : 0) };
    }
    function setMarkers(list) {
      var keep = {};
      list.forEach(function (m) {
        keep[m.id] = true;
        var rec = markers[m.id];
        if (rec && rec.sig === signature(m)) { rec.def = m; rec.m.setLatLng([m.lat, m.lon]); return; }
        if (rec) { markersLayer.removeLayer(rec.m); }
        var b = build(m);
        var mk = L.marker([m.lat, m.lon], { icon: b.icon, zIndexOffset: b.z, keyboard: false, interactive: !!(opts.onMarkerClick && m.type !== 'current' && m.type !== 'vehicle' && m.type !== 'start'), riseOnHover: false });
        if (opts.onMarkerClick) mk.on('click', function () { opts.onMarkerClick(m.id, markers[m.id] && markers[m.id].def); });
        mk.addTo(markersLayer);
        markers[m.id] = { m: mk, def: m, sig: signature(m) };
      });
      Object.keys(markers).forEach(function (id) { if (!keep[id]) { markersLayer.removeLayer(markers[id].m); delete markers[id]; } });
    }
    function moveMarker(id, lat, lon, rotation) {
      var rec = markers[id]; if (!rec) return;
      rec.m.setLatLng([lat, lon]);
      if (rotation != null) { var el = rec.m.getElement(), r = el && el.querySelector('.mk-veh-rot'); if (r) r.style.transform = 'rotate(' + rotation.toFixed(1) + 'deg)'; }
    }

    /* ---- routes ---- */
    function setRoutes(list) {
      routesLayer.clearLayers(); routes = {};
      list.slice().sort(function (a, b) { return (a.active ? 1 : 0) - (b.active ? 1 : 0); }).forEach(function (r) {   // the active route is drawn last, on top
        var ll = r.points.map(function (p) { return [p.lat, p.lon]; }), w = r.active ? (r.width || 7) : 5;
        var base = { lineCap: 'round', lineJoin: 'round', smoothFactor: 1.2, noClip: false };
        var casing = L.polyline(ll, Object.assign({ className: 'rt rt-casing', weight: w + 5, interactive: false }, base));
        var line = L.polyline(ll, Object.assign({ className: 'rt rt-line ' + (r.active ? 'active' : 'dim'), weight: w, interactive: !!opts.onRouteClick }, base));
        var done = r.progress ? L.polyline([], Object.assign({ className: 'rt rt-done', weight: w, interactive: false }, base)) : null;
        casing.addTo(routesLayer); line.addTo(routesLayer); if (done) done.addTo(routesLayer);
        if (opts.onRouteClick) line.on('click', function () { opts.onRouteClick(r.id); });
        routes[r.id] = { id: r.id, points: r.points, cum: r.cum || Eco.geo.cumulative(r.points), casing: casing, line: line, done: done, travelled: 0, drawn: -1, at: 0 };
      });
    }
    function routeLength(id) { var r = routes[id]; return r ? r.cum[r.cum.length - 1] : 0; }
    function pointAt(id, d) { var r = routes[id]; return r ? Eco.geo.pointAt(r.points, r.cum, d) : null; }
    function setProgress(id, d) {
      var r = routes[id]; if (!r || !r.done) return;
      var now = performance.now();
      if (Math.abs(d - r.drawn) < 2 || (now - r.at < 120 && d < routeLength(id) - 1)) return;       // a few redraws a second are plenty
      r.drawn = d; r.at = now;
      var p = Eco.geo.pointAt(r.points, r.cum, d), upto = r.points.slice(0, p.idx + 1).map(function (q) { return [q.lat, q.lon]; });
      upto.push([p.lat, p.lon]);
      r.done.setLatLngs(d > 1 ? upto : []);
    }
    function setActiveRoute(id) {
      Object.keys(routes).forEach(function (k) {
        var r = routes[k], a = k === id, w = a ? 7 : 5, el = r.line.getElement();
        if (el) { el.classList.toggle('active', a); el.classList.toggle('dim', !a); }
        r.line.setStyle({ weight: w }); r.casing.setStyle({ weight: w + 5 });
        if (a) { r.casing.bringToFront(); r.line.bringToFront(); }
      });
    }

    /* ---- controls ---- */
    if (interactive && opts.controls !== false) {
      var ctl = document.createElement('div');
      ctl.className = 'map-ctrl';
      ctl.innerHTML =
        '<button type="button" class="map-btn" data-z="in" aria-label="Zoom in">' + ic('plus', 18) + '</button>' +
        '<button type="button" class="map-btn" data-z="out" aria-label="Zoom out">' + ic('minus', 18) + '</button>' +
        (opts.onLocate ? '<button type="button" class="map-btn map-btn-loc" data-z="loc" aria-label="My location">' + ic('locate-fixed', 18) + '</button>' : '');
      L.DomEvent.disableClickPropagation(ctl);
      ctl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-z]'); if (!b) return;
        var z = b.getAttribute('data-z');
        if (z === 'in') { userMoved(); map.zoomIn(); } else if (z === 'out') { userMoved(); map.zoomOut(); } else if (opts.onLocate) opts.onLocate();
      });
      wrap.appendChild(ctl);
    }

    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { map.invalidateSize(false); }); ro.observe(wrap); }
    setTimeout(function () { map.invalidateSize(false); }, 50);              // the screen may still be sliding in

    return {
      el: wrap, leaflet: map, setView: setView, getView: getView, follow: follow, fit: fit, resize: resize,
      setMarkers: setMarkers, moveMarker: moveMarker, setRoutes: setRoutes, setProgress: setProgress, setActiveRoute: setActiveRoute,
      routeLength: routeLength, pointAt: pointAt,
      zoomTo: function (z, ms) { programmatic = 1; map.setZoom(z, { animate: !!ms }); },
      setAttributionOffset: function (px) { var c = attr.getContainer(); if (c) c.style.marginBottom = Math.max(0, px) + 'px'; },
      destroy: function () { if (ro) ro.disconnect(); try { map.remove(); } catch (e) { /* already gone */ } container.innerHTML = ''; }
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

  Eco.Map = { create: create, overlayPads: overlayPads, NO_VIEW: NO_VIEW };
})();
