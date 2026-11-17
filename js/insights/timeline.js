// =====================================================================
// FIRCast · js/insights/timeline.js
// Used on: insights.html. Needs: js/insights/insights-api.js.
//
// Twelve months drawn as waypoints along a dashed flight route, in an SVG.
//   - Each waypoint is the same triangle as a waypoint on the map. Its size
//     shows how many flights that month had (bigger = busier).
//   - Months with data are links to insights-month.html?month=YYYY-MM.
//     Months that haven't happened yet are faded and can't be clicked.
//   - The orange plane (the map's plane shape) sits on the latest month.
//   - The year: the big number in the middle, with the years before and
//     after faded beside it. Click one, or press the left / right arrow keys,
//     to switch year. The address keeps ?year=YYYY, so the month pages can
//     link back to the right year.
//   - The route always runs left to right. On narrow screens it keeps its
//     size and the box scrolls sideways (see .route-box in insights.css).
// =====================================================================

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const svg = $('route'), tip = $('route-tip');
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PLANE = 'M1 0 L0.8 0.09 L0.2 0.11 L-0.15 0.9 L-0.35 0.9 L-0.2 0.11 L-0.65 0.09 L-0.85 0.42 L-1 0.42 L-0.92 0 L-1 -0.42 L-0.85 -0.42 L-0.65 -0.09 L-0.2 -0.11 L-0.35 -0.9 L-0.15 -0.9 L0.2 -0.11 L0.8 -0.09 Z';
  const NS = 'http://www.w3.org/2000/svg';

  let year = null;

  // Make an SVG element with attributes.
  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.append(node);
    return node;
  }

  // Positions of the 12 waypoints along a gentle arc.
  function layout() {
    const W = 920, H = 230;
    const pts = SHORT.map((_, i) => {
      const t = i / 11;
      return [50 + t * (W - 100), 130 - Math.sin(t * Math.PI) * 60];
    });
    return { W, H, pts };
  }

  // A smooth curve through the waypoints (quadratic curves between midpoints).
  function curve(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = pts[i - 1], [c, e] = pts[i];
      d += ` Q${a},${b} ${(a + c) / 2},${(b + e) / 2}`;
    }
    const [lx, ly] = pts[pts.length - 1];
    return d + ` T${lx},${ly}`;
  }

  function render() {
    const { W, H, pts } = layout();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    el('path', { d: curve(pts), class: 'route-line' }, svg);

    const months = year.months;
    const flights = months.filter(m => m.available).map(m => m.traffic.flights / m.days);   // per day, so a part month compares fairly
    const lo = Math.min(...flights), hi = Math.max(...flights);
    const latest = months.map(m => m.available).lastIndexOf(true);

    months.forEach((m, i) => {
      const [x, y] = pts[i];
      const perDay = m.available ? m.traffic.flights / m.days : lo;
      const r = 12 + ((perDay - lo) / (hi - lo || 1)) * 10;           // waypoint size: 12 to 22 px
      const name = FIRCastInsights.MONTHS[i];
      // available months are links; future months are plain, faded groups
      const g = m.available
        ? el('a', { href: `insights-month.html?month=${m.month}`, class: 'wp', role: 'listitem', 'aria-label': `${name}: ${m.traffic.flights.toLocaleString('en')} flights${m.partial ? ' so far' : ''}` }, svg)
        : el('g', { class: 'wp is-future', role: 'listitem', 'aria-label': `${name}: no data yet` }, svg);
      el('circle', { cx: x, cy: y, r: 30, class: 'hit' }, g);                                // a big, easy click target
      el('path', { class: 'tri', d: `M${x} ${y - r} L${x + r * 0.9} ${y + r * 0.62} L${x - r * 0.9} ${y + r * 0.62} Z` }, g);
      const label = el('text', { x, y: y + r + 24, 'text-anchor': 'middle', class: 'wp-label' }, g);
      label.textContent = SHORT[i];
      if (i === latest) {                                              // the plane sits on the latest month
        const next = pts[Math.min(11, i + 1)], prev = pts[Math.max(0, i - 1)];
        const ang = (Math.atan2(next[1] - prev[1], next[0] - prev[0]) * 180) / Math.PI;
        const [ox, oy] = [0, -r - 22];
        const plane = el('g', { transform: `translate(${x + ox},${y + oy}) rotate(${ang}) scale(14)`, class: 'plane' }, g);
        el('path', { d: PLANE }, plane);
      }
      if (m.available) {
        g.addEventListener('pointerenter', () => showTip(m, g));
        g.addEventListener('focus', () => showTip(m, g));
        g.addEventListener('pointerleave', hideTip);
        g.addEventListener('blur', hideTip);
      }
    });
  }

  // Small label over a waypoint: month and flights.
  function showTip(m, g) {
    const box = svg.parentElement.getBoundingClientRect(), r = g.querySelector('.tri').getBoundingClientRect();
    tip.innerHTML = `<b>${FIRCastInsights.monthName(m.month)}</b> · ${m.traffic.flights.toLocaleString('en')} flights${m.partial ? ' so far' : ''}`;
    tip.style.left = `${r.left + r.width / 2 - box.left}px`;
    tip.style.top = `${r.top - box.top}px`;
    tip.hidden = false;
  }
  function hideTip() { tip.hidden = true; }

  // ---------- Year ----------
  let years = [];
  function showYear(y, push) {
    return FIRCastInsights.getYear(y).then(data => {
      year = data;
      $('year-title').textContent = data.year;
      document.title = `Insights ${data.year} · FIRCast`;
      const i = years.indexOf(data.year);
      sideYear($('year-prev'), years[i - 1]);
      sideYear($('year-next'), years[i + 1]);
      $('route-area').classList.remove('is-switching');
      render();
      if (push) history.replaceState(null, '', `?year=${data.year}`);
    });
  }
  // A neighbouring year: shown faded if it has data, hidden (but keeping its space) if not.
  function sideYear(btn, y) {
    btn.textContent = y || '';
    btn.dataset.year = y || '';
    btn.classList.toggle('is-empty', !y);
    btn.tabIndex = y ? 0 : -1;
    btn.setAttribute('aria-label', y ? `Show ${y}` : '');
    btn.setAttribute('aria-hidden', String(!y));
  }
  function switchTo(y) {
    if (!y || y === year.year) return;
    $('route-area').classList.add('is-switching');                   // quick fade while the new year loads
    hideTip();
    setTimeout(() => showYear(y, true).catch(fail), 160);
  }
  $('year-prev').addEventListener('click', e => switchTo(Number(e.currentTarget.dataset.year)));
  $('year-next').addEventListener('click', e => switchTo(Number(e.currentTarget.dataset.year)));
  document.addEventListener('keydown', e => {                          // left / right arrows change year
    if (!year || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = years.indexOf(year.year);
    if (e.key === 'ArrowLeft') switchTo(years[i - 1]);
    if (e.key === 'ArrowRight') switchTo(years[i + 1]);
  });

  function fail(err) {
    console.warn('FIRCast: could not load insights.', err);
    $('route-area').innerHTML = '<p class="route-error">Couldn\'t load the statistics. Try again in a moment.</p>';
  }

  // Start: the year in the address (?year=2025) if it has data, otherwise the latest year.
  FIRCastInsights.getYears().then(list => {
    years = list.slice().sort((a, b) => a - b);
    const asked = Number(new URLSearchParams(location.search).get('year'));
    return showYear(years.includes(asked) ? asked : years[years.length - 1], false);
  }).catch(fail);
})();
