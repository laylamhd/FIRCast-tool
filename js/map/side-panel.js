// =====================================================================
// FIRCast · js/map/side-panel.js
// Used on: map.html. Load after js/map/map.js and js/map/forecast-panel.js.
// Needs: window.FIRMap (js/map/map.js).
//
// The page's "chrome" around the full-screen map:
//   - the side panel slides over the right edge of the map. The tab on its
//     left edge hides or shows it. While it is showing, the map recentres in
//     the part still visible (FIRMap.setInset), so nothing important is hidden
//     under it. Open by default on wide screens, closed on phones.
//   - in review mode the panel steps aside: the two maps need the full width.
//   - the + / − buttons at the top left zoom the map (2D and 3D).
// Other scripts hear about the panel through a 'fircast:panel' event.
// =====================================================================

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const card = document.querySelector('.map-card');
  const panel = $('side-panel'), tab = $('panel-tab');
  const phone = window.matchMedia('(max-width: 720px)');
  let open = !phone.matches;
  let reviewing = false;

  // How much of the map the panel covers. On phones it covers the whole map,
  // so the map doesn't move (it would have nowhere to go).
  const covered = () => (open && !reviewing && !phone.matches ? panel.getBoundingClientRect().width : 0);

  function apply(now = false) {
    card.classList.toggle('panel-open', open);
    tab.setAttribute('aria-expanded', String(open));
    tab.setAttribute('aria-label', open ? 'Hide panel' : 'Show panel');
    panel.querySelector('.panel-scroll').inert = !open;     // hidden content can't be tabbed into (the tab still can)
    FIRMap.setInset(covered(), now);
    document.dispatchEvent(new CustomEvent('fircast:panel', { detail: { open: open && !reviewing } }));
  }

  tab.addEventListener('click', () => { open = !open; apply(); });
  // review mode (js/map/review.js): step aside at once, come back after
  document.addEventListener('fircast:review', e => { reviewing = e.detail.reviewing; apply(true); });
  window.addEventListener('resize', () => apply(true));
  phone.addEventListener('change', () => { open = !phone.matches; apply(true); });

  // + / − zoom buttons (the keyboard's + and − keys still work on the map too)
  $('zoom-in').addEventListener('click', () => FIRMap.zoom(1.5));
  $('zoom-out').addEventListener('click', () => FIRMap.zoom(1 / 1.5));

  apply(true);
  FIRMap.refit();                                            // frame the FIR in the visible part of the map
})();
