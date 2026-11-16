/* ==========================================================================
   EcoRoute - ui.js
   Shared UI toolkit: DOM helpers, formatters, toast, confirm dialog,
   bottom sheet, score ring, count-up and the global data-* click router.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

  /* ---------- DOM helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { /* not supported */ } }
  function icon(name, size, cls) { return Eco.icons.svg(name, size || 20, cls); }

  /* ---------- Formatters ---------- */
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  var fmt = {
    km: function (n) { return (Math.round(n * 10) / 10).toFixed(1); },
    /** Returns { v, u } so the unit can be styled separately. */
    co2: function (g) {
      g = Math.max(0, g);
      if (g >= 1000) return { v: (g / 1000).toFixed(g >= 100000 ? 0 : g >= 10000 ? 1 : 2), u: 'kg' };
      return { v: String(Math.round(g)), u: 'g' };
    },
    co2Text: function (g) { var c = fmt.co2(g); return c.v + ' ' + c.u; },
    dur: function (min) {
      min = Math.max(0, Math.round(min));
      if (min < 60) return min + ' min';
      var hr = Math.floor(min / 60), m = min % 60;
      return hr + ' h' + (m ? ' ' + m + ' min' : '');
    },
    clock: function (d) {
      d = new Date(d);
      var hr = d.getHours(), m = d.getMinutes(), ap = hr >= 12 ? 'PM' : 'AM';
      hr = hr % 12 || 12;
      return hr + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
    },
    dateShort: function (d) { d = new Date(d); return d.getDate() + ' ' + MONTHS[d.getMonth()]; },
    dateLong: function (d) { d = new Date(d); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); },
    /** "Today", "Yesterday", "Mon, 3 Mar" */
    dayLabel: function (d) {
      var diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      d = new Date(d);
      return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    },
    mmss: function (sec) { sec = Math.max(0, Math.floor(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; },
    days: DAYS, months: MONTHS
  };

  /* ---------- Toast ---------- */
  var toastTimers = [];
  function toast(msg, type, opts) {
    var root = $('#toast-root'); if (!root) return;
    opts = opts || {};
    type = type || 'info';
    var ic = { success: 'check-circle', error: 'alert-circle', warn: 'alert-triangle', info: 'info' }[type] || 'info';
    var el = h('<div class="toast toast-' + type + '" role="status"><span class="toast-ic">' + icon(opts.icon || ic, 18) + '</span><span class="toast-msg">' + esc(msg) + '</span></div>');
    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstElementChild);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, opts.duration || 2800);
  }

  /* ---------- Confirm dialog (returns a Promise<boolean>) ---------- */
  function confirmDialog(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var root = $('#dialog-root');
      var tone = o.danger ? 'danger' : 'primary';
      var el = h(
        '<div class="dialog-backdrop"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">' +
        '<div class="dialog-ic dialog-ic-' + tone + '">' + icon(o.icon || (o.danger ? 'alert-triangle' : 'help-circle'), 26) + '</div>' +
        '<h3 id="dlg-title" class="dialog-title">' + esc(o.title || 'Are you sure?') + '</h3>' +
        '<p class="dialog-text">' + esc(o.message || '') + '</p>' +
        '<div class="dialog-actions">' +
        '<button type="button" class="btn btn-secondary" data-r="0">' + esc(o.cancelText || 'Cancel') + '</button>' +
        '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-r="1">' + esc(o.confirmText || 'Confirm') + '</button>' +
        '</div></div></div>');
      root.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('show'); });
      var done = false;
      function close(r) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey);
        el.classList.remove('show');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
        resolve(r);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      document.addEventListener('keydown', onKey);
      el.addEventListener('click', function (e) {
        if (e.target === el) return close(false);
        var b = e.target.closest('[data-r]'); if (b) close(b.getAttribute('data-r') === '1');
      });
      var first = el.querySelector('[data-r="1"]'); if (first) first.focus();
    });
  }

  /* ---------- Bottom sheet ---------- */
  var openSheets = [];
  function sheet(o) {
    o = o || {};
    var root = $('#sheet-root');
    var el = h(
      '<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-grab" aria-hidden="true"></div>' +
      (o.title ? '<div class="sheet-head"><h3 class="sheet-title">' + esc(o.title) + '</h3><button type="button" class="icon-btn icon-btn-sm" data-sheet-close aria-label="Close">' + icon('x', 18) + '</button></div>' : '') +
      '<div class="sheet-body">' + (o.html || '') + '</div></div></div>');
    root.appendChild(el);
    var panel = el.querySelector('.sheet');
    Eco.icons.hydrate(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    var closed = false;
    var ctrl = {
      el: el, body: el.querySelector('.sheet-body'),
      close: function () {
        if (closed) return; closed = true;
        el.classList.remove('show');
        openSheets = openSheets.filter(function (s) { return s !== ctrl; });
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (o.onClose) o.onClose(); }, 280);
      }
    };
    openSheets.push(ctrl);
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('[data-sheet-close]')) ctrl.close();
    });

    // drag the grab handle down to dismiss
    var grab = el.querySelector('.sheet-grab'), startY = null, dy = 0;
    function down(e) { startY = (e.touches ? e.touches[0] : e).clientY; dy = 0; panel.style.transition = 'none'; }
    function move(e) {
      if (startY == null) return;
      dy = Math.max(0, (e.touches ? e.touches[0] : e).clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
    }
    function up() {
      if (startY == null) return;
      panel.style.transition = ''; panel.style.transform = '';
      if (dy > 90) ctrl.close();
      startY = null;
    }
    grab.addEventListener('touchstart', down, { passive: true });
    grab.addEventListener('touchmove', move, { passive: true });
    grab.addEventListener('touchend', up);
    grab.addEventListener('mousedown', function (e) { down(e); window.addEventListener('mousemove', move); window.addEventListener('mouseup', function u() { up(); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', u); }); });

    if (o.onMount) o.onMount(ctrl.body, ctrl);
    return ctrl;
  }
  function closeAllSheets() { openSheets.slice().forEach(function (s) { s.close(); }); }
  /** Dismiss every open confirm dialog as "cancelled" (each one closes itself on Escape). Used when the screen under it goes away. */
  function closeDialogs() { if ($('#dialog-root .dialog-backdrop')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }
  function hasOpenSheet() { return openSheets.length > 0; }

  /* ---------- Score ring (SVG) ---------- */
  function ring(o) {
    var size = o.size || 64, stroke = o.stroke || 7, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    var value = clamp(o.value, 0, 100), off = c * (1 - value / 100);
    var tone = o.tone || Eco.calc.scoreTone(value);
    return '<div class="ring ring-' + tone + '" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<circle class="ring-bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" fill="none"/>' +
      '<circle class="ring-fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" fill="none" stroke-linecap="round" ' +
      'transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" style="--circ:' + c.toFixed(1) + ';--off:' + off.toFixed(1) + '"/></svg>' +
      '<span class="ring-label" style="font-size:' + Math.round(size * (o.fontScale || 0.3)) + 'px">' + (o.label != null ? o.label : Math.round(value)) + '</span></div>';
  }

  /* ---------- Count-up ---------- */
  function countUp(el, to, o) {
    if (!el) return;
    o = o || {};
    var dec = o.decimals || 0, dur = o.duration || 900, start = performance.now(), from = o.from || 0;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) dur = 0;
    function step(now) {
      var p = dur ? Math.min(1, (now - start) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
      el.textContent = (o.prefix || '') + (from + (to - from) * e).toFixed(dec) + (o.suffix || '');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function empty(iconName, title, text, action) {
    return '<div class="empty"><div class="empty-ic">' + icon(iconName, 28) + '</div><h4>' + esc(title) + '</h4><p>' + esc(text) + '</p>' + (action || '') + '</div>';
  }

  /** Show a spinner on a button while a promise is pending. Returns the same promise. */
  function busy(btn, text, promise) {
    if (!btn) return promise;
    var html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin" style="display:inline-flex">' + icon('refresh', 18) + '</span> ' + esc(text);
    var restore = function () { btn.disabled = false; btn.innerHTML = html; };
    promise.then(restore, restore);
    return promise;
  }

  /* ---------- Global click router: data-go / data-back / data-action ---------- */
  var actions = {};
  function bindGlobal() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-go],[data-back],[data-action]');
      if (!t || t.disabled) return;
      if (t.hasAttribute('data-back')) { e.preventDefault(); Eco.nav.back(); return; }
      if (t.hasAttribute('data-go')) {
        e.preventDefault();
        var id = t.getAttribute('data-go');
        var params = null;
        try { params = t.getAttribute('data-params') ? JSON.parse(t.getAttribute('data-params')) : null; } catch (er) { params = null; }
        Eco.nav.go(id, { params: params });
        return;
      }
      var name = t.getAttribute('data-action');
      if (actions[name]) { e.preventDefault(); actions[name](t, e); }
    });
  }

  Eco.ui = {
    $: $, $$: $$, h: h, esc: esc, debounce: debounce, clamp: clamp, vibrate: vibrate, icon: icon, fmt: fmt,
    toast: toast, confirm: confirmDialog, sheet: sheet, closeAllSheets: closeAllSheets, closeDialogs: closeDialogs, hasOpenSheet: hasOpenSheet,
    ring: ring, countUp: countUp, empty: empty, busy: busy, actions: actions, bindGlobal: bindGlobal
  };
  Eco.actions = actions;
})();
