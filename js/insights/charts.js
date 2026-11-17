// =====================================================================
// FIRCast · js/insights/charts.js
// Used on: insights-month.html. Needs nothing.
//
// Three small SVG charts in FIRCast's style, drawn at the box's real width
// so text stays at its true size on any screen:
//   FIRCharts.line(box, values, opts)      one line over time, with hover
//   FIRCharts.bars(box, items, opts)       horizontal bars, value at the tip
//   FIRCharts.columns(box, items, opts)    vertical columns, value on the cap
//   FIRCharts.split(box, parts)            one bar split into labelled parts
// Marks follow one spec: 2px lines, bars at most 24px thick with a 4px
// rounded end, hairline grid, labels in text colours (never the bar colour).
// =====================================================================

const FIRCharts = (() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#13233A', MUTED = '#2B4566', GRID = 'rgba(19, 35, 58, 0.12)', SURFACE = '#FBF4DB';
  const fmt = n => n.toLocaleString('en');

  function svgIn(box, H) {
    const W = Math.max(260, Math.round(box.clientWidth || 400));
    box.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart-svg');
    box.append(svg);
    return { svg, W, H };
  }
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (text !== undefined) n.textContent = text;
    parent.append(n);
    return n;
  }
  // A bar shape with a 4px rounded end (right end for bars, top for columns).
  function roundedBar(x, y, w, h, horizontal) {
    const r = Math.min(4, horizontal ? w : h, horizontal ? h / 2 : w / 2);
    if (horizontal) return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }
  // Clean axis maximum: the next round number above v (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten).
  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(k => k * p).find(k => k >= v);
  }

  // ---- Line over time (flights per day) ----
  // opts: { labelFor(i) -> tooltip text, xLabel(i) -> axis text, mark: index to label }
  function line(box, values, opts) {
    const { svg, W, H } = svgIn(box, 200);
    const L = 46, R = 16, T = 16, B = 26;
    const max = niceMax(Math.max(...values) * 1.05);
    const x = i => L + (i / Math.max(1, values.length - 1)) * (W - L - R);
    const y = v => T + (1 - v / max) * (H - T - B);
    [0, max / 2, max].forEach(v => {
      el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: GRID }, svg);
      el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, svg, fmt(v));
    });
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    el('path', { d: `M${x(0)},${y(0)} L${pts.join(' L')} L${x(values.length - 1)},${y(0)} Z`, fill: INK, 'fill-opacity': 0.08 }, svg);
    el('polyline', { points: pts.join(' '), fill: 'none', stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    for (let i = 0; i < values.length; i += 7) {
      el('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : 'middle', class: 'ax' }, svg, opts.xLabel(i));
    }
    if (opts.mark !== undefined) {                                   // label the one point the story is about
      const i = opts.mark;
      el('circle', { cx: x(i), cy: y(values[i]), r: 5, fill: INK, stroke: SURFACE, 'stroke-width': 2 }, svg);
      const right = x(i) > W - 120;
      el('text', { x: x(i) + (right ? -10 : 10), y: y(values[i]) - 8, 'text-anchor': right ? 'end' : 'start', class: 'mk' }, svg, opts.markText);
    }
    // hover: guide line, dot and a readout
    const guide = el('line', { y1: T, y2: H - B, stroke: INK, 'stroke-opacity': 0.3, visibility: 'hidden' }, svg);
    const dot = el('circle', { r: 5, fill: INK, stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' }, svg);
    const tip = document.createElement('p'); tip.className = 'chart-tip'; tip.hidden = true; box.append(tip);
    svg.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(values.length - 1, Math.round(((px - L) / (W - L - R)) * (values.length - 1))));
      guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(values[i])); dot.setAttribute('visibility', 'visible');
      tip.textContent = opts.labelFor(i);
      tip.style.left = `${Math.min(80, Math.max(20, (x(i) / W) * 100))}%`;
      tip.hidden = false;
    });
    svg.addEventListener('pointerleave', () => { guide.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; });
  }

  // ---- Horizontal bars (hours above the limit by sector, override reasons) ----
  // items: [{ label, value, text }] already sorted; the value is printed at the tip.
  function bars(box, items, opts = {}) {
    const rowH = 30, bar = 14;
    const { svg, W } = svgIn(box, items.length * rowH + 4);
    const L = opts.labelWidth || 44, R = 70;
    const max = Math.max(...items.map(d => d.value), 1);
    items.forEach((d, k) => {
      const yy = k * rowH + (rowH - bar) / 2;
      el('text', { x: 0, y: yy + bar - 2, class: 'lb' }, svg, d.label);
      const w = Math.max(d.value > 0 ? 4 : 0, (d.value / max) * (W - L - R));
      el('path', { d: roundedBar(L, yy, w, bar, true), fill: opts.colour || INK }, svg);
      el('text', { x: L + w + 8, y: yy + bar - 2, class: 'vl' }, svg, d.text ?? fmt(d.value));
    });
  }

  // ---- Columns (error by forecast horizon) ----
  function columns(box, items, opts = {}) {
    const { svg, W, H } = svgIn(box, 170);
    const T = 22, B = 26;
    const max = niceMax(Math.max(...items.map(d => d.value)) * 1.1);
    const slot = W / items.length, colW = Math.min(24, slot * 0.5);
    el('line', { x1: 0, x2: W, y1: H - B, y2: H - B, stroke: GRID }, svg);
    items.forEach((d, k) => {
      const cx = slot * k + slot / 2;
      const h = (d.value / max) * (H - T - B);
      el('path', { d: roundedBar(cx - colW / 2, H - B - h, colW, h, false), fill: opts.colour || INK }, svg);
      el('text', { x: cx, y: H - B - h - 6, 'text-anchor': 'middle', class: 'vl' }, svg, d.text ?? String(d.value));
      el('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'ax' }, svg, d.label);
    });
  }

  // ---- One bar split into parts (accepted / overridden) ----
  // parts: [{ label, value, colour }]; a 2px gap separates the parts.
  function split(box, parts) {
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    box.innerHTML = '';
    const bar = document.createElement('div'); bar.className = 'split-bar';
    const key = document.createElement('div'); key.className = 'split-key';
    parts.forEach(p => {
      const seg = document.createElement('span');
      seg.style.flexGrow = p.value; seg.style.background = p.colour;
      seg.title = `${p.label}: ${fmt(p.value)}`;
      bar.append(seg);
      const k = document.createElement('span');
      k.innerHTML = `<i style="background:${p.colour}"></i>${p.label} <b>${Math.round((p.value / total) * 100)}%</b> · ${fmt(p.value)}`;
      key.append(k);
    });
    box.append(bar, key);
  }

  return { line, bars, columns, split };
})();
