// =====================================================================
// FIRCast · js/insights/month.js
// Used on: insights-month.html.
// Needs: js/insights/insights-api.js, js/insights/charts.js.
//
// Reads ?month=YYYY-MM from the address, loads that year's statistics and
// fills the four cards: Traffic, Sectors, Model accuracy, Recommendations.
// Each card has a few number tiles (with the change from last month) and
// one chart. Without ?month, it shows the latest month that has data.
// =====================================================================

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('en');
  const REASON_TEXT = {
    'traffic-differs': 'Traffic differs from forecast',
    'no-controller': 'No controller available',
    'weather-military': 'Weather or military activity',
    other: 'Other'
  };

  // Change from last month, as a small line under a tile. `perDay` compares
  // daily averages, so a month still in progress is compared fairly.
  // goodWhenUp: is a rise good (green) or bad (red)?
  function change(now, before, goodWhenUp) {
    if (before === null || before === undefined) return '';
    const pct = Math.round(((now - before) / before) * 100);
    if (!pct) return '<p class="tile-change">Same as last month</p>';
    const good = goodWhenUp === null ? null : (pct > 0) === goodWhenUp;
    const cls = good === null ? '' : good ? ' is-good' : ' is-bad';
    return `<p class="tile-change${cls}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month</p>`;
  }
  // For values that are already percentages: change in percentage points.
  function changePts(now, before, goodWhenUp) {
    const d = Math.round(now - before);
    if (!d) return '<p class="tile-change">Same as last month</p>';
    const cls = (d > 0) === goodWhenUp ? ' is-good' : ' is-bad';
    return `<p class="tile-change${cls}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} pts vs last month</p>`;
  }
  const tile = (label, value, extra = '') => `<div class="tile"><p class="tile-label">${label}</p><p class="tile-value">${value}</p>${extra}</div>`;

  function fill(m, prev) {
    const name = FIRCastInsights.monthName(m.month), y = m.month.slice(0, 4);
    document.title = `${name} ${y} · Insights · FIRCast`;
    $('month-name').textContent = `${name} ${y}`;
    $('month-sub').innerHTML = (m.partial ? `1–${m.days} ${name} so far` : `${m.days} days`) + (year.sample ? ' · <span class="sample-chip">Sample data</span>' : '');
    const per = (v, mm) => v / mm.days;                                // daily average

    // Traffic
    $('tiles-traffic').innerHTML =
      tile('Flights in the FIR', fmt(m.traffic.flights), prev ? change(per(m.traffic.flights, m), per(prev.traffic.flights, prev), null).replace('vs last month', 'per day vs last month') : '') +
      tile('Busiest day', `${m.traffic.busiest_day} ${name.slice(0, 3)}`, `<p class="tile-change">${fmt(m.traffic.busiest_day_flights)} flights</p>`) +
      tile('Flights per sector-hour', m.sectors.flights_per_sector_hour, prev ? change(m.sectors.flights_per_sector_hour, prev.sectors.flights_per_sector_hour, null) : '');
    FIRCharts.line($('chart-daily'), m.traffic.daily_flights, {
      xLabel: i => `${i + 1} ${name.slice(0, 3)}`,
      labelFor: i => `${i + 1} ${name.slice(0, 3)} · ${fmt(m.traffic.daily_flights[i])} flights`,
      mark: m.traffic.busiest_day - 1,
      markText: `Busiest · ${fmt(m.traffic.busiest_day_flights)}`
    });

    // Sectors
    const high = Object.entries(m.sectors.hours_above_high).sort((a, b) => b[1] - a[1]);
    const totalHigh = high.reduce((a, [, h]) => a + h, 0);
    const prevHigh = prev ? Object.values(prev.sectors.hours_above_high).reduce((a, b) => a + b, 0) : null;
    $('tiles-sectors').innerHTML =
      tile('Sector opening hours', fmt(m.sectors.opening_hours), prev ? change(per(m.sectors.opening_hours, m), per(prev.sectors.opening_hours, prev), null) : '') +
      tile('Hours above the high limit', fmt(totalHigh), prev ? change(totalHigh / m.days, prevHigh / prev.days, false) : '');
    FIRCharts.bars($('chart-high'), high.map(([s, h]) => ({ label: s, value: h, text: `${h} h` })));

    // Model accuracy
    const mae = m.accuracy.mae_by_horizon;
    $('tiles-model').innerHTML =
      tile('Overloads caught', `${m.accuracy.overloads_caught_pct}%`, prev ? changePts(m.accuracy.overloads_caught_pct, prev.accuracy.overloads_caught_pct, true) : '') +
      tile('False alarms', `${m.accuracy.false_alarms_pct}%`, prev ? changePts(m.accuracy.false_alarms_pct, prev.accuracy.false_alarms_pct, false) : '');
    FIRCharts.columns($('chart-mae'), Object.entries(mae).map(([h, v]) => ({ label: `${h} min`, value: v, text: v.toFixed(3) })));

    // Recommendations
    const rec = m.recommendations, total = rec.accepted + rec.overridden;
    const acceptedPct = r => Math.round((r.accepted / ((r.accepted + r.overridden) || 1)) * 100);
    $('tiles-recs').innerHTML =
      tile('Splits', fmt(rec.splits), prev ? change(per(rec.splits, m), per(prev.recommendations.splits, prev), null) : '') +
      tile('Merges', fmt(rec.merges), prev ? change(per(rec.merges, m), per(prev.recommendations.merges, prev), null) : '') +
      tile('Accepted', `${acceptedPct(rec)}%`, prev ? changePts(acceptedPct(rec), acceptedPct(prev.recommendations), true) : '');
    FIRCharts.split($('chart-decisions'), [
      { label: 'Accepted', value: rec.accepted, colour: '#13233A' },
      { label: 'Overridden', value: rec.overridden, colour: '#F3C63F' }
    ]);
    const reasons = Object.entries(rec.override_reasons).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: REASON_TEXT[k] || k, value: v, text: fmt(v) }));
    FIRCharts.bars($('chart-reasons'), reasons, { labelWidth: 200, colour: '#2B4566' });
  }

  // Previous / next month buttons: links when that month has data, faded otherwise.
  function stepLink(id, target) {
    const a = $(id);
    if (target && target.available) { a.href = `insights-month.html?month=${target.month}`; a.classList.remove('is-off'); a.removeAttribute('aria-disabled'); }
    else { a.removeAttribute('href'); a.classList.add('is-off'); a.setAttribute('aria-disabled', 'true'); }
  }

  let year = null;
  const wanted = new URLSearchParams(location.search).get('month');
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(wanted || '');
  const y = valid ? Number(wanted.slice(0, 4)) : new Date().getUTCFullYear();

  $('back-link').href = `insights.html?year=${y}`;                     // back to this month's year
  FIRCastInsights.getYear(y).then(data => {
    year = data;
    const list = data.months;
    const idx = valid ? list.findIndex(m => m.month === wanted) : list.map(m => m.available).lastIndexOf(true);
    const m = list[idx];
    if (!m || !m.available) {
      $('stat-grid').hidden = true;
      $('month-name').textContent = m ? `${FIRCastInsights.monthName(m.month)} ${y}` : 'Month not found';
      $('month-error').hidden = false;
      $('month-error').textContent = m ? 'No data for this month yet.' : 'That month isn\'t in the data.';
      stepLink('prev-month', list[idx - 1]); stepLink('next-month', null);
      return;
    }
    const prev = list[idx - 1] && list[idx - 1].available ? list[idx - 1] : null;
    fill(m, prev);
    stepLink('prev-month', list[idx - 1]);
    stepLink('next-month', list[idx + 1]);
    // redraw the charts at the new width when the window is resized
    let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => fill(m, prev), 150); });
  }).catch(err => {
    console.warn('FIRCast: could not load insights.', err);
    $('stat-grid').hidden = true;
    $('month-error').hidden = false;
    $('month-error').textContent = 'Couldn\'t load the statistics. Try again in a moment.';
  });
})();
