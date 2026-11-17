// =====================================================================
// FIRCast · js/insights/year-dial.js
// Used on: insights.html. Needs nothing; timeline.js creates the dial.
//
// The year picker: years sit on a half-circle arc, like the top of a dial.
//   - Turn it by dragging (mouse), swiping (finger), scrolling sideways
//     (trackpad or mouse wheel), the left / right arrow keys, or by
//     clicking a year.
//   - "Magnetic": when you let go, the dial coasts a little with your speed
//     and then pulls the nearest year into the centre, under the red marker.
//   - The centre year is big; years further along the arc are smaller,
//     tilted with the curve, and fade out.
//
//   const dial = YearDial(element, [2024, 2025, 2026], 2026, year => ...);
//   dial.go(2025)   turn to a year (used by the page's arrow keys)
//
// How it moves: `pos` is the dial's position in "years" (0 = first year,
// 1 = second ...; it can sit between years while moving). Each frame `pos`
// eases towards `target`, and every year is placed on the arc at an angle of
// (its index - pos) x STEP. The animation loop only runs while it moves.
// =====================================================================

function YearDial(root, years, initial, onChange) {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  let STEP = (16 * Math.PI) / 180;            // angle between two years on the arc (set in place())
  const MARKER_GAP = 46;                      // px from the arc to the tip of the red marker (keeps it clear of the year)

  // the dotted arc and the red marker are one SVG behind the year labels
  const arc = document.createElementNS(NS, 'svg');
  arc.setAttribute('class', 'dial-arc');
  arc.setAttribute('aria-hidden', 'true');
  root.append(arc);
  const labels = years.map((y, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dial-year'; b.textContent = y; b.tabIndex = -1;
    b.addEventListener('click', () => { if (!moved) go(years[i]); });
    root.append(b);
    return b;
  });

  let pos = Math.max(0, years.indexOf(initial)), target = pos, shown = years[pos];
  let running = false, dragging = false, moved = false;
  let startX = 0, startPos = 0, lastX = 0, lastT = 0, speed = 0, wheelTimer = null;

  // ---- Drawing ----
  function place() {
    const w = root.clientWidth, h = root.clientHeight;
    const R = Math.min(w * 0.9, 520);                         // arc radius: gentler on wide screens
    const cx = w / 2, cy = R + 62;                            // the arc's top sits 62 px below the box's top
    // a flat arc: 16° between years, but never so close that neighbours touch on a narrow screen
    STEP = Math.max((16 * Math.PI) / 180, 140 / R);
    arc.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const end = Math.min(1.1, STEP * 2.6);                    // the dotted arc reaches a bit past two years each side
    arc.innerHTML =
      `<path d="M${cx - R * Math.sin(end)},${cy - R * Math.cos(end)} A${R} ${R} 0 0 1 ${cx + R * Math.sin(end)},${cy - R * Math.cos(end)}" class="dial-line"/>` +
      `<path d="M${cx - 10},${cy - R - MARKER_GAP - 14} L${cx + 10},${cy - R - MARKER_GAP - 14} L${cx},${cy - R - MARKER_GAP} Z" class="dial-marker"/>`;
    labels.forEach((el, i) => {
      const a = (i - pos) * STEP, d = Math.abs(i - pos);
      const near = Math.max(0, 1 - d);                        // 1 at the centre, 0 one year away or more
      const opacity = Math.max(0, 1 - d * 0.36);
      el.style.fontSize = `${28 + near * 28}px`;              // 56 px in the centre, 28 px elsewhere
      el.style.opacity = opacity;
      el.style.transform = `translate(-50%, -50%) translate(${R * Math.sin(a)}px, ${cy - R * Math.cos(a)}px) rotate(${a}rad)`;
      el.style.visibility = opacity < 0.08 ? 'hidden' : 'visible';
      el.classList.toggle('is-centre', d < 0.5);
    });
    const now = years[Math.round(Math.max(0, Math.min(years.length - 1, pos)))];
    root.setAttribute('aria-valuenow', now);
    root.setAttribute('aria-valuetext', String(now));
    if (now !== shown) { shown = now; onChange(now); }       // tell the page as soon as a new year reaches the centre
  }

  // ---- Animation: ease pos towards target, stop when settled ----
  function frame() {
    if (!dragging) {
      pos += (target - pos) * (reduceMotion ? 1 : 0.16);
      if (Math.abs(target - pos) < 0.002) pos = target;
    }
    place();
    if (dragging || pos !== target) requestAnimationFrame(frame);
    else running = false;
  }
  function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }

  const clampPos = v => Math.max(-0.35, Math.min(years.length - 1 + 0.35, v));   // a little stretch past the ends
  function snap(extra = 0) {                                  // the magnet: settle on the nearest year
    target = Math.max(0, Math.min(years.length - 1, Math.round(pos + extra)));
    wake();
  }
  function go(year) {
    const i = years.indexOf(year);
    if (i < 0) return;
    target = i; wake();
  }

  // ---- Drag / swipe ----
  root.addEventListener('pointerdown', e => {
    dragging = true; moved = false;
    root.classList.add('is-dragging');
    startX = lastX = e.clientX; startPos = pos; lastT = performance.now(); speed = 0;
    root.setPointerCapture(e.pointerId);
    wake();
  });
  root.addEventListener('pointermove', e => {
    if (!dragging) return;
    const perYear = root.clientWidth * 0.16;                  // drag this many px to move one year
    if (Math.abs(e.clientX - startX) > 5) moved = true;
    pos = clampPos(startPos - (e.clientX - startX) / perYear);
    const t = performance.now();
    speed = (e.clientX - lastX) / Math.max(1, t - lastT);     // px per ms, for the coast after letting go
    lastX = e.clientX; lastT = t;
  });
  function release(e) {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    if (!moved) {                                             // a click, not a drag: go to the year under the pointer
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const i = labels.indexOf(hit);
      if (i >= 0) { target = i; wake(); return; }
    }
    snap(-speed * 2.2);                                       // a fast flick coasts further
    setTimeout(() => { moved = false; }, 0);
  }
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);

  // ---- Trackpad / mouse wheel: sideways (or up/down) scroll turns the dial ----
  root.addEventListener('wheel', e => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    e.preventDefault();
    pos = clampPos(pos + d * 0.006); target = pos; wake();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => snap(), 140);               // the scroll stopped: snap
  }, { passive: false });

  // ---- Keyboard (when the dial has focus) ----
  root.addEventListener('keydown', e => {
    const i = Math.round(target);
    if (e.key === 'ArrowLeft') { go(years[Math.max(0, i - 1)]); e.preventDefault(); }
    if (e.key === 'ArrowRight') { go(years[Math.min(years.length - 1, i + 1)]); e.preventDefault(); }
    if (e.key === 'Home') { go(years[0]); e.preventDefault(); }
    if (e.key === 'End') { go(years[years.length - 1]); e.preventDefault(); }
  });

  root.setAttribute('aria-valuemin', years[0]);
  root.setAttribute('aria-valuemax', years[years.length - 1]);
  new ResizeObserver(place).observe(root);
  place();
  return { go, current: () => shown };
}
