// A passenger, seen from behind.
//
// Units are head radii. The body is stored as (x, h) with h measured up from
// the feet; the head is stored relative to the neck with y pointing up.
// At draw time the body is bent sideways by `lean` and the head is turned by
// `lean` plus its own lagging `nod`, so the head trails the shoulders.

import { spline, wobble, fromPairs, trace, tracePolygon } from './brush.js';

const TAU = Math.PI * 2;

export function buildFigure(rng) {
  const neck = rng.range(5.4, 7.2); // feet to neck
  const shoulder = rng.range(1.35, 1.9); // half-width
  const hem = shoulder * rng.range(0.45, 0.8);
  const drop = rng.range(0.5, 0.9);

  const side = (dir, amp) => {
    const ctrl = [
      [dir * 0.3, neck + 0.3],
      [dir * 0.55, neck - 0.05],
      [dir * shoulder * 0.8, neck - drop * 0.8],
      [dir * shoulder, neck - drop - 0.7],
      [dir * shoulder * rng.range(0.9, 1.05), neck * 0.6],
      [dir * (shoulder * 0.4 + hem * 0.6), neck * 0.3],
      [dir * hem, rng.range(-0.2, 0.3)],
    ];
    return wobble(spline(ctrl, 6), rng, amp, 2);
  };

  const left = side(-1, 0.08);
  const right = side(1, 0.08);
  const bodyStrokes = [left, right];

  // Occasionally the pen goes over a line twice.
  if (rng.chance(0.3)) bodyStrokes.push(side(rng.sign(), 0.11));

  // Small things on the back: a bag strap, or a coat seam.
  const extra = rng.next();
  if (extra < 0.28) {
    const d = rng.sign();
    bodyStrokes.push(
      wobble(
        spline(
          [
            [-d * shoulder * 0.7, neck - drop - 0.3],
            [0, neck * 0.72],
            [d * shoulder * 0.85, neck * rng.range(0.4, 0.5)],
          ],
          6,
        ),
        rng,
        0.06,
        1.5,
      ),
    );
  } else if (extra < 0.5) {
    bodyStrokes.push(
      wobble(
        spline(
          [
            [rng.range(-0.1, 0.1), neck - 1.2],
            [rng.range(-0.15, 0.15), neck * 0.5],
            [rng.range(-0.1, 0.1), rng.range(0.4, 1.4)],
          ],
          6,
        ),
        rng,
        0.05,
        1.5,
      ),
    );
  }

  // Body silhouette: down the left side, back up the right.
  const nSide = left.length >> 1;
  const bodyFill = new Float32Array(left.length + right.length);
  bodyFill.set(left, 0);
  for (let i = 0; i < nSide; i++) {
    const j = nSide - 1 - i;
    bodyFill[left.length + i * 2] = right[j * 2];
    bodyFill[left.length + i * 2 + 1] = right[j * 2 + 1];
  }

  // Head: a lopsided loop that runs past its own start, like a pen circle.
  const sx = rng.range(0.92, 1.08);
  const sy = rng.range(1.05, 1.3);
  const cx = rng.range(-0.12, 0.12);
  const cy = sy * 0.8;
  const e2 = rng.range(0, 0.06);
  const p2 = rng.range(0, TAU);
  const e3 = rng.range(0.02, 0.09);
  const p3 = rng.range(0, TAU);
  const start = rng.range(0, TAU);
  const overshoot = rng.range(0.25, 0.9);
  const spin = rng.sign();
  const drift = rng.range(-0.07, 0.07);

  const N = 46;
  const loop = new Float32Array((N + 1) * 2);
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = start + spin * u * (TAU + overshoot);
    const r = (1 + e2 * Math.cos(2 * a - p2) + e3 * Math.cos(3 * a - p3)) * (1 + drift * (u - 0.5));
    loop[i * 2] = cx + sx * r * Math.cos(a);
    loop[i * 2 + 1] = cy + sy * r * Math.sin(a);
  }
  wobble(loop, rng, 0.03, 3);
  const headFill = loop.slice(0, Math.ceil((N * TAU) / (TAU + overshoot)) * 2);

  // Hair, from the back. Either one continuous scribble, a few tufts, or none.
  const hairStrokes = [];
  const hair = rng.next();
  if (hair < 0.4) {
    const rows = rng.int(14, 26);
    const top = cy + sy * 0.9;
    const bottom = cy - sy * rng.range(0.0, 0.55);
    const tilt = rng.range(-0.3, 0.3);
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const pairs = [];
    for (let i = 0; i <= rows; i++) {
      const y = top + (bottom - top) * (i / rows) - cy;
      const half = sx * 0.9 * Math.sqrt(Math.max(0, 1 - (y / (sy * 0.97)) ** 2));
      const x = (i % 2 ? 1 : -1) * half * rng.range(0.8, 1);
      const yj = y + rng.range(-0.04, 0.04);
      pairs.push([cx + x * cos + yj * sin, cy - x * sin + yj * cos]);
    }
    hairStrokes.push(fromPairs(pairs));
  } else if (hair < 0.65) {
    const tufts = rng.int(3, 6);
    for (let i = 0; i < tufts; i++) {
      const x0 = cx + rng.range(-0.5, 0.5) * sx;
      const y0 = cy + sy * rng.range(0.35, 0.8);
      const len = rng.range(0.5, 1.1);
      const bend = rng.range(-0.35, 0.35);
      hairStrokes.push(
        wobble(
          spline(
            [
              [x0, y0],
              [x0 + bend * 0.5, y0 - len * 0.5],
              [x0 + bend, y0 - len],
            ],
            4,
          ),
          rng,
          0.03,
          1,
        ),
      );
    }
  }

  return {
    neck,
    shoulder,
    bodyFill,
    bodyStrokes,
    headFill,
    headStrokes: [loop],
    hairStrokes,

    // How this person moves. Everyone is a little different so the crowd
    // ripples instead of swaying as one block.
    freq: rng.range(4.2, 6.5), // rad/s
    damping: rng.range(0.16, 0.3),
    weight: rng.range(0.75, 1.25),
    headFreq: rng.range(9, 13),
    headDamping: rng.range(0.25, 0.4),
    headWeight: rng.range(0.6, 1.2),

    lean: 0,
    leanVel: 0,
    nod: 0,
    nodVel: 0,
    push: 0,
  };
}

// Draw one figure. (fx, fy) is where the feet are on screen, s is pixels per
// head radius.
export function drawFigure(ctx, f, fx, fy, s, style) {
  const reach = f.lean * f.neck;

  const bodyTf = (x, h, out) => {
    const t = h > 0 ? h / f.neck : 0;
    out[0] = fx + s * (x + reach * Math.pow(t, 1.4));
    out[1] = fy - s * h;
  };

  const nx = fx + s * reach;
  const ny = fy - s * f.neck;
  const turn = f.lean * 0.5 + f.nod;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const headTf = (x, y, out) => {
    out[0] = nx + s * (x * cos + y * sin);
    out[1] = ny - s * (-x * sin + y * cos);
  };

  ctx.fillStyle = style.paper;
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = style.width;

  ctx.beginPath();
  tracePolygon(ctx, f.bodyFill, bodyTf);
  ctx.fill();
  ctx.beginPath();
  for (const pts of f.bodyStrokes) trace(ctx, pts, bodyTf);
  ctx.stroke();

  ctx.beginPath();
  tracePolygon(ctx, f.headFill, headTf);
  ctx.fill();
  ctx.beginPath();
  for (const pts of f.headStrokes) trace(ctx, pts, headTf);
  ctx.stroke();

  if (f.hairStrokes.length) {
    ctx.lineWidth = style.width * 0.85;
    ctx.beginPath();
    for (const pts of f.hairStrokes) trace(ctx, pts, headTf);
    ctx.stroke();
  }
}
