// =====================================================================
// FIRCast · js/map/forecast-panel.js
// Used on: map.html. Load after js/map/review.js.
// Needs: js/map/map.js (window.FIRMap), js/map/recommendations-api.js
//        (FIRCastAPI), js/map/review.js (window.FIRReview).
//
// The forecast panel (option C): a panel docked beside the map that shows
// what the model predicts for ONE sector over the next hour.
//   - status line: is the model live, when was the last forecast;
//   - one chip per sector, coloured by the worst zone it is predicted to reach;
//   - the chosen sector: a one-line summary in words, an action badge
//     (Split / Merge) that opens review mode, and a large chart.
// The chart's background is split into three zones, Low / Normal / High,
// using the model's two limits, so the line can be read without numbers:
// above High -> split; Low (with a neighbour) -> merge; Normal -> keep.
// The "Forecast" button in the map header hides or shows the panel.
// =====================================================================

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = $('forecast-panel'), btn = $('forecast-btn'), body = $('map-body');
  const svg = $('fp-chart');
  const ZONE = {
    high:   { label: 'High',   fill: 'rgba(221, 17, 10, 0.10)',   ink: '#A60D07', dot: '#DD110A' },
    normal: { label: 'Normal', fill: 'rgba(19, 35, 58, 0.035)',   ink: '#2B4566', dot: '#8A97A8' },
    low:    { label: 'Low',    fill: 'rgba(132, 180, 230, 0.30)', ink: '#2B5C8F', dot: '#3F7CC0' }
  };

  let run = null;           // latest prediction run
  let chosen = null;        // sector id shown in the panel (null = pick the most urgent)
  let hoverIndex = null;    // forecast step under the mouse, for the readout

  // ---------- Helpers ----------
  const clock = d => d.toISOString().slice(11, 16);                    // "14:07" (UTC)
  const stepTime = i => new Date(new Date(run.generated_at).getTime() + i * run.step_min * 60000);
  function zoneOf(v) {
    const { low, high } = run.thresholds;
    return v > high ? 'high' : v < low ? 'low' : 'normal';
  }
  // The zone a sector is heading for: High if it ever goes above, Low if it
  // never leaves Low, otherwise Normal.
  function worstZone(values) {
    if (values.some(v => zoneOf(v) === 'high')) return 'high';
    if (values.every(v => zoneOf(v) === 'low')) return 'low';
    return 'normal';
  }
  const forecastOf = id => (run && run.forecasts && run.forecasts[id]) || null;
  // the recommendation (still waiting for a decision) that involves this sector
  function pendingFor(id) {
    if (!run || !window.FIRReview) return null;
    const open = new Set(FIRReview.pending());
    return run.recommendations.find(r => open.has(r.id) && r.sectors.includes(id)) || null;
  }

  // ---------- Status line ----------
  function renderStatus() {
    const el = $('fp-status');
    const st = FIRCastAPI.status();
    if (!run) { el.className = 'fp-status'; el.lastElementChild.textContent = 'Waiting for the model…'; return; }
    const secs = Math.max(0, Math.round((st.nextPollAt - Date.now()) / 1000));
    const sample = !FIRCastAPI.CONFIG.baseUrl;
    el.className = 'fp-status ' + (st.ok === false ? 'is-down' : 'is-live');
    el.lastElementChild.textContent = st.ok === false
      ? `Model not responding · showing ${clock(new Date(run.generated_at))} UTC forecast`
      : `${sample ? 'Sample forecast' : 'Model live'} · ${clock(new Date(run.generated_at))} UTC · next in ${secs} s`;
  }

  // ---------- Sector chips ----------
  function renderChips() {
    const box = $('fp-chips');
    box.innerHTML = '';
    FIRMap.sectorIds().forEach(id => {
      const f = forecastOf(id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'fp-chip'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === chosen));
      const zone = f ? worstZone(f) : null;
      b.innerHTML = `<i style="background:${zone ? ZONE[zone].dot : 'transparent'}"></i>${id}`;
      b.title = zone ? `${id}: heading for ${ZONE[zone].label}` : `${id}: no forecast yet`;
      b.addEventListener('click', () => choose(id));
      box.append(b);
    });
  }

  // Pick the most urgent sector: the one with the highest predicted peak.
  function defaultSector() {
    const ids = FIRMap.sectorIds().filter(id => forecastOf(id));
    ids.sort((a, b) => Math.max(...forecastOf(b)) - Math.max(...forecastOf(a)));
    return ids[0] || FIRMap.sectorIds()[0];
  }

  function choose(id) {
    chosen = id;
    hoverIndex = null;
    render();
  }

  // ---------- Summary sentence ----------
  // Plain words, built from the numbers: when it crosses a limit, for how long, the peak.
  function summary(values) {
    const { high } = run.thresholds;
    const peak = Math.max(...values), at = values.indexOf(peak);
    const first = values.findIndex(v => v > high);
    if (first >= 0) {
      let last = first;
      while (last + 1 < values.length && values[last + 1] > high) last++;
      const mins = (last - first + 1) * run.step_min;
      const when = first === 0 ? 'Already above the high limit' : `Goes above the high limit at ${clock(stepTime(first))}`;
      return `${when} and stays there for about ${mins} min. Peak ${peak.toFixed(2)} at ${clock(stepTime(at))}.`;
    }
    const zone = worstZone(values);
    if (zone === 'low') return `Stays below the low limit for the whole next ${run.horizon_min} min.`;
    return `Stays in the normal range for the next ${run.horizon_min} min. Peak ${peak.toFixed(2)} at ${clock(stepTime(at))}.`;
  }

  // ---------- The chart ----------
  function renderChart(values, rec) {
    const W = Math.round(Math.max(260, svg.clientWidth || 340)), H = 280;
    const L = 38, R = 14, T = 14, B = 28;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const { low, high } = run.thresholds;
    const n = values.length;
    const top = Math.max(1, Math.ceil(Math.max(...values) * 1.1 * 10) / 10);
    const x = i => L + (i / (n - 1)) * (W - L - R);
    const y = v => T + (1 - v / top) * (H - T - B);
    let s = '';
    // zones: High on top, Normal in the middle, Low at the bottom
    s += `<rect x="${L}" y="${y(top)}" width="${W - L - R}" height="${y(high) - y(top)}" fill="${ZONE.high.fill}"/>`;
    s += `<rect x="${L}" y="${y(high)}" width="${W - L - R}" height="${y(low) - y(high)}" fill="${ZONE.normal.fill}"/>`;
    s += `<rect x="${L}" y="${y(low)}" width="${W - L - R}" height="${y(0) - y(low)}" fill="${ZONE.low.fill}"/>`;
    // the two limits, with their values on the left axis
    [[high, ZONE.high.dot], [low, ZONE.low.dot]].forEach(([v, c]) => {
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
      s += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2)}</text>`;
    });
    s += `<text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">0</text>`;
    // when the recommended action is due
    if (rec) {
      const due = (new Date(rec.effective_at) - new Date(run.generated_at)) / 60000 / run.step_min;
      if (due > 0 && due < n - 1) {
        s += `<line x1="${x(due)}" x2="${x(due)}" y1="${T}" y2="${H - B}" stroke="#13233A" stroke-width="1.5" stroke-dasharray="3 3"/>`;
        s += `<text class="mk" x="${x(due) + 5}" y="${H - B - 8}">${rec.action === 'split' ? 'Split' : 'Merge'} ${clock(new Date(rec.effective_at))}</text>`;
      }
    }
    // the forecast line, then the "now" and peak points
    s += `<polyline points="${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="#13233A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    const peak = Math.max(...values), pi = values.indexOf(peak);
    s += `<circle cx="${x(0)}" cy="${y(values[0])}" r="5" fill="#FBF4DB" stroke="#13233A" stroke-width="2.5"/>`;
    s += `<circle cx="${x(pi)}" cy="${y(peak)}" r="5" fill="#13233A"/>`;
    if (zoneOf(peak) === 'high') {                             // label the peak only when it matters
      const right = x(pi) > W - 90;
      s += `<text class="mk" x="${x(pi) + (right ? -8 : 8)}" y="${y(peak) - 8}" text-anchor="${right ? 'end' : 'start'}">Peak ${peak.toFixed(2)}</text>`;
    }
    // zone names, drawn after the line so the line never hides them
    s += `<text class="zl" x="${L + 8}" y="${y(top) + 16}" style="fill:${ZONE.high.ink}">High · split</text>`;
    s += `<text class="zl" x="${L + 8}" y="${y(high) + 16}" style="fill:${ZONE.normal.ink}">Normal · keep</text>`;
    s += `<text class="zl" x="${L + 8}" y="${y(low) + 16}" style="fill:${ZONE.low.ink}">Low · merge</text>`;
    // time axis: clock times every 15 min
    for (let i = 0; i < n; i += 3) {
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      s += `<text x="${x(i)}" y="${H - 8}" text-anchor="${anchor}">${i === 0 ? 'Now' : clock(stepTime(i))}</text>`;
    }
    // hover readout: guide line and the value at that time
    if (hoverIndex !== null) {
      const v = values[hoverIndex];
      s += `<line x1="${x(hoverIndex)}" x2="${x(hoverIndex)}" y1="${T}" y2="${H - B}" stroke="#13233A" stroke-opacity="0.35"/>`;
      s += `<circle cx="${x(hoverIndex)}" cy="${y(v)}" r="4.5" fill="#13233A"/>`;
      const box = $('fp-readout');
      box.hidden = false;
      box.textContent = `${clock(stepTime(hoverIndex))} · ${v.toFixed(2)} · ${ZONE[zoneOf(v)].label}`;
      // keep the readout inside the chart near the edges
      box.style.left = `${Math.min(82, Math.max(18, (x(hoverIndex) / W) * 100))}%`;
    } else $('fp-readout').hidden = true;
    svg.innerHTML = s;
    svg.dataset.n = n; svg.dataset.l = L; svg.dataset.r = R; svg.dataset.w = W;
  }

  // ---------- Whole panel ----------
  function render() {
    if (!run) { renderStatus(); return; }
    if (!chosen || !FIRMap.sectorIds().includes(chosen)) chosen = defaultSector();
    renderStatus();
    renderChips();
    FIRMap.highlight(panel.hidden ? null : chosen);
    const values = forecastOf(chosen);
    $('fp-name').textContent = chosen;
    const rec = pendingFor(chosen);
    const act = $('fp-action');
    if (rec) {
      const other = rec.sectors.filter(id => id !== chosen);
      act.textContent = rec.action === 'split' ? 'Split · review' : `Merge with ${other.join(', ')} · review`;
      act.className = 'fp-action act-' + rec.action;
      act.hidden = false;
      act.onclick = () => FIRReview.start(rec.id);
    } else act.hidden = true;
    if (!values) {
      $('fp-summary').textContent = `No forecast yet for ${chosen}. It appears after the model's next run.`;
      svg.innerHTML = ''; svg.parentElement.hidden = true;
      return;
    }
    svg.parentElement.hidden = false;
    $('fp-summary').textContent = summary(values);
    renderChart(values, rec);
  }

  // Mouse over the chart: show the value at the nearest 5-minute step.
  svg.addEventListener('pointermove', e => {
    if (!run || !forecastOf(chosen)) return;
    const r = svg.getBoundingClientRect();
    const W = +svg.dataset.w, L = +svg.dataset.l, R = +svg.dataset.r, n = +svg.dataset.n;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
    const next = Math.max(0, Math.min(n - 1, i));
    if (next !== hoverIndex) { hoverIndex = next; renderChart(forecastOf(chosen), pendingFor(chosen)); }
  });
  svg.addEventListener('pointerleave', () => { hoverIndex = null; if (run && forecastOf(chosen)) renderChart(forecastOf(chosen), pendingFor(chosen)); });

  // ---------- Show / hide ----------
  function setOpen(open) {
    panel.hidden = !open;
    body.classList.toggle('with-panel', open);
    btn.setAttribute('aria-pressed', String(open));
    FIRMap.highlight(open ? chosen : null);
    if (open) render();
  }
  btn.addEventListener('click', () => setOpen(panel.hidden));

  // ---------- Wiring ----------
  FIRMap.onSectorClick(id => { if (!panel.hidden) choose(id); });
  FIRMap.onConfigChange(() => render());
  document.addEventListener('fircast:review', e => { if (!e.detail.reviewing) render(); });
  window.addEventListener('resize', () => { if (!panel.hidden) render(); });
  FIRCastAPI.subscribe(next => { if (next) { run = next; render(); } });
  setInterval(renderStatus, 1000);                                     // the "next in N s" countdown
  setOpen(window.innerWidth > 900);                                     // open by default on wide screens
})();
