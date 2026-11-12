# Train in Tokyo

A canvas study: a crowded train car drawn in pen, seen from behind. Move the
cursor left and right and the car moves with it; the passengers lean, overshoot
and settle, and the strap handles swing.

Plain HTML, CSS and JavaScript modules, served and bundled with Vite.

## Run it

```sh
pnpm install
pnpm dev       # dev server with hot reload
pnpm build     # bundle into dist/
pnpm preview   # serve the built dist/ locally
```

`dist/` uses relative paths, so it can be hosted from any folder or subpath.

## How it works

| File | What it does |
| --- | --- |
| `src/rng.js` | Seeded random numbers, so the same crowd is drawn every time |
| `src/brush.js` | The pen: splines, a one-time wobble, and cheap path drawing |
| `src/camera.js` | The viewpoint and `project()`, which turns car coordinates into screen points |
| `src/car.js` | The car as a box: its size, construction lines and handle rails |
| `src/figure.js` | Builds and draws one passenger (body, head, hair) |
| `src/strap.js` | Builds and draws one hanging handle |
| `src/scene.js` | Who stands where, physics and drawing order |
| `src/main.js` | Canvas setup, cursor input and the animation loop |

**Lines hold still.** Every stroke is generated once from the seed and stored as
points. Each frame only bends those points with the physics, so nothing
shimmers.

**Perspective.** The car is a box measured in metres: `x` across, `y` up from
the floor, `z` away from the viewer. Passengers, rails and handles are placed in
those coordinates, and one camera projects them to the screen. The camera sits
above head height and tilts down, so the vanishing point is in the upper part of
the picture. The light blue lines are the construction lines of that box.

**Physics.** The car's sideways position chases the cursor, and the car's
acceleration is the only force. Each passenger is a damped spring leaning
against it, each head is a faster spring riding on the shoulders, and each
handle is a pendulum. Neighbours in a row push apart when they lean into each
other. A little track rumble keeps the scene alive when the cursor is still; it
is switched off when the system asks for reduced motion.

## Things to tune

- `createScene(4509)` in `src/main.js`: change the seed for a different crowd.
- Camera `height` and `pitch` in `src/camera.js`, and the car's size in
  `src/car.js`.
- Crowd spacing (`ROW_COUNT`, `ROW_GAP`, `ACROSS`) and motion (`LEAN_GAIN`,
  `HEAD_GAIN`, `STRAP_GAIN`, `CAR_FOLLOW`, `CAR_SWAY`) at the top of
  `src/scene.js`.
- Per-person ranges (`freq`, `damping`, `weight`) at the bottom of
  `buildFigure` in `src/figure.js`.
