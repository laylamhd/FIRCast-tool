// =====================================================================
// FIRCast · data/sample-recommendations.js
// Used on: map.html, only while FIRCastAPI.CONFIG.baseUrl is null.
// Needs (load first): data/airspace.js (AIRSPACE_DATA), js/map/geometry.js.
//
// A made-up prediction run in exactly the format the real model's API will
// return (see docs/API.md). Nothing here is a real prediction: the numbers
// are invented to show one split, one merge and the "keep" case.
//
// Complexity is a placeholder index from 0 to 1, and the limits (0.30 and
// 0.75) are placeholders too. The real scale and limits will come from the
// model and from the sector capacity values agreed with the GCAA.
// =====================================================================

function buildSampleRecommendations(now) {
  'use strict';
  const t0 = new Date(Math.floor(now.getTime() / 60000) * 60000);       // whole minute
  const at = min => new Date(t0.getTime() + min * 60000).toISOString();
  const S = AIRSPACE_DATA.sectors;
  const [s6a, s6b] = FIRGeometry.splitPolygon(S.S6);
  // Predicted complexity for every sector, one value every 5 min for 60 min.
  const F = {
    S1: [0.22, 0.20, 0.19, 0.18, 0.18, 0.17, 0.19, 0.20, 0.21, 0.22, 0.24, 0.25, 0.26],
    S2: [0.41, 0.44, 0.48, 0.52, 0.55, 0.58, 0.60, 0.59, 0.56, 0.52, 0.48, 0.45, 0.43],
    S3: [0.62, 0.63, 0.64, 0.62, 0.59, 0.56, 0.52, 0.48, 0.45, 0.42, 0.40, 0.39, 0.38],
    S4: [0.38, 0.40, 0.42, 0.45, 0.48, 0.52, 0.56, 0.60, 0.64, 0.67, 0.69, 0.70, 0.70],
    S5: [0.50, 0.47, 0.44, 0.41, 0.38, 0.36, 0.35, 0.34, 0.34, 0.35, 0.36, 0.37, 0.38],
    S6: [0.52, 0.56, 0.61, 0.67, 0.73, 0.79, 0.86, 0.90, 0.88, 0.84, 0.80, 0.77, 0.74],
    S7: [0.27, 0.26, 0.25, 0.24, 0.22, 0.21, 0.21, 0.22, 0.23, 0.25, 0.27, 0.28, 0.29]
  };

  return {
    generated_at: at(0),
    model_version: 'sample-0',
    step_min: 5,                       // one forecast value every 5 minutes...
    horizon_min: 60,                   // ...for the next 60 minutes (13 values, starting now)
    thresholds: { low: 0.30, high: 0.75 },
    forecasts: F,                      // every sector, for the forecast panel
    recommendations: [
      {
        id: 'sample-split-S6',
        action: 'split',
        sectors: ['S6'],
        effective_at: at(20),
        forecast: { S6: F.S6 },
        proposed: [
          { id: 'S6a', polygon: s6a, floor: 0, ceiling: 460, predicted_level: 'busy' },
          { id: 'S6b', polygon: s6b, floor: 0, ceiling: 460, predicted_level: 'busy' }
        ]
      },
      {
        id: 'sample-merge-S1-S7',
        action: 'merge',
        sectors: ['S1', 'S7'],
        effective_at: at(0),
        forecast: { S1: F.S1, S7: F.S7 },
        proposed: [
          { id: 'S1+S7', polygon: FIRGeometry.mergePolygons(S.S1, S.S7), floor: 50, ceiling: 460, predicted_level: 'normal' }
        ]
      },
      {
        id: 'sample-keep',
        action: 'keep',
        sectors: ['S2', 'S3', 'S4', 'S5']
      }
    ]
  };
}
