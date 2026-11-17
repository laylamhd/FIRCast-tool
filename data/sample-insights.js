// =====================================================================
// FIRCast · data/sample-insights.js
// Used on: insights.html and insights-month.html, only while
// FIRCastInsights.CONFIG.baseUrl is null.
//
// Made-up monthly statistics in exactly the format the real API will
// return (see docs/API.md, "Insights"). NOTHING here is real: the numbers
// are generated so the pages have something believable to show.
// A seeded random generator makes every month look the same on every visit.
// Months after the current one have no data; the current month only has
// the days so far.
// =====================================================================

function buildSampleInsights(year, today) {
  'use strict';
  today = today || new Date();
  const SECTORS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  const REASONS = ['traffic-differs', 'no-controller', 'weather-military', 'other'];
  // rough shape of a year: quieter in the summer, busiest in the winter
  const SEASON = [1.00, 0.95, 1.02, 0.97, 0.93, 0.86, 0.90, 0.89, 0.92, 0.99, 1.04, 1.08];

  // Small seeded random generator (mulberry32): same seed, same numbers.
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const months = [];
  for (let m = 0; m < 12; m++) {
    const id = `${year}-${String(m + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    const isFuture = year > today.getUTCFullYear() || (year === today.getUTCFullYear() && m > today.getUTCMonth());
    if (isFuture) { months.push({ month: id, available: false }); continue; }
    const isCurrent = year === today.getUTCFullYear() && m === today.getUTCMonth();
    const days = isCurrent ? today.getUTCDate() : daysInMonth;
    const r = rng(year * 100 + m + 1);

    // flights per day: seasonal level, a weekly rhythm (busier Thursday to Saturday) and noise
    const daily = Array.from({ length: days }, (_, d) => {
      const weekday = new Date(Date.UTC(year, m, d + 1)).getUTCDay();
      const weekly = [0.97, 0.96, 0.98, 1.0, 1.04, 1.05, 1.02][weekday];
      return Math.round(2850 * SEASON[m] * weekly * (0.95 + r() * 0.1));
    });
    const flights = daily.reduce((a, b) => a + b, 0);
    const peak = Math.max(...daily);

    // sectors: about 85% of sector-hours open on average, busier months open more
    const sectorHours = Math.round(SECTORS.length * 24 * days * (0.78 + 0.1 * SEASON[m] + r() * 0.03));
    const highHours = {};
    SECTORS.forEach((s, k) => {
      const weight = [0.4, 0.9, 1.1, 0.8, 0.7, 1.6, 0.3][k];             // S6 is the usual hot spot
      highHours[s] = Math.round(days * weight * SEASON[m] * (0.6 + r() * 0.5));
    });

    // model accuracy: error grows with how far ahead the model looks
    const mae = {};
    [15, 30, 45, 60].forEach((h, k) => { mae[h] = +(0.035 + k * 0.018 + r() * 0.01).toFixed(3); });
    const caught = Math.round(78 + r() * 14);
    const falseAlarms = Math.round(7 + r() * 9);

    // recommendations and what the supervisors decided
    const splits = Math.round(days * 1.6 * SEASON[m] * (0.8 + r() * 0.4));
    const merges = Math.round(days * 1.1 * (2 - SEASON[m]) * (0.8 + r() * 0.4));
    const total = splits + merges;
    const overridden = Math.round(total * (0.15 + r() * 0.15));
    const reasonWeights = REASONS.map((_, k) => [0.45, 0.25, 0.2, 0.1][k] * (0.7 + r() * 0.6));
    const sumW = reasonWeights.reduce((a, b) => a + b, 0);
    const reasons = {};
    let left = overridden;
    REASONS.forEach((reason, k) => {
      const n = k === REASONS.length - 1 ? left : Math.round((overridden * reasonWeights[k]) / sumW);
      reasons[reason] = Math.max(0, Math.min(left, n));
      left -= reasons[reason];
    });

    months.push({
      month: id, available: true, partial: isCurrent, days, days_in_month: daysInMonth,
      traffic: { flights, daily_flights: daily, busiest_day: daily.indexOf(peak) + 1, busiest_day_flights: peak },
      sectors: { opening_hours: sectorHours, flights_per_sector_hour: +(flights / sectorHours).toFixed(1), hours_above_high: highHours },
      accuracy: { mae_by_horizon: mae, overloads_caught_pct: caught, false_alarms_pct: falseAlarms },
      recommendations: { splits, merges, accepted: total - overridden, overridden, override_reasons: reasons }
    });
  }
  return { year, generated_at: today.toISOString(), sample: true, months };
}
