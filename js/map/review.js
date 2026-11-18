// =====================================================================
// FIRCast · js/map/review.js
// Used on: map.html. Load last among the map scripts.
// Needs: js/map/map.js (window.FIRMap), js/map/recommendations-api.js (FIRCastAPI).
//
// Review mode (option D): the model's split / merge recommendations are
// reviewed one at a time. For each one the page shows
//   - the current sectors and the proposed sectors on two maps side by side,
//   - one sentence on why, and the forecast chart behind it,
//   - Accept (the live map switches to the new configuration) or
//     Override (a reason is required, so disagreements can be studied later).
// "Keep" recommendations never need a decision, so they are not reviewed.
//
// Every few seconds the page asks FIRCastAPI for the latest prediction run
// and updates the Review button's count.
// =====================================================================

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ACTION = { split: 'Split', merge: 'Merge' };
  const REASONS = {
    'traffic-differs': 'traffic differs from forecast',
    'no-controller': 'no controller available',
    'weather-military': 'weather or military activity',
    other: 'other'
  };

  let run = null;              // latest prediction run from the API
  let queue = [];              // recommendations still waiting for a decision
  let current = 0;             // index in `queue` while reviewing
  let reviewing = false;
  const decided = new Map();   // recommendation id -> decision (so it is not offered again)
  const thisReview = [];       // decisions made since "Review" was pressed
  let decisionExtra = {};      // override reason and note, added to the next decision record

  // ---------- Small helpers ----------
  const fmtTime = d => d.toISOString().slice(11, 16);                  // "14:05" (UTC)
  const minutesUntil = iso => Math.round((new Date(iso) - Date.now()) / 60000);
  function whenText(iso) {
    const m = minutesUntil(iso);
    return m <= 0 ? 'now' : `in ${m} min (${fmtTime(new Date(iso))} UTC)`;
  }
  const plural = (n, one, many) => (n === 1 ? one : many);
  const listIds = ids => ids.length === 2 ? `${ids[0]} and ${ids[1]}` : ids.join(', ');

  // Only recommendations that need a decision, that were not decided yet,
  // and whose sectors still exist (an earlier accept may have replaced them).
  function actionable() {
    if (!run) return [];
    const live = new Set(FIRMap.sectorIds());
    return run.recommendations.filter(r =>
      (r.action === 'split' || r.action === 'merge') &&
      !decided.has(r.id) &&
      r.sectors.every(id => live.has(id)));
  }

  // ---------- Review button ----------
  function updateButton() {
    const n = actionable().length;
    $('review-count').textContent = n;
    $('review-btn').hidden = n === 0 || reviewing;
    $('review-btn').setAttribute('aria-label', `Review ${n} ${plural(n, 'recommendation', 'recommendations')}`);
  }

  // Every new prediction run (sample data until the API is connected).
  function onRun(next) {
    if (!next) return;
    if (!reviewing) run = next;                                        // never swap the data mid-review
    if (!reviewing) updateButton();
  }

  // ---------- The "why" sentence and chart ----------
  // Built from the forecast itself, so the words always match the numbers.
  function explain(rec) {
    const { high, low } = run.thresholds;
    const step = run.step_min;
    const series = rec.sectors.map(id => rec.forecast[id] || []);
    if (rec.action === 'split') {
      const s = series[0];
      const first = s.findIndex(v => v >= high);
      if (first < 0) return `Predicted complexity in ${rec.sectors[0]} approaches the high limit.`;
      let last = first;
      while (last + 1 < s.length && s[last + 1] >= high) last++;
      const start = new Date(new Date(run.generated_at).getTime() + first * step * 60000);
      const lasts = (last - first + 1) * step;
      return `Predicted complexity in ${rec.sectors[0]} crosses the high limit at ${fmtTime(start)} UTC and stays above it for about ${lasts} min.`;
    }
    // merge: how long do all the sectors stay under the low limit?
    let n = 0;
    while (n < series[0].length && series.every(s => s[n] < low)) n++;
    const mins = Math.max(0, (n - 1) * step);
    return n === series[0].length
      ? `${listIds(rec.sectors)} are predicted to stay below the low limit for the whole next ${run.horizon_min} min.`
      : `${listIds(rec.sectors)} are predicted to stay below the low limit for the next ${mins} min.`;
  }

  // A small line chart: predicted complexity for the next hour, one line per
  // sector, with the limit that triggered the recommendation as a dashed line.
  function drawChart(rec) {
    const svg = $('why-chart');
    // draw at the chart's real width, so text stays 11px on phones too
    const W = Math.round(Math.max(300, Math.min(1400, svg.clientWidth || 560))), H = 170;
    const L = 36, R = 14, T = 14, B = 24;                                   // the key is in the card's caption
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const { high, low } = run.thresholds;
    const series = rec.sectors.map(id => ({ id, v: rec.forecast[id] || [] }));
    const n = series[0].v.length;
    const limit = rec.action === 'split' ? high : low;
    // y range: from 0 to a little above the highest value or the limit
    const max = Math.ceil(Math.max(limit, ...series.flatMap(s => s.v)) * 1.25 * 10) / 10;
    const x = i => L + (i / (n - 1)) * (W - L - R);
    const y = v => T + (1 - v / max) * (H - T - B);
    const limitColour = rec.action === 'split' ? '#DD110A' : '#3F7CC0';
    const lineColours = ['#13233A', '#9A6B00'];
    let out = '';
    [0, max / 2, max].forEach(v => {                                         // faint grid + values
      out += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(19,35,58,0.1)"/>`;
      out += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2).replace(/0$/, '')}</text>`;
    });
    out += `<line x1="${L}" x2="${W - R}" y1="${y(limit)}" y2="${y(limit)}" stroke="${limitColour}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    out += `<text x="${L + 6}" y="${y(limit) - 6}" style="fill:${limitColour}">${rec.action === 'split' ? 'High' : 'Low'} limit</text>`;
    const eff = minutesUntil(rec.effective_at) / run.step_min;              // when the action is needed
    if (eff > 0 && eff < n - 1) {
      out += `<line x1="${x(eff)}" x2="${x(eff)}" y1="${T}" y2="${H - B}" stroke="#13233A" stroke-width="1" stroke-dasharray="2 3"/>`;
      out += `<text x="${x(eff) + 5}" y="${T + 8}" style="fill:#13233A">${ACTION[rec.action]}</text>`;
    }
    series.forEach((s, k) => {
      const c = lineColours[k % 2], last = s.v.length - 1;
      out += `<polyline points="${s.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
      out += `<circle cx="${x(last)}" cy="${y(s.v[last])}" r="4" fill="${c}" stroke="#fff" stroke-width="2"/>`;
    });
    // key in the card's caption: one short line per sector
    $('why-key').innerHTML = series.map((s, k) => `<span><i style="background:${lineColours[k % 2]}"></i>${s.id}</span>`).join('');
    const every = W < 460 ? 6 : 3;                                          // time axis every 15 min (30 on narrow charts)
    for (let i = 0; i < n; i += every) {
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      out += `<text x="${x(i)}" y="${H - 6}" text-anchor="${anchor}">${i === 0 ? 'Now' : '+' + i * run.step_min + ' min'}</text>`;
    }
    svg.innerHTML = out;
  }

  // Two quick figures beside the reason.
  function facts(rec) {
    const { high, low } = run.thresholds;
    const all = rec.sectors.flatMap(id => rec.forecast[id] || []);
    if (rec.action === 'split') {
      const s = rec.forecast[rec.sectors[0]] || [];
      const first = s.findIndex(v => v >= high);
      const at = first < 0 ? '—' : fmtTime(new Date(new Date(run.generated_at).getTime() + first * run.step_min * 60000));
      return [['Crosses high limit', first < 0 ? '—' : `${at} UTC`], ['Peak', Math.max(...s).toFixed(2)]];
    }
    return [['Highest', Math.max(...all).toFixed(2)], ['Low limit', low.toFixed(2)]];
  }

  // ---------- Showing one recommendation ----------
  function render() {
    const rec = queue[current];
    const keep = run.recommendations.filter(r => r.action === 'keep').flatMap(r => r.sectors);
    $('review-step').innerHTML =
      `<span class="of">Recommendation ${current + 1} of ${queue.length}</span>` +
      `<span class="act act-${rec.action}">${ACTION[rec.action]}</span>${listIds(rec.sectors)} ${whenText(rec.effective_at)}` +
      (keep.length ? `<span class="of" style="margin-left:12px">Keep: ${keep.join(', ')}</span>` : '');
    const a = rec.sectors.length, b = rec.proposed.length;
    // pane titles: Before / After, what is there, and a key for the orange line
    const split = rec.action === 'split';
    $('cap-now').innerHTML =
      `<span class="pane-tag">Before</span><span class="pane-what">${rec.sectors.join(' + ')} · ${a} ${plural(a, 'controller', 'controllers')}</span>` +
      (split ? '' : '<span class="pane-key"><i class="key-dashed"></i>Border to remove</span>');
    $('cap-after').innerHTML =
      `<span class="pane-tag is-after">After ${split ? 'split' : 'merge'}</span><span class="pane-what">${rec.proposed.map(p => p.id).join(' + ')} · ${b} ${plural(b, 'controller', 'controllers')}</span>` +
      (split ? '<span class="pane-key"><i class="key-solid"></i>New border</span>' : '');
    $('why-kicker').textContent = rec.action === 'split' ? 'Why split' : 'Why merge';
    $('why-text').textContent = explain(rec);
    $('why-facts').innerHTML = facts(rec).map(([k, v]) => `<div class="fact"><p>${k}</p><p>${v}</p></div>`).join('');
    drawChart(rec);
    closeOverride();
  }

  // Start reviewing. firstId (optional) jumps straight to one recommendation,
  // e.g. when its badge is clicked in the forecast panel.
  function start(firstId) {
    queue = actionable();
    if (!queue.length) return;
    // most urgent first: earliest effective time, then splits before merges
    queue.sort((p, q) => new Date(p.effective_at) - new Date(q.effective_at) || (p.action === 'split' ? -1 : 1));
    const pick = typeof firstId === 'string' ? queue.findIndex(r => r.id === firstId) : -1;
    if (pick > 0) queue.unshift(...queue.splice(pick, 1));             // that one first, the rest after it
    current = 0; reviewing = true; thisReview.length = 0;
    document.dispatchEvent(new CustomEvent('fircast:review', { detail: { reviewing: true } }));
    $('review-btn').hidden = true;
    $('review-bar').hidden = false;
    $('review-panel').hidden = false;
    $('decide').hidden = false;
    $('review-done').hidden = true;
    document.querySelector('.why').hidden = false;
    FIRMap.enterReview(queue[0]);
    render();
    // focus Accept without jumping: on a phone the screen opens at the top, on the maps
    $('rv-accept').focus({ preventScroll: true });
    document.querySelector('.map-card').scrollTop = 0;
  }

  function exit() {
    reviewing = false;
    document.dispatchEvent(new CustomEvent('fircast:review', { detail: { reviewing: false } }));
    $('review-bar').hidden = true;
    $('review-panel').hidden = true;
    FIRMap.exitReview();
    updateButton();
  }

  // Record the decision, then move to the next recommendation or the summary.
  function decide(decision) {
    const rec = queue[current];
    const record = {
      recommendation_id: rec.id, action: rec.action, sectors: rec.sectors,
      decision, decided_at: new Date().toISOString(), model_version: run.model_version, ...decisionExtra
    };
    decisionExtra = {};
    decided.set(rec.id, record);
    thisReview.push({ rec, record });
    FIRCastAPI.sendDecision(record).catch(err => console.warn('FIRCast: decision not saved.', err));
    if (decision === 'accepted') FIRMap.applyConfiguration(rec);
    // later recommendations may refer to sectors that no longer exist
    const live = new Set(FIRMap.sectorIds());
    const rest = queue.slice(current + 1).filter(r => r.sectors.every(id => live.has(id)));
    queue = queue.slice(0, current + 1).concat(rest);
    if (current + 1 < queue.length) {
      current++;
      FIRMap.showRecommendation(queue[current]);
      render();
      $('rv-accept').focus({ preventScroll: true });
      document.querySelector('.map-card').scrollTop = 0;   // back to the maps for the next one
    } else showSummary();
  }

  function showSummary() {
    $('review-step').innerHTML = '<span class="of">Review complete</span>';
    $('decide').hidden = true;
    document.querySelector('.why').hidden = true;
    $('done-list').innerHTML = thisReview.map(({ rec, record }) => {
      const what = `${ACTION[rec.action]} ${listIds(rec.sectors)}`;
      const how = record.decision === 'accepted' ? 'accepted' : `overridden (${REASONS[record.reason]})`;
      return `<li><b>${what}</b>: ${how}</li>`;
    }).join('');
    $('review-done').hidden = false;
    $('review-back').focus();
  }

  // ---------- Override form ----------
  function openOverride() {
    $('review-panel').classList.add('is-overriding');                 // widen the decision column for the form
    $('override-form').hidden = false;
    drawChart(queue[current]);                                         // the chart is narrower now: redraw at its new size
    document.querySelector('#decide > .decide-buttons').hidden = true;
    $('override-form').querySelector('input').focus();
  }
  function closeOverride() {
    const form = $('override-form');
    form.reset();
    form.hidden = true;
    $('review-panel').classList.remove('is-overriding');
    $('override-error').hidden = true;
    if (reviewing && queue[current]) drawChart(queue[current]);
    document.querySelector('#decide > .decide-buttons').hidden = false;
  }
  $('override-form').addEventListener('change', () => { $('override-error').hidden = true; });
  $('override-form').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.currentTarget;
    const reason = form.elements.reason.value;
    if (!reason) { $('override-error').hidden = false; return; }       // a reason is required
    decisionExtra = { reason, note: $('override-note').value.trim() || null };
    decide('overridden');
  });

  // ---------- Buttons and keys ----------
  $('review-btn').addEventListener('click', () => start());
  window.addEventListener('resize', () => { if (reviewing && queue[current] && !$('decide').hidden) drawChart(queue[current]); });
  $('review-exit').addEventListener('click', exit);
  $('review-back').addEventListener('click', exit);
  $('rv-accept').addEventListener('click', () => decide('accepted'));
  $('rv-override').addEventListener('click', openOverride);
  $('ov-cancel').addEventListener('click', () => { closeOverride(); $('rv-override').focus(); });
  document.addEventListener('keydown', e => {                          // Escape: close the form, then leave review
    if (e.key !== 'Escape' || !reviewing) return;
    if (!$('override-form').hidden) { closeOverride(); $('rv-override').focus(); } else exit();
  });

  // What the forecast panel may use: open review at one recommendation,
  // and find out whether a recommendation is still waiting for a decision.
  window.FIRReview = { start, pending: () => actionable().map(r => r.id) };

  FIRCastAPI.subscribe(onRun);
})();
