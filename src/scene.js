// The train car: layout, physics, and drawing order.
//
// Physics in one paragraph: the car has a sideways position that chases the
// cursor. Its acceleration is the only force in the scene. Every passenger is
// a damped spring that leans against that acceleration, overshoots and
// settles; heads are a second, faster spring riding on the shoulders; strap
// handles are lightly damped pendulums. Neighbours in a row push each other
// apart when they lean into one another, which passes a bump along the row.

import { createRng } from './rng.js';
import { trace } from './brush.js';
import { createCamera } from './camera.js';
import { CAR, buildCar } from './car.js';
import { buildFigure, drawFigure } from './figure.js';
import { buildStrap, drawStrap } from './strap.js';

const PAPER = '#ece6d8';
const INK = '27, 26, 24';
const GUIDE = 'rgba(70, 96, 120, 0.2)';

// Figures and handles are drawn in head radii; this is one head radius in
// metres, which is what puts them in the car at the right size.
const HEAD = 0.115;

// The standing crowd, in car coordinates (metres).
const ROW_COUNT = 11;
const ROW_START = 0.7; // camera to the nearest row
const ROW_GAP = 0.56; // row to row, along the car
const ACROSS = 0.52; // shoulder to shoulder, across the car
const STRAP_START = 0.9;
const STRAP_GAP = 0.6;

const CAR_FOLLOW = 7; // how briskly the car chases the cursor (rad/s)
const CAR_SWAY = 0.035; // how far the car slides past the camera (metres)
const LEAN_GAIN = 0.006; // lean per unit of car acceleration
const HEAD_GAIN = 0.02;
const STRAP_GAIN = 0.019;
const STEP = 1 / 120;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const same = (x, y, out) => {
  out[0] = x;
  out[1] = y;
};

export function createScene(seed = 4509) {
  const cam = createCamera();
  let W = 0;
  let H = 0;
  let figures = [];
  let rows = [];
  let straps = [];
  let car = { guides: [], rails: [] };

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

  // Everything is placed in the car, not on the screen, so the screen size
  // only matters to the camera.
  function layout(width, height) {
    W = width;
    H = height;
    cam.fit(W, H);
    const rng = createRng(seed);

    figures = [];
    rows = [];
    for (let r = 0; r < ROW_COUNT; r++) {
      const count = r % 2 ? 4 : 5; // alternate rows stand in the gaps
      const row = [];
      for (let i = 0; i < count; i++) {
        const f = buildFigure(rng);
        f.x = (i - (count - 1) / 2) * ACROSS + rng.range(-0.09, 0.09);
        f.z = ROW_START + r * ROW_GAP + rng.range(-0.12, 0.12);
        row.push(f);
        figures.push(f);
      }
      row.sort((a, b) => a.x - b.x);
      rows.push(row);
    }
    figures.sort((a, b) => b.z - a.z); // far to near, the order they are drawn

    car = buildCar(rng);

    // Handles hang off both rails at regular intervals down the car.
    straps = [];
    for (let z = STRAP_START; z < CAR.length - 0.3; z += STRAP_GAP) {
      for (const dir of [-1, 1]) {
        const strap = buildStrap(rng);
        strap.x = dir * CAR.railX;
        strap.y = CAR.railY - 0.035;
        strap.z = z + rng.range(-0.04, 0.04);
        straps.push(strap);
      }
    }
    straps.sort((a, b) => b.z - a.z);
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
        const reachA = HEAD * a.neck;
        const reachB = HEAD * b.neck;
        const rest = b.x - a.x;
        const room = Math.min(rest * 0.85, (a.shoulder + b.shoulder) * HEAD * 0.9);
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

  const foot = [0, 0, 0];
  const top = [0, 0, 0];
  const point = [0, 0, 0];
  const scratch = new Float32Array(64);

  // How boldly to draw something: 1 up close, 0 at the far end of the car.
  const nearness = (pixelsPerMetre) => clamp((7.5 - cam.focal / pixelsPerMetre) / 5.5, 0, 1);

  // Project a 3D line and add it to the current path.
  function traceLine(ctx, line, wobblePx) {
    const n = line.pts.length / 3;
    for (let i = 0; i < n; i++) {
      cam.project(line.pts[i * 3], line.pts[i * 3 + 1], line.pts[i * 3 + 2], point);
      scratch[i * 2] = point[0] + line.jitter[i * 2] * wobblePx;
      scratch[i * 2 + 1] = point[1] + line.jitter[i * 2 + 1] * wobblePx;
    }
    trace(ctx, scratch.subarray(0, n * 2), same);
  }

  function draw(ctx) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The car slides with the cursor. Moving the camera the other way does
    // it, and nearer things slide further on their own.
    cam.x = -carX * CAR_SWAY;

    for (const f of figures) {
      cam.project(f.x, 0, f.z, foot);
      cam.project(f.x, f.neck * HEAD, f.z, top);
      const near = nearness(top[2]);
      foot[2] *= HEAD;
      top[2] *= HEAD;
      drawFigure(ctx, f, foot, top, {
        paper: PAPER,
        ink: `rgba(${INK}, ${lerp(0.5, 0.95, near)})`,
        width: lerp(0.9, 2.2, near),
      });
    }

    ctx.strokeStyle = `rgba(${INK}, 0.6)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const rail of car.rails) traceLine(ctx, rail, 1.4);
    ctx.stroke();

    for (const s of straps) {
      cam.project(s.x, s.y, s.z, point);
      const near = nearness(point[2]);
      ctx.strokeStyle = `rgba(${INK}, ${lerp(0.45, 0.9, near)})`;
      ctx.lineWidth = lerp(0.8, 1.8, near);
      drawStrap(ctx, s, point[0], point[1], point[2] * HEAD);
    }

    // Construction lines, ruled over the top so the paper fills don't erase
    // them, with a small cross where they meet.
    ctx.strokeStyle = GUIDE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const guide of car.guides) traceLine(ctx, guide, 0.5);
    cam.vanishingPoint(point);
    ctx.moveTo(point[0] - 7, point[1]);
    ctx.lineTo(point[0] + 7, point[1]);
    ctx.moveTo(point[0], point[1] - 7);
    ctx.lineTo(point[0], point[1] + 7);
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
