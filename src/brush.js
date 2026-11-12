// The pen.
//
// A stroke is a Float32Array of points: [x0, y0, x1, y1, ...].
// Strokes are built once (spline + wobble) and never re-randomised, so lines
// hold still unless the physics moves them. Drawing is a plain canvas path:
// no stamping, no per-segment widths.

const TAU = Math.PI * 2;

// Catmull-Rom spline through control points [[x, y], ...].
export function spline(ctrl, perSegment = 6, closed = false) {
  const n = ctrl.length;
  const segments = closed ? n : n - 1;
  const out = new Float32Array((segments * perSegment + 1) * 2);
  const at = (i) => (closed ? ctrl[((i % n) + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))]);

  let k = 0;
  for (let s = 0; s < segments; s++) {
    const p0 = at(s - 1);
    const p1 = at(s);
    const p2 = at(s + 1);
    const p3 = at(s + 2);
    for (let j = 0; j < perSegment; j++) {
      const t = j / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      for (let d = 0; d < 2; d++) {
        out[k++] =
          0.5 *
          (2 * p1[d] +
            (-p0[d] + p2[d]) * t +
            (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
            (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
      }
    }
  }
  const last = closed ? ctrl[0] : ctrl[n - 1];
  out[k++] = last[0];
  out[k++] = last[1];
  return out;
}

// Push a stroke off its ideal path: slow drift plus a little hand tremor.
export function wobble(pts, rng, amp, waves = 2) {
  const n = pts.length >> 1;
  const p1 = rng.range(0, TAU);
  const p2 = rng.range(0, TAU);
  const p3 = rng.range(0, TAU);
  const p4 = rng.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const a = t * waves * TAU;
    pts[i * 2] += amp * (0.7 * Math.sin(a + p1) + 0.3 * Math.sin(a * 2.3 + p2)) + amp * 0.12 * (rng.next() - 0.5);
    pts[i * 2 + 1] += amp * (0.7 * Math.sin(a * 0.9 + p3) + 0.3 * Math.sin(a * 2.7 + p4)) + amp * 0.12 * (rng.next() - 0.5);
  }
  return pts;
}

export function fromPairs(pairs) {
  const out = new Float32Array(pairs.length * 2);
  for (let i = 0; i < pairs.length; i++) {
    out[i * 2] = pairs[i][0];
    out[i * 2 + 1] = pairs[i][1];
  }
  return out;
}

const tmp = [0, 0];

// Add a stroke to the current path, passing every point through `tf`,
// which maps local (x, y) to screen and writes into its third argument.
// Corners are rounded by drawing through segment midpoints.
export function trace(ctx, pts, tf) {
  const n = pts.length >> 1;
  tf(pts[0], pts[1], tmp);
  let px = tmp[0];
  let py = tmp[1];
  ctx.moveTo(px, py);
  for (let i = 1; i < n; i++) {
    tf(pts[i * 2], pts[i * 2 + 1], tmp);
    ctx.quadraticCurveTo(px, py, (px + tmp[0]) / 2, (py + tmp[1]) / 2);
    px = tmp[0];
    py = tmp[1];
  }
  ctx.lineTo(px, py);
}

// Same, as a closed polygon for fills (used to hide whatever is behind).
export function tracePolygon(ctx, pts, tf) {
  const n = pts.length >> 1;
  tf(pts[0], pts[1], tmp);
  ctx.moveTo(tmp[0], tmp[1]);
  for (let i = 1; i < n; i++) {
    tf(pts[i * 2], pts[i * 2 + 1], tmp);
    ctx.lineTo(tmp[0], tmp[1]);
  }
  ctx.closePath();
}
