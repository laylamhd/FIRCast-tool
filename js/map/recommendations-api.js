// =====================================================================
// FIRCast · js/map/recommendations-api.js
// Used on: map.html. Load before js/map/review.js.
// Needs: data/sample-recommendations.js (only while there is no real API).
//
// The one place the page talks to the AI model's server. Everything else
// on the page calls these two functions and never knows where the data
// comes from:
//
//   FIRCastAPI.subscribe(callback)   -> calls callback(run) with every new prediction run
//   FIRCastAPI.getRecommendations()  -> Promise of the latest prediction run
//   FIRCastAPI.sendDecision(decision) -> Promise; records accept / override
//   FIRCastAPI.status()               -> { ok, lastRun, nextPollAt } for the "model live" line
//
// While CONFIG.baseUrl is null, recommendations come from the built-in
// sample and decisions are only kept in memory. To connect the real model,
// set baseUrl (for example 'http://localhost:8000/api') and make the server
// answer in the format described in docs/API.md.
// =====================================================================

const FIRCastAPI = (() => {
  'use strict';

  const CONFIG = {
    baseUrl: null,          // null = use the sample data below
    pollSeconds: 60         // how often the page asks for a new prediction run
  };

  const decisions = [];     // decisions made in this browser tab (sample mode)

  // Latest recommendations. With a server: GET {baseUrl}/recommendations.
  async function getRecommendations() {
    if (!CONFIG.baseUrl) return buildSampleRecommendations(new Date());
    const res = await fetch(`${CONFIG.baseUrl}/recommendations`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Recommendations request failed (${res.status})`);
    return res.json();
  }

  // Record what the supervisor decided. With a server: POST {baseUrl}/decisions.
  async function sendDecision(decision) {
    if (!CONFIG.baseUrl) { decisions.push(decision); return { ok: true }; }
    const res = await fetch(`${CONFIG.baseUrl}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decision)
    });
    if (!res.ok) throw new Error(`Saving the decision failed (${res.status})`);
    return res.json();
  }

  // ---- One shared poll for the whole page ----
  // The forecast panel and review mode both need each run; asking once and
  // handing the result to every subscriber keeps them in step.
  const listeners = [];
  let latest = null, ok = null, nextPollAt = 0, started = false;
  async function poll() {
    nextPollAt = Date.now() + CONFIG.pollSeconds * 1000;
    try {
      latest = await getRecommendations();
      ok = true;
      listeners.forEach(fn => fn(latest));
    } catch (err) {
      ok = false;                                              // keep showing the last run, flagged as stale
      console.warn('FIRCast: could not load the latest prediction run.', err);
      listeners.forEach(fn => fn(latest));
    }
  }
  function subscribe(fn) {
    listeners.push(fn);
    if (latest) fn(latest);
    if (!started) { started = true; poll(); setInterval(poll, CONFIG.pollSeconds * 1000); }
  }
  const status = () => ({ ok, lastRun: latest ? latest.generated_at : null, nextPollAt });

  return { CONFIG, subscribe, status, getRecommendations, sendDecision, decisions };
})();
