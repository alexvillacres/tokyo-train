import { createScene } from './scene.js';

const canvas = document.getElementById('train');
const ctx = canvas.getContext('2d');
const scene = createScene(4509);
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

let width = 0;
let height = 0;
let target = 0; // cursor x, -1 (left edge) to 1 (right edge)
let last = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.layout(width, height);
}

function frame(now) {
  const dt = last ? (now - last) / 1000 : 0;
  last = now;
  scene.step(dt, target, { rumble: !calm.matches });
  scene.draw(ctx);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
window.addEventListener('pointermove', (event) => {
  target = Math.max(-1, Math.min(1, (event.clientX / width) * 2 - 1));
});

resize();
requestAnimationFrame(frame);
