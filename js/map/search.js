// =====================================================================
// FIRCast · js/map/search.js
// Used on: map.html. Load after js/map/map.js.
// Needs: window.FIRMap (js/map/map.js), data/airspace.js (the eAIP data).
//
// "Find a route or waypoint" in the side panel.
//   - Suggestions come from every ATS route (ENR 3.2) and route point (ENR 4.4)
//     in our eAIP data, through a <datalist>.
//   - Finding a route draws it in red, labels its waypoints, fades the other
//     airways and flies the camera to it. Finding a waypoint does the same for
//     the waypoint and every route through it. Works in 2D and in 3D.
//   - The result card shows only what the data holds; the route length is
//     calculated from the waypoint positions. (Our data has no magnetic
//     track per segment, so none is shown.)
//   - Clear (or Escape in the box) removes the highlight.
// =====================================================================

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('search-form'), input = $('search-input'), msg = $('search-msg'), card = $('search-result');
  const ROUTES = FIRMap.routes();
  const WAYPOINT_NAMES = Object.keys(AIRSPACE_DATA.waypoints).sort();
  const DIRECTION = { E: 'One-way, eastbound', W: 'One-way, westbound', N: 'One-way, northbound', S: 'One-way, southbound' };

  // suggestions: routes first, then waypoints
  $('search-list').innerHTML =
    ROUTES.map(r => r.name).sort().map(n => `<option value="${n}">ATS route</option>`).join('') +
    WAYPOINT_NAMES.map(n => `<option value="${n}">Waypoint</option>`).join('');

  // ---------- Small helpers ----------
  const fmtFt = ft => `${Math.round(ft).toLocaleString('en')} ft`;
  // great-circle distance in nautical miles between two [lon, lat] points
  function nm([lon1, lat1], [lon2, lat2]) {
    const r = Math.PI / 180, R = 3440.065;
    const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  // 24.6447 -> "243841N" style (degrees, minutes, seconds), as in the eAIP
  function dms(v, isLat) {
    const a = Math.abs(v), d = Math.floor(a), mFull = (a - d) * 60, m = Math.floor(mFull);
    let s = Math.round((mFull - m) * 60), mm = m, dd = d;
    if (s === 60) { s = 0; mm += 1; } if (mm === 60) { mm = 0; dd += 1; }
    const pad = (n, w) => String(n).padStart(w, '0');
    return pad(dd, isLat ? 2 : 3) + pad(mm, 2) + pad(s, 2) + (isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W'));
  }
  const routesThrough = name => ROUTES.filter(r => r.fixes.includes(name)).map(r => r.name).sort();
  const row = (k, v, mono = true) => `<dt>${k}</dt><dd${mono ? ' class="mono"' : ''}>${v}</dd>`;

  // ---------- Showing a result ----------
  function showRoute(r) {
    const pts = r.fixes.map(f => FIRMap.waypoint(f)).filter(Boolean);
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += nm(pts[i - 1], pts[i]);
    card.innerHTML = `
      <div class="sr-head"><p class="sr-kind">ATS route</p><button type="button" class="sr-clear" id="sr-clear">Clear</button></div>
      <p class="sr-name">${r.name}</p>
      <dl class="sr-grid">
        ${row('From', r.fixes[0])}${row('To', r.fixes[r.fixes.length - 1])}
        ${row('Segments', r.fixes.length - 1)}${row('Length', `${length.toFixed(1)} NM`)}
        ${row('Lower', fmtFt(r.lower))}${row('Upper', fmtFt(r.upper))}
        ${row('Direction', DIRECTION[r.dir] || 'Two-way', false)}
      </dl>
      <p class="sr-points">${r.fixes.join(' · ')}</p>
      <p class="sr-source">UAE eAIP ENR 3.2 (AIRAC 09/2026). Length calculated from the waypoint positions.</p>`;
    FIRMap.showFound([r.name], r.fixes, null);
    FIRMap.frameLonLat(pts);
    done(`Route ${r.name}: ${r.fixes.length - 1} segments, highlighted in red.`);
  }

  function showWaypoint(name) {
    const p = FIRMap.waypoint(name), through = routesThrough(name);
    const sector = FIRMap.sectorAtLonLat(p[0], p[1]);
    card.innerHTML = `
      <div class="sr-head"><p class="sr-kind">Waypoint</p><button type="button" class="sr-clear" id="sr-clear">Clear</button></div>
      <p class="sr-name">${name}</p>
      <dl class="sr-grid">
        ${row('Position', `${dms(p[1], true)} ${dms(p[0], false)}`)}
        ${row(through.length === 1 ? 'Route' : 'Routes', through.length ? through.join(', ') : 'None')}
        ${row('Sector', sector ? `${sector} <span class="sr-flag">placeholder</span>` : 'Outside the sectors')}
      </dl>
      <p class="sr-source">UAE eAIP ENR 4.4 (AIRAC 09/2026). The sectors are placeholders, not the real Emirates ACC sectors.</p>`;
    const fixes = new Set([name]);
    FIRMap.showFound(through, [...fixes], name);
    FIRMap.frameLonLat([p]);
    done(`Waypoint ${name}${through.length ? `, on ${through.join(', ')}` : ''}.`);
  }

  function done(text) {
    card.hidden = false;
    msg.textContent = text;
    $('sr-clear').addEventListener('click', clear);
  }
  function clear() {
    FIRMap.clearFound();
    card.hidden = true; card.innerHTML = '';
    input.value = '';
    msg.textContent = '';
    input.focus();
  }

  // ---------- Finding ----------
  function find(text) {
    const q = text.trim().toUpperCase();
    if (!q) { msg.textContent = 'Type a route or a waypoint first.'; return; }
    const route = ROUTES.find(r => r.name === q);
    if (route) return showRoute(route);
    if (FIRMap.waypoint(q)) return showWaypoint(q);
    // no exact match: offer up to six names that start with what was typed
    const close = [...ROUTES.map(r => r.name), ...WAYPOINT_NAMES].filter(n => n.startsWith(q)).slice(0, 6);
    if (close.length === 1) return find(close[0]);
    msg.innerHTML = close.length
      ? `No exact match for <b>${q}</b>. Did you mean ${close.map(n => `<button type="button" class="sr-suggest">${n}</button>`).join(' ')}?`
      : `No route or waypoint called <b>${q.replace(/[<>&"]/g, '')}</b> in the eAIP data.`;
    msg.querySelectorAll('.sr-suggest').forEach(b => b.addEventListener('click', () => { input.value = b.textContent; find(b.textContent); }));
  }

  form.addEventListener('submit', e => { e.preventDefault(); find(input.value); });
  input.addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) { e.stopPropagation(); clear(); } });
  // picking a suggestion from the list finds it straight away
  input.addEventListener('change', () => {
    const q = input.value.trim().toUpperCase();
    if (ROUTES.some(r => r.name === q) || FIRMap.waypoint(q)) find(q);
  });
})();
