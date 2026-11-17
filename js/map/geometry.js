// =====================================================================
// FIRCast · js/map/geometry.js
// Used on: map.html. Needs nothing; load it before the files that use it.
//
// Small polygon helpers for sector shapes. A polygon is a list of
// [longitude, latitude] points (the last point is NOT repeated).
//
//   splitPolygon(poly)      -> [half A, half B], cut through the middle
//   mergePolygons(a, b)     -> one outline for two sectors that share a border
//   polygonCentre(poly)     -> [lon, lat] average of the corners
//
// These only exist so the sample recommendations have shapes to show.
// Once the GCAA's approved sector configurations are available, the
// proposed shapes should come from that list (through the API), not
// from cutting polygons in half here.
// =====================================================================

const FIRGeometry = (() => {
  'use strict';
  // Longitude is squeezed by cos(latitude) so "the middle" and "the longest
  // side" are measured in real distance, not raw degrees.
  const K = Math.cos((24.6 * Math.PI) / 180);

  // Average of the corners: good enough to place a label or cut a sector.
  function polygonCentre(poly) {
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }

  // Keep the part of `poly` on one side of a line (Sutherland–Hodgman clipping
  // against one edge). side(p) > 0 means "keep". The line is where side = 0.
  function clip(poly, side) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const sa = side(a), sb = side(b);
      if (sa >= 0) out.push(a);
      if ((sa >= 0) !== (sb >= 0)) {                          // the edge crosses the line: add the crossing point
        const t = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  // Cut a sector in two with a straight line through its centre, across its
  // longest direction, so the two halves are about the same size.
  function splitPolygon(poly) {
    const [cx, cy] = polygonCentre(poly);
    // find the direction in which the shape is longest (try 36 directions)
    let best = 0, bestLen = -1;
    for (let k = 0; k < 36; k++) {
      const ang = (k / 36) * Math.PI;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const proj = poly.map(([x, y]) => (x - cx) * K * ux + (y - cy) * uy);
      const len = Math.max(...proj) - Math.min(...proj);
      if (len > bestLen) { bestLen = len; best = ang; }
    }
    // the cut runs at right angles to that direction
    const nx = Math.cos(best), ny = Math.sin(best);
    const side = sign => ([x, y]) => sign * ((x - cx) * K * nx + (y - cy) * ny);
    return [clip(poly, side(1)), clip(poly, side(-1))];
  }

  // Join two neighbouring sectors into one outline. Their shared border is
  // made of edges that appear in both polygons (in opposite directions);
  // those cancel out, and the edges left over are chained into one ring.
  function mergePolygons(a, b) {
    const key = p => p[0].toFixed(5) + ',' + p[1].toFixed(5);
    const edges = [];
    [a, b].forEach(poly => poly.forEach((p, i) => edges.push([p, poly[(i + 1) % poly.length]])));
    const count = new Map();
    edges.forEach(([p, q]) => {
      const k = [key(p), key(q)].sort().join('|');
      count.set(k, (count.get(k) || 0) + 1);
    });
    const outer = edges.filter(([p, q]) => count.get([key(p), key(q)].sort().join('|')) === 1);
    if (!outer.length) return a.slice();
    // follow the outer edges from one corner to the next until we are back at the start
    const next = new Map(outer.map(([p, q]) => [key(p), q]));
    const ring = [outer[0][0]];
    let cur = outer[0][1];
    while (key(cur) !== key(ring[0]) && ring.length <= outer.length) {
      ring.push(cur);
      cur = next.get(key(cur));
      if (!cur) break;                                         // not neighbours: give up gracefully
    }
    return ring;
  }

  return { polygonCentre, splitPolygon, mergePolygons };
})();
