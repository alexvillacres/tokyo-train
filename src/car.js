// The car: a plain box in car coordinates (see camera.js), plus the lines
// that describe it. Nothing here knows about the screen.

import { wobble } from './brush.js';

export const CAR = {
  half: 1.4, // centre line to wall
  ceiling: 2.55,
  length: 7.5, // camera to the far end wall
  railX: 0.72, // handle rails, either side of the centre line
  railY: 2.3,
};

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
