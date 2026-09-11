/*
 * Wheel engine
 * ------------
 * Mental model: think of the wheel as a clock face that turns clockwise under a
 * fixed pointer at 12 o'clock.
 *
 *   • Segment i owns the slice from  i·s  to (i+1)·s  degrees, measured clockwise
 *     from 12 o'clock on the *unrotated* wheel (s = 360 / n).
 *   • If the wheel has turned R degrees clockwise, the point now sitting under the
 *     pointer is the point that started at  (−R mod 360).
 *   • So the winner is simply  floor( (−R mod 360) / s ).
 *
 * To land on a chosen segment we run that backwards: pick a spot inside the slice
 * (not too near an edge), work out which rotation puts it under the pointer, and
 * add a few full turns for drama. After the animation stops we read the winner
 * back from the final angle with the same formula, so the card can never
 * disagree with what you see.
 */
(function (root) {
  const TAU_DEG = 360;

  const mod = (a, m) => ((a % m) + m) % m;

  function segmentAngle(n) {
    return TAU_DEG / n;
  }

  /** Which segment sits under the 12 o'clock pointer for a wheel rotated `rotationDeg` clockwise. */
  function indexAtPointer(rotationDeg, n) {
    const local = mod(-rotationDeg, TAU_DEG);
    return Math.min(n - 1, Math.floor(local / segmentAngle(n)));
  }

  /**
   * Absolute rotation (always greater than `currentRot`) that parks `index` under the pointer.
   * offsetFrac: where inside the slice to stop (0.5 = dead centre). Kept away from edges.
   */
  function rotationForIndex(currentRot, index, n, { spins = 6, offsetFrac = 0.5 } = {}) {
    const s = segmentAngle(n);
    const frac = Math.max(0.18, Math.min(0.82, offsetFrac));
    const localTarget = (index + frac) * s; // wheel-local angle we want under the pointer
    const targetMod = mod(-localTarget, TAU_DEG); // rotation (mod 360) that achieves it
    const currentMod = mod(currentRot, TAU_DEG);
    const delta = mod(targetMod - currentMod, TAU_DEG);
    return currentRot + spins * TAU_DEG + delta;
  }

  /** Pick one item; weights are relative (2 = twice as likely as 1). */
  function weightedPick(items, weights, rnd = Math.random) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (!items.length || total <= 0) return null;
    let r = rnd() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Draw k distinct items, each draw weighted (like pulling raffle tickets without putting them back). */
  function weightedSample(items, weightFn, k, rnd = Math.random) {
    const pool = items.slice();
    const out = [];
    while (out.length < k && pool.length) {
      const pick = weightedPick(pool, pool.map(weightFn), rnd);
      out.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
    return out;
  }

  function shuffle(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ───────────── SVG rendering ─────────────
  // Angle convention for drawing matches the math above: degrees clockwise from 12 o'clock.
  const pt = (r, deg) => {
    const rad = (deg * Math.PI) / 180;
    return [+(r * Math.sin(rad)).toFixed(3), +(-r * Math.cos(rad)).toFixed(3)];
  };

  function slicePath(rOuter, rInner, a0, a1) {
    const large = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = pt(rOuter, a0);
    const [x1, y1] = pt(rOuter, a1);
    const [x2, y2] = pt(rInner, a1);
    const [x3, y3] = pt(rInner, a0);
    return `M${x0} ${y0} A${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rInner} ${rInner} 0 ${large} 0 ${x3} ${y3}Z`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Colour index per segment so neighbours (including last↔first) never match. */
  function colorIndices(n, paletteSize) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(i % paletteSize);
    if (n > 1 && out[n - 1] === out[0]) {
      for (let c = 0; c < paletteSize; c++) {
        if (c !== out[0] && c !== out[n - 2]) { out[n - 1] = c; break; }
      }
    }
    return out;
  }

  /**
   * segments: [{ key, label, sub?, emoji }]
   * Returns an SVG string. viewBox is centred on 0,0 so rotation is about the middle.
   */
  function renderWheelSVG(segments, { hidden = false } = {}) {
    const n = segments.length;
    const R = 196; // outer radius of the rim
    const rSeg = 178; // outer radius of the coloured slices
    const rBand = 168; // accent band inner edge
    const rHub = 46;
    const s = segmentAngle(n);
    const colors = colorIndices(n, 5);
    const fontSize = n > 10 ? 12.5 : n > 7 ? 14 : 16;

    let slices = '';
    let labels = '';
    segments.forEach((seg, i) => {
      const a0 = i * s;
      const a1 = (i + 1) * s;
      const c = colors[i];
      slices +=
        `<path class="seg seg-c${c}" data-index="${i}" data-key="${esc(seg.key)}" d="${slicePath(rSeg, rHub, a0, a1)}"/>` +
        `<path class="band band-c${c}" d="${slicePath(rSeg, rBand, a0, a1)}" pointer-events="none"/>`;

      // Labels run along the radius, reading from the hub outward, centred in the slice.
      const mid = a0 + s / 2;
      const text = hidden ? '?' : seg.label;
      const emoji = hidden ? '♥' : seg.emoji || '';
      const sub = hidden ? '' : seg.sub || '';
      labels +=
        `<g class="lbl" transform="rotate(${mid.toFixed(3)}) translate(0 ${-(rHub + (rBand - rHub) / 2)}) rotate(-90)" pointer-events="none">` +
        `<text class="lbl-main" x="${sub ? 0 : 2}" y="${sub ? -3 : 0}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">` +
        `<tspan class="lbl-emoji">${esc(emoji)}</tspan><tspan dx="4">${esc(text)}</tspan></text>` +
        (sub ? `<text class="lbl-sub" y="${fontSize - 1}" font-size="${fontSize - 4}" text-anchor="middle" dominant-baseline="central">${esc(sub)}</text>` : '') +
        `</g>`;
    });

    // Rim "bulbs" — decorative lights that twinkle while spinning (see CSS .spinning).
    let bulbs = '';
    const bulbCount = 32;
    for (let i = 0; i < bulbCount; i++) {
      const [x, y] = pt((R + rSeg) / 2 + 1, (i * 360) / bulbCount);
      bulbs += `<circle class="bulb ${i % 2 ? 'b2' : 'b1'}" cx="${x}" cy="${y}" r="3.1"/>`;
    }

    // Thin dividers between slices
    let dividers = '';
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pt(rHub, i * s);
      const [x1, y1] = pt(rSeg, i * s);
      dividers += `<line class="divider" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;
    }

    return (
      `<svg class="wheel-svg" viewBox="-200 -200 400 400" role="img" aria-label="Date wheel with ${n} options" xmlns="http://www.w3.org/2000/svg">` +
      `<circle class="rim" r="${R}"/>` +
      `<circle class="rim-inner" r="${rSeg + 1.5}"/>` +
      `<g class="slices">${slices}</g>` +
      `<g class="dividers">${dividers}</g>` +
      `<g class="labels">${labels}</g>` +
      `<g class="bulbs">${bulbs}</g>` +
      `</svg>`
    );
  }

  // ───────────── Animation ─────────────
  // easeOutQuart: fast start, long suspenseful slow-down. t in [0,1].
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  /**
   * Drives the rotation with requestAnimationFrame. We compute progress from the
   * real clock (performance.now), so if iOS pauses the tab mid-spin the wheel
   * still finishes on the exact target when you come back.
   */
  function animateSpin({ from, to, duration, onFrame, onDone, ease = easeOutQuart }) {
    const start = performance.now();
    let raf = 0;
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const rot = from + (to - from) * ease(t);
      onFrame(rot, t);
      if (t < 1) raf = requestAnimationFrame(frame);
      else onDone(to);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  const API = {
    mod, segmentAngle, indexAtPointer, rotationForIndex,
    weightedPick, weightedSample, shuffle,
    renderWheelSVG, colorIndices, animateSpin, easeOutQuart
  };
  root.RVAWheel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
