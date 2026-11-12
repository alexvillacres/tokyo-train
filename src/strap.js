// A hanging strap handle: a pendulum drawn with the same pen.
// Local units match the figures (head radii); y points down from the pivot.

import { spline, wobble, trace } from './brush.js';

export function buildStrap(rng) {
  const len = rng.range(2.3, 3.0);
  const strokes = [];

  // Clamp on the rail.
  strokes.push(
    wobble(
      spline(
        [
          [-0.34, -0.22],
          [0.34, -0.24],
          [0.36, 0.28],
          [-0.33, 0.3],
        ],
        4,
        true,
      ),
      rng,
      0.03,
      2,
    ),
  );

  // Strap: two nearly parallel lines.
  for (const dir of [-1, 1]) {
    strokes.push(
      wobble(
        spline(
          [
            [dir * 0.17, 0.25],
            [dir * 0.15, len * 0.5],
            [dir * 0.14, len + 0.05],
          ],
          5,
        ),
        rng,
        0.025,
        1.5,
      ),
    );
  }

  // Handle: a rounded triangle, outer and inner edge.
  const top = [0, len - 0.1];
  const bl = [-0.78, len + 1.25];
  const br = [0.78, len + 1.25];
  const mid = [0, len + 0.8];
  const corners = [top, br, bl];
  const rounded = (scale) => {
    const ctrl = [];
    for (let i = 0; i < 3; i++) {
      const v = corners[i];
      const prev = corners[(i + 2) % 3];
      const next = corners[(i + 1) % 3];
      for (const other of [prev, next]) {
        const x = v[0] + (other[0] - v[0]) * 0.22;
        const y = v[1] + (other[1] - v[1]) * 0.22;
        ctrl.push([mid[0] + (x - mid[0]) * scale, mid[1] + (y - mid[1]) * scale]);
      }
    }
    return wobble(spline(ctrl, 5, true), rng, 0.03, 2);
  };
  strokes.push(rounded(1), rounded(0.55));

  return {
    strokes,
    freq: rng.range(4.8, 6.6),
    swing: 0,
    swingVel: 0,
  };
}

export function drawStrap(ctx, strap, px, py, s) {
  const cos = Math.cos(strap.swing);
  const sin = Math.sin(strap.swing);
  const tf = (x, y, out) => {
    out[0] = px + s * (x * cos + y * sin);
    out[1] = py + s * (-x * sin + y * cos);
  };
  ctx.beginPath();
  for (const pts of strap.strokes) trace(ctx, pts, tf);
  ctx.stroke();
}
