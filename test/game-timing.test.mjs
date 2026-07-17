import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const extract = (name, nextName) => source.slice(source.indexOf(`function ${name}`), source.indexOf(`function ${nextName}`));
const constant = name => Number(source.match(new RegExp(`const ${name} = ([\\d.]+);`))?.[1]);
const lanes = Array.from({ length: 5 }, () => ({ color: '#fff' }));

test('accepts a note hit 230 ms from its target and does not miss it first', () => {
  const state = { running: true, paused: false, notes: [{ state: 'pending', lane: 0, time: 10, duration: 0 }], held: new Set([0]), hitEffects: [], combo: 0, maxCombo: 0, hits: 0, misses: 0, score: 0, health: 85 };
  const attemptHit = new Function('state', 'songTime', 'multiplier', 'showJudge', 'registerSpecialHit', 'toast', 'updateHud', 'LANES', 'HIT_WINDOW', `${extract('attemptHit', 'markMisses')}; return attemptHit;`)(state, () => 10.23, () => 1, () => {}, () => false, () => {}, () => {}, lanes, constant('HIT_WINDOW'));
  const markMisses = new Function('state', 'failSpecialPhrase', 'showJudge', 'HIT_WINDOW', `${extract('markMisses', 'scoreSustains')}; return markMisses;`)(state, () => {}, () => {}, constant('HIT_WINDOW'));

  markMisses(10.23);
  assert.equal(state.notes[0].state, 'pending');
  attemptHit(0);
  assert.equal(state.notes[0].state, 'hit');
});

test('accepts a sustain after its initial press regardless of release time', () => {
  const state = { notes: [{ state: 'holding', lane: 0, time: 10, duration: 1, special: 0 }], held: new Set(), hitEffects: [], score: 0 };
  const scoreSustains = new Function('state', 'multiplier', 'LANES', `${extract('scoreSustains', 'registerSpecialHit')}; return scoreSustains;`)(state, () => 1, lanes);

  scoreSustains(10.1);
  assert.equal(state.notes[0].state, 'holding');
  scoreSustains(11);
  assert.equal(state.notes[0].state, 'hit');
});
