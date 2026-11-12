// The camera: one viewpoint, one project().
//
// Car coordinates are in metres:
//   x  across the car, 0 on the centre line, positive to the right
//   y  up from the floor
//   z  along the car, away from the viewer (the camera sits at z = 0)
//
// The camera looks down the car and is pitched down a little, so the horizon
// (and the vanishing point of everything running along the car) sits above
// the middle of the screen and the crowd is seen from over its heads.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createCamera({ height = 2.1, pitch = 0.29 } = {}) {
  const sin = Math.sin(pitch);
  const cos = Math.cos(pitch);

  const cam = {
    x: 0, // sideways offset; the scene moves this to slide the car
    y: height,
    focal: 1, // pixels per metre, one metre in front of the lens
    cx: 0,
    cy: 0,

    // Fit the lens to the screen. Narrow screens get a wider lens so the car
    // doesn't turn into a slot, and the picture is shifted so the vanishing
    // point stays the same distance from the top either way.
    fit(width, height) {
      cam.focal = height * 0.9 * clamp(width / height / 1.3, 0.62, 1);
      cam.cx = width / 2;
      cam.cy = height * 0.23 + (cam.focal * sin) / cos;
    },

    // Car (x, y, z) to screen. Writes [screenX, screenY, pixelsPerMetre] into
    // `out`; the third value is the scale of anything drawn at that depth.
    project(x, y, z, out) {
      const dx = x - cam.x;
      const dy = y - cam.y;
      const depth = z * cos - dy * sin;
      const up = dy * cos + z * sin;
      const k = cam.focal / depth;
      out[0] = cam.cx + dx * k;
      out[1] = cam.cy - up * k;
      out[2] = k;
      return out;
    },

    // Where lines running along the car meet.
    vanishingPoint(out) {
      out[0] = cam.cx;
      out[1] = cam.cy - (cam.focal * sin) / cos;
      return out;
    },
  };

  return cam;
}
