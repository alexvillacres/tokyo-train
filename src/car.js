// The car: a plain box in car coordinates (see camera.js), plus the lines
// that describe it. Nothing here knows about the screen.

import { wobble } from './brush.js';

export const CAR = {
  half: 1.4, // centre line to wall
  ceiling: 2.55,
  length: 7.5, // camera to the far end wall
  railX: 0.72, // handle rails, either side of the centre line
  railY: 2.3,
  gangway: 0.9, // end wall to the next car's end wall
};

// The door in the end wall, centred on the car and so on the vanishing point.
const END_DOOR = { half: 0.45, top: 2.0, glassHalf: 0.3, glassBottom: 0.9, glassTop: 1.85 };
// The next car's door is the same door, but its glass is drawn a little
// smaller so that its edge shows inside ours and can be seen to move.
const NEXT_DOOR = { ...END_DOOR, glassHalf: 0.23, glassTop: 1.76 };

// Side walls, along the car: sliding doors with a window bay between them.
const SIDE_DOORS = [
  [1.7, 3.0],
  [5.9, 7.2],
];
const SIDE_BAYS = [[3.0, 5.9]];
const SIDE_DOOR_TOP = 1.85;

const NEAR = 0.5; // lines start just in front of the camera
const INFINITY = 300; // far enough to land on the vanishing point

// A straight line in the car, stored as 3D samples plus a fixed 2D wobble
// that is added on screen, so a ruled line still looks drawn by hand.
// Samples are spaced evenly in 1/z, which is roughly evenly on screen.
export function buildLine(a, b, rng, samples = 12) {
  const pts = new Float32Array(samples * 3);
  const alongCar = a[2] !== b[2];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    let u = t;
    if (alongCar) {
      const z = 1 / (1 / a[2] + (1 / b[2] - 1 / a[2]) * t);
      u = (z - a[2]) / (b[2] - a[2]);
    }
    pts[i * 3] = a[0] + (b[0] - a[0]) * u;
    pts[i * 3 + 1] = a[1] + (b[1] - a[1]) * u;
    pts[i * 3 + 2] = a[2] + (b[2] - a[2]) * u;
  }
  const jitter = wobble(new Float32Array(samples * 2), rng, 1, 2);
  return { pts, jitter };
}

// A closed outline through `corners`, each edge cut into `per` pieces. The
// pen rounds every corner by half a piece, and the outline starts and ends
// in the middle of the first edge, where a small mismatch looks hand-closed.
export function buildLoop(corners, rng, per = 4) {
  const n = corners.length;
  const count = n * per + 1;
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = (i + per / 2) / per;
    const edge = Math.floor(t);
    const u = t - edge;
    const a = corners[edge % n];
    const b = corners[(edge + 1) % n];
    for (let d = 0; d < 3; d++) pts[i * 3 + d] = a[d] + (b[d] - a[d]) * u;
  }
  const jitter = wobble(new Float32Array(count * 2), rng, 1, 2);
  return { pts, jitter };
}

export function buildCar(rng) {
  const { half, ceiling, length, railX, railY } = CAR;
  const line = (a, b, n) => buildLine(a, b, rng, n);

  // Construction lines, as a draughtsman would rule them before drawing.
  const guides = [];

  // The four long edges of the box, carried on to the vanishing point.
  for (const x of [-half, half]) {
    for (const y of [0, ceiling]) guides.push(line([x, y, NEAR], [x, y, INFINITY], 16));
  }

  // Lines along the floor, ceiling and walls, stopping at the end wall.
  for (const x of [-half / 2, 0, half / 2]) {
    guides.push(line([x, 0, NEAR], [x, 0, length]));
    guides.push(line([x, ceiling, NEAR], [x, ceiling, length]));
  }
  for (const x of [-half, half]) {
    for (const y of [0.85, 1.7]) guides.push(line([x, y, NEAR], [x, y, length]));
  }

  // Cross-sections of the box, the last one being the end wall.
  for (const z of [length / 3, (length * 2) / 3, length]) {
    guides.push(line([-half, 0, z], [half, 0, z], 5));
    guides.push(line([-half, ceiling, z], [half, ceiling, z], 5));
    guides.push(line([-half, 0, z], [-half, ceiling, z], 5));
    guides.push(line([half, 0, z], [half, ceiling, z], 5));
  }

  // Handle rails: two lines each, a thin tube.
  const rails = [];
  for (const x of [-railX, railX]) {
    for (const y of [railY, railY - 0.035]) rails.push(line([x, y, NEAR], [x, y, length], 14));
  }

  return { guides, rails };
}

// A door across the car at depth z: frame, glass and a handle. `glass` is
// the bare rectangle of the window, for clipping what is seen through it.
function buildEndDoor(z, door, rng) {
  const { half, top, glassHalf, glassBottom, glassTop } = door;
  const glass = [
    [-glassHalf, glassTop, z],
    [glassHalf, glassTop, z],
    [glassHalf, glassBottom, z],
    [-glassHalf, glassBottom, z],
  ];
  const lines = [
    buildLine([-half, 0, z], [-half, top, z], rng, 6),
    buildLine([half, 0, z], [half, top, z], rng, 6),
    buildLine([-half - 0.03, top, z], [half + 0.03, top, z], rng, 5),
    buildLoop(glass, rng),
    buildLine([half - 0.07, 1.02, z], [half - 0.07, 1.22, z], rng, 3),
  ];
  return { lines, glass };
}

// One side wall (side is -1 or 1): only what tells you it is a train.
function buildWall(side, rng) {
  const x = side * CAR.half;
  const line = (a, b, n) => buildLine(a, b, rng, n);
  const pane = (z0, z1, y0, y1) =>
    buildLoop(
      [
        [x, y1, z0],
        [x, y1, z1],
        [x, y0, z1],
        [x, y0, z0],
      ],
      rng,
    );
  const lines = [];

  // The strip above the doors, where the adverts go.
  lines.push(line([x, 2.06, NEAR], [x, 2.06, CAR.length], 14));

  // Sliding doors: two leaves, a window in each.
  for (const [z0, z1] of SIDE_DOORS) {
    const mid = (z0 + z1) / 2;
    for (const z of [z0, mid, z1]) lines.push(line([x, 0, z], [x, SIDE_DOOR_TOP, z], 6));
    lines.push(line([x, SIDE_DOOR_TOP, z0 - 0.04], [x, SIDE_DOOR_TOP, z1 + 0.04], 5));
    lines.push(pane(z0 + 0.13, mid - 0.11, 0.95, 1.66));
    lines.push(pane(mid + 0.11, z1 - 0.13, 0.95, 1.66));
  }

  // Between the doors: a wide window in two panes, and a luggage rack above.
  for (const [z0, z1] of SIDE_BAYS) {
    const mid = (z0 + z1) / 2;
    lines.push(pane(z0 + 0.3, mid - 0.04, 0.9, 1.68));
    lines.push(pane(mid + 0.04, z1 - 0.3, 0.9, 1.68));

    const y = 1.8;
    const lip = x - side * 0.34; // the rack's front bar, out from the wall
    lines.push(line([lip, y, z0 + 0.12], [lip, y, z1 - 0.12], 10));
    lines.push(line([x - side * 0.17, y - 0.01, z0 + 0.12], [x - side * 0.17, y - 0.01, z1 - 0.12], 10));
    for (const z of [z0 + 0.12, mid, z1 - 0.12]) {
      lines.push(line([x, y + 0.14, z], [lip, y, z], 3));
    }
  }

  return lines;
}

// Everything fitted to the box: the side walls, the door at the far end,
// and the near end of the next car, which is seen through that door.
export function buildFittings(rng) {
  const walls = [...buildWall(-1, rng), ...buildWall(1, rng)];
  const door = buildEndDoor(CAR.length, END_DOOR, rng);
  const next = buildEndDoor(CAR.length + CAR.gangway, NEXT_DOOR, rng);
  return { walls, door, next };
}
