// The train car: layout, physics, and drawing order.
//
// Physics in one paragraph: the car has a sideways position that chases the
// cursor. Its acceleration is the only force in the scene. Every passenger is
// a damped spring that leans against that acceleration, overshoots and
// settles; heads are a second, faster spring riding on the shoulders; strap
// handles are lightly damped pendulums. Neighbours in a row push each other
// apart when they lean into one another, which passes a bump along the row.

import { createRng } from './rng.js';
import { spline, wobble, trace } from './brush.js';
import { buildFigure, drawFigure } from './figure.js';
import { buildStrap, drawStrap } from './strap.js';

const PAPER = '#ece6d8';
const INK = '27, 26, 24';
const GRID = 'rgba(70, 96, 120, 0.13)';

const ROWS = [7, 6, 6, 5, 4, 4]; // back to front
const CAR_FOLLOW = 7; // how briskly the car chases the cursor (rad/s)
const LEAN_GAIN = 0.011; // lean per unit of car acceleration
const HEAD_GAIN = 0.02;
const STRAP_GAIN = 0.019;
const STEP = 1 / 120;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createScene(seed = 4509) {
  let W = 0;
  let H = 0;
  let figures = [];
  let rows = [];
  let straps = [];
  let rails = [];
  let gridStep = 26;

  // Car state. Position is in half-screens: -1 is the left edge, 1 the right.
  let carX = 0;
  let carVel = 0;
  let time = 0;
  let carry = 0;

  // Track noise: a low rumble and the occasional double clack of a rail joint.
  const noise = createRng(seed ^ 0x9e3779b9);
  let kick = 0;
  let kickDir = 1;
  let nextClack = 1.5;
  let secondClack = false;

  function layout(width, height) {
    W = width;
    H = height;
    const rng = createRng(seed);
    const unit = clamp(Math.sqrt(W * H) * 0.045, 20, 60);
    const aspect = clamp(W / H / 1.4, 0.55, 1.5);
    gridStep = clamp(Math.round(unit * 0.55), 16, 30);

    figures = [];
    rows = [];
    ROWS.forEach((base, r) => {
      const z = r / (ROWS.length - 1); // 0 far, 1 near
      const count = Math.max(2, Math.round(base * aspect));
      const s = unit * lerp(0.42, 1.75, Math.pow(z, 1.25));
      const half = W * lerp(0.26, 0.62, z);
      const spacing = (half * 2) / count;
      const stagger = r % 2 ? spacing * 0.5 : 0;
      const headY = H * lerp(0.26, 0.98, z);
      const row = [];
      for (let i = 0; i < count; i++) {
        const f = buildFigure(rng);
        f.z = z;
        f.s = s;
        f.x = W / 2 - half + spacing * (i + 0.5) + stagger - spacing * 0.25 + rng.range(-0.22, 0.22) * spacing;
        f.y = headY + rng.range(-0.022, 0.022) * H * (0.5 + z) + s * (f.neck + 0.85);
        row.push(f);
        figures.push(f);
      }
      row.sort((a, b) => a.x - b.x);
      rows.push(row);
    });
    figures.sort((a, b) => a.z - b.z || a.y - b.y);

    // Two rails running away from the viewer, with handles hanging off them.
    straps = [];
    rails = [];
    for (const dir of [-1, 1]) {
      const near = [W / 2 + dir * W * 0.49, -H * 0.04];
      const far = [W / 2 + dir * W * 0.12, H * 0.125];
      for (const offset of [0, unit * 0.16]) {
        const a = [near[0] + dir * W * 0.12, near[1] - H * 0.05 + offset];
        const b = [lerp(near[0], far[0], 0.5), lerp(near[1], far[1], 0.5) + offset * 0.6];
        const c = [far[0] - dir * W * 0.03, far[1] + H * 0.012 + offset * 0.3];
        rails.push(wobble(spline([a, b, c], 10), rng, unit * 0.035, 2));
      }
      for (const t of [0.1, 0.32, 0.52, 0.7, 0.86]) {
        const strap = buildStrap(rng);
        strap.x = lerp(near[0], far[0], t);
        strap.y = lerp(near[1], far[1], t) + unit * 0.1;
        strap.z = 1 - t;
        strap.s = unit * lerp(1.45, 0.4, t);
        straps.push(strap);
      }
    }
    straps.sort((a, b) => a.z - b.z);
  }

  function trackNoise(h) {
    kick *= Math.exp(-h / 0.045);
    if (time >= nextClack) {
      kick += kickDir * 5;
      if (secondClack) {
        nextClack = time + noise.range(2.2, 5);
        kickDir = noise.sign();
      } else {
        nextClack = time + 0.17;
      }
      secondClack = !secondClack;
    }
    return 0.45 * (Math.sin(time * 11.3) + Math.sin(time * 17.9 + 1) + Math.sin(time * 7.1 + 2)) + kick;
  }

  function tick(h, target, rumble) {
    time += h;

    const carAcc = CAR_FOLLOW * CAR_FOLLOW * (target - carX) - 2 * CAR_FOLLOW * carVel;
    carVel += carAcc * h;
    carX += carVel * h;

    const acc = carAcc * 30 + (rumble ? trackNoise(h) * 30 : 0);

    // Neighbours bump shoulders.
    for (const f of figures) f.push = 0;
    for (const row of rows) {
      for (let i = 0; i < row.length - 1; i++) {
        const a = row[i];
        const b = row[i + 1];
        const reachA = a.s * a.neck;
        const reachB = b.s * b.neck;
        const rest = b.x - a.x;
        const room = Math.min(rest * 0.85, (a.shoulder * a.s + b.shoulder * b.s) * 0.9);
        const gap = rest + b.lean * reachB - a.lean * reachA;
        if (gap < room) {
          const closing = a.leanVel * reachA - b.leanVel * reachB;
          const force = 90 * (room - gap) + 6 * Math.max(0, closing);
          a.push -= force / reachA;
          b.push += force / reachB;
        }
      }
    }

    for (const f of figures) {
      const k = f.freq * f.freq;
      const leanAcc =
        -k * f.lean -
        k * 8 * f.lean * f.lean * f.lean - // stiffens at the extremes, so nobody falls over
        2 * f.damping * f.freq * f.leanVel -
        LEAN_GAIN * f.weight * acc +
        f.push;
      f.leanVel += leanAcc * h;
      f.lean += f.leanVel * h;

      const kh = f.headFreq * f.headFreq;
      const nodAcc =
        -kh * f.nod -
        2 * f.headDamping * f.headFreq * f.nodVel -
        HEAD_GAIN * f.headWeight * acc -
        0.45 * leanAcc; // the head is late to follow the shoulders
      f.nodVel += nodAcc * h;
      f.nod += f.nodVel * h;
    }

    for (const s of straps) {
      const swingAcc = -s.freq * s.freq * Math.sin(s.swing) - 0.16 * s.freq * s.swingVel - STRAP_GAIN * acc;
      s.swingVel += swingAcc * h;
      s.swing = clamp(s.swing + s.swingVel * h, -1.2, 1.2);
    }
  }

  // Advance the simulation. `target` is the cursor's x in [-1, 1].
  function step(dt, target, { rumble = true } = {}) {
    carry += Math.min(dt, 0.05);
    while (carry >= STEP) {
      tick(STEP, target, rumble);
      carry -= STEP;
    }
  }

  function draw(ctx) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The car slides with the cursor; nearer things slide further.
    const slide = carX * W * 0.03;

    for (const f of figures) {
      drawFigure(ctx, f, f.x + slide * (0.35 + 0.65 * f.z), f.y, f.s, {
        paper: PAPER,
        ink: `rgba(${INK}, ${lerp(0.6, 0.95, f.z)})`,
        width: lerp(1.1, 2.2, f.z),
      });
    }

    const railSlide = slide * 0.5;
    const railTf = (x, y, out) => {
      out[0] = x + railSlide;
      out[1] = y;
    };
    ctx.strokeStyle = `rgba(${INK}, 0.6)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const rail of rails) trace(ctx, rail, railTf);
    ctx.stroke();

    for (const s of straps) {
      ctx.strokeStyle = `rgba(${INK}, ${lerp(0.5, 0.9, s.z)})`;
      ctx.lineWidth = lerp(1, 1.8, s.z);
      drawStrap(ctx, s, s.x + railSlide, s.y, s.s);
    }

    // Notebook grid, ruled over the top so the paper fills don't erase it.
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (W / 2) % gridStep; x < W; x += gridStep) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
    }
    for (let y = gridStep * 0.5; y < H; y += gridStep) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  return {
    layout,
    step,
    draw,
    get figures() {
      return figures;
    },
    get straps() {
      return straps;
    },
  };
}
