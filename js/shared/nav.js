// =====================================================================
// FIRCast · js/shared/nav.js
// Used on: every page.
//
// The navigation bar is fixed at the top of the screen. This script watches
// the scroll position (of the page, or of any scrolling box inside it, such as
// the map's side panel or the review screen; on the map, zooming in counts as
// scrolling too) and adds the class .is-compact once you scroll down,
// which base.css uses to shrink the bar to just the logo, pinned in the
// top-left corner. Scrolling back to the top removes the class and the bar
// grows back to full size in the centre.
//
// Every page must load this script (last, after its own scripts) and use the
// same <nav class="nav"> markup, so the behaviour is the same everywhere.
//
// Two thresholds (48 px to shrink, 8 px to grow) stop it flickering when the
// page sits near the top. requestAnimationFrame limits the work to once per
// screen refresh, however fast scroll events arrive.
// =====================================================================


(() => {
  'use strict';
  const nav = document.querySelector('.nav');
  // What counts as "scrolled": the page itself, any scrolling box inside it (the
  // map's side panel, the review screen), or another script saying so through a
  // 'fircast:scrolled' event (the map does this when you zoom in).
  let compact = false, queued = false;
  let box = null;                 // the inner box scrolled most recently
  const others = {};              // e.g. { map: true } from 'fircast:scrolled'

  // An inner box only counts while it can still scroll (the review screen stops
  // scrolling when you leave it, so its old position must not keep the bar small).
  const boxY = () => (box && box.isConnected && box.scrollHeight > box.clientHeight + 1 ? box.scrollTop : 0);

  // Decide whether the bar should be full or compact.
  function update() {
    queued = false;
    const y = Math.max(window.scrollY, boxY());
    // two thresholds, so the bar does not flicker near the top
    const scrolled = compact ? y > 8 : y > 48;
    const next = scrolled || Object.values(others).some(Boolean);
    if (next !== compact) { compact = next; nav.classList.toggle('is-compact', compact); }
  }
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  // Scroll events from inner boxes do not bubble, so listen in the capture phase.
  document.addEventListener('scroll', e => {
    if (e.target instanceof Element && !nav.contains(e.target)) box = e.target;
    later();
  }, { capture: true, passive: true });
  window.addEventListener('scroll', later, { passive: true });
  document.addEventListener('fircast:scrolled', e => { others[e.detail.source] = e.detail.compact; later(); });
  document.addEventListener('fircast:review', later);   // entering or leaving review changes what scrolls
  window.addEventListener('resize', later);
  update();
})();
