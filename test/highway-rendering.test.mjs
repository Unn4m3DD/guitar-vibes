import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const drawFrameSource = source.slice(source.indexOf('function drawFrame'), source.indexOf('function togglePause'));

test('renders an accepted sustain until its tail reaches the target', () => {
  let tailStrokes = 0;
  const gradient = { addColorStop() {} };
  const context = new Proxy({
    lineWidth: 1,
    stroke() { if (this.lineWidth === 22) tailStrokes++; },
    createRadialGradient() { return gradient; },
    createLinearGradient() { return gradient; },
  }, { get: (target, key) => key in target ? target[key] : (() => {}) });
  const canvas = { width: 1280, height: 720, getContext: () => context };
  const state = {
    notes: [{ state: 'holding', lane: 0, time: 10, duration: 1, special: 0 }],
    specialPhrases: new Map(), shakeUntil: 0, specialActive: false,
    held: new Set([0]), hitEffects: [], bindings: { lanes: ['KeyA', 'KeyS', 'KeyJ', 'KeyK', 'KeyL'] },
  };
  const lanes = ['#41df78', '#ef4058', '#ffd83d', '#39a8ff', '#ff8c32'].map(color => ({ color }));
  const drawFrame = new Function('$', 'state', 'LANES', 'NOTE_WINDOW', 'hasSpecialVisual', 'bindingLabel', `${drawFrameSource}; return drawFrame;`)(() => canvas, state, lanes, 1.35, () => false, () => 'A');

  drawFrame(10.5);

  assert.ok(tailStrokes > 0, 'the sustain tail disappeared halfway through the note');
});
