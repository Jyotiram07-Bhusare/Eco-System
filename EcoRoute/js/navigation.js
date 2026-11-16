/* ==========================================================================
   EcoRoute - navigation.js
   Screen router: animated transitions, bottom-nav state, browser / Android
   back-button support and per-screen enter / leave / canLeave hooks.

   Screens register themselves:
     Eco.nav.register('home', { enter(params, isBack) {}, leave() {}, canLeave(nextId) {} })
   Navigate with:  Eco.nav.go('routes', { params: {...} })   /  Eco.nav.back()
   or declaratively with  data-go="routes"  /  data-back  in the markup.
   ========================================================================== */
window.Eco = window.Eco || {};
(function () {
  'use strict';

  var TABS = ['home', 'planner', 'charging', 'history', 'profile'];
  var NO_NAV = ['splash', 'onboarding', 'auth', 'vehicles', 'add-vehicle', 'navigation', 'summary'];
  var PUBLIC = ['splash', 'onboarding', 'auth'];
  var PARENT_TAB = { routes: 'planner', analytics: 'history' };
  var TRANSITION_CLASSES = ['enter-forward', 'enter-back', 'enter-fade', 'exit-forward', 'exit-back', 'exit-fade'];

  var hooks = {}, stack = [], current = null, histIndex = 0, histOK = true;

  function el(id) { return document.getElementById('screen-' + id); }
  function register(id, h) { hooks[id] = h || {}; }
  function isTab(id) { return TABS.indexOf(id) > -1; }
  function loggedIn() { return !!(Eco.store.state && Eco.store.state.loggedIn); }

  /** Signed-in users only see app screens; signed-out users only see splash / onboarding / auth. */
  function allowed(id) {
    var isPublic = PUBLIC.indexOf(id) > -1;
    return loggedIn() ? !isPublic : isPublic;
  }

  function canLeave(nextId) {
    var h = hooks[current];
    return !(h && h.canLeave && h.canLeave(nextId) === false);
  }

  function setChrome(id) {
    var nav = document.getElementById('bottom-nav'), app = document.getElementById('app');
    var hidden = NO_NAV.indexOf(id) > -1;
    nav.classList.toggle('hidden', hidden);
    app.classList.toggle('has-nav', !hidden);
    app.setAttribute('data-screen', id);
    var tab = isTab(id) ? id : PARENT_TAB[id];
    Eco.ui.$$('.nav-item', nav).forEach(function (b) {
      var on = b.getAttribute('data-go') === tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function clearT(node) { clearTimeout(node._t); TRANSITION_CLASSES.forEach(function (c) { node.classList.remove(c); }); }

  function show(id, dir, params, isBack) {
    var next = el(id);
    if (!next) { console.warn('Unknown screen', id); return; }
    var prevId = current;
    if (prevId && prevId !== id && hooks[prevId] && hooks[prevId].leave) hooks[prevId].leave();

    // everything that is still visible (normally just the previous screen) animates out
    Eco.ui.$$('.screen.is-active').forEach(function (s) {
      if (s === next) return;
      clearT(s); s.classList.add('exit-' + dir);
      s._t = setTimeout(function () { s.classList.remove('is-active'); clearT(s); }, 340);
    });
    clearT(next);
    next.classList.add('is-active');
    if (prevId !== id) next.classList.add('enter-' + dir);
    next._t = setTimeout(function () { clearT(next); }, 380);

    current = id;
    setChrome(id);
    var body = next.querySelector('.screen-body');
    if (body && !isBack && !isTab(id)) body.scrollTop = 0;

    if (hooks[id] && hooks[id].enter) hooks[id].enter(params || {}, !!isBack);
    Eco.icons.hydrate(next);
    next.setAttribute('tabindex', '-1');
    try { next.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function pushHistory(id, replace) {
    if (!histOK) return;
    try {
      if (replace) history.replaceState({ id: id, n: histIndex }, '', '#' + id);
      else { histIndex += 1; history.pushState({ id: id, n: histIndex }, '', '#' + id); }
    } catch (e) { histOK = false; }
  }

  /** Navigate to a screen. opts: { params, replace, reset:[ids below], dir, force } */
  function go(id, opts) {
    opts = opts || {};
    if (!el(id)) return false;
    if (id === current && !opts.force) {
      var b = el(id).querySelector('.screen-body');
      if (b && b.scrollTo) b.scrollTo({ top: 0, behavior: 'smooth' });
      if (hooks[id] && hooks[id].reselect) hooks[id].reselect();
      return false;
    }
    if (current && !opts.force && !canLeave(id)) return false;
    var dir = opts.dir || (isTab(id) || PUBLIC.indexOf(id) > -1 ? 'fade' : 'forward');
    if (opts.reset) stack = opts.reset.slice().concat(id);
    else if (isTab(id)) stack = [id];
    else if (opts.replace) stack[Math.max(0, stack.length - 1)] = id;
    else if (stack[stack.length - 1] !== id) stack.push(id);
    pushHistory(id, opts.replace || current == null);
    show(id, dir, opts.params, false);
    return true;
  }

  /** Pop our own screen stack. Returns true when a screen was popped (false when it fell back to Home). */
  function internalBack() {
    if (stack.length > 1) {
      stack.pop();
      show(stack[stack.length - 1], 'back', null, true);
      return true;
    }
    if (current !== 'home' && loggedIn()) go('home', { dir: 'back' });
    return false;
  }

  /**
   * The in-app Back button is deterministic: it pops our own screen stack. Browser history is only kept loosely in
   * sync (history.back()), because browsers may skip entries created without a user gesture, which must never
   * leave the button doing nothing. The popstate that our own history.back() causes is ignored.
   */
  var ignorePops = 0, ignoreTimer = null;
  function back() {
    if (!canLeave(null)) return;
    var popped = internalBack();
    if (popped && histOK && histIndex > 0) {
      ignorePops++;
      clearTimeout(ignoreTimer);
      ignoreTimer = setTimeout(function () { ignorePops = 0; }, 800);   // popstate never came (entry skipped): stop ignoring
      histIndex = Math.max(0, histIndex - 1);
      try { history.back(); } catch (e) { ignorePops = 0; }
    }
  }

  function onPop(e) {
    var st = e.state;
    if (ignorePops > 0) {                     // echo of our own history.back(); the screen has already changed
      ignorePops--;
      if (st && typeof st.n === 'number') histIndex = st.n;
      return;
    }
    if (!st || !st.id) return;
    var from = histIndex;
    histIndex = typeof st.n === 'number' ? st.n : 0;
    var target = st.id;
    // guards: signed-in users never go "back" into splash / onboarding / auth (and vice versa),
    // and a finished journey's live-navigation screen no longer exists to go back to
    var navGone = target === 'navigation' && !(Eco.tracking && Eco.tracking.isActive && Eco.tracking.isActive());
    if (!allowed(target) || navGone) {
      target = loggedIn() ? 'home' : 'auth';
      try { history.replaceState({ id: target, n: histIndex }, '', '#' + target); } catch (er) { /* ignore */ }
    }
    if (target === current) return;
    // a screen can veto leaving (live journey): restore the entry we just popped
    if (!canLeave(target)) {
      histIndex = from;
      try { history.pushState({ id: current, n: histIndex }, '', '#' + current); } catch (er) { histOK = false; }
      var h = hooks[current]; if (h && h.leaveBlocked) h.leaveBlocked(target);
      return;
    }
    var i = stack.lastIndexOf(target);
    if (isTab(target)) stack = [target];
    else if (i > -1) stack = stack.slice(0, i + 1);
    else stack.push(target);
    show(target, from > histIndex ? 'back' : (isTab(target) ? 'fade' : 'forward'), null, from > histIndex);
  }

  function init() {
    window.addEventListener('popstate', onPop);
    // Android hardware back inside an installed PWA is delivered as popstate, handled above.
  }

  Eco.nav = {
    register: register, init: init, go: go, back: back, current: function () { return current; },
    isTab: isTab, stack: function () { return stack.slice(); }
  };
})();
