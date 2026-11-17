// =====================================================================
// FIRCast · js/insights/insights-api.js
// Used on: insights.html, insights-month.html.
// Needs: data/sample-insights.js (only while there is no real API).
//
// Where the Insights pages get their monthly statistics:
//   FIRCastInsights.getYear(2026) -> Promise of { year, months: [...] }
// While CONFIG.baseUrl is null, the numbers come from the built-in sample.
// To connect the real server, set baseUrl; it must answer
// GET {baseUrl}/insights?year=2026 in the format in docs/API.md.
// =====================================================================

const FIRCastInsights = (() => {
  'use strict';
  const CONFIG = { baseUrl: null };

  async function getYear(year) {
    if (!CONFIG.baseUrl) return buildSampleInsights(year);
    const res = await fetch(`${CONFIG.baseUrl}/insights?year=${year}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Insights request failed (${res.status})`);
    return res.json();
  }

  // Month names, written once for both pages.
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = id => MONTHS[Number(id.slice(5, 7)) - 1];

  return { CONFIG, getYear, MONTHS, monthName };
})();
