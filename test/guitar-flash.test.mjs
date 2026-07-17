import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChart } from '../lib/guitar-flash.mjs';

test('preserves Guitar Flash zero-based track numbers', () => {
  const chart = parseChart(`
    <Chart>
      <Title>Cliffs Of Dover</Title>
      <Artist>Eric Johnson</Artist>
      <Length>253</Length>
      <Note time="3.33333" duration="0.75" track="0" special="0" />
      <Note time="4.16667" duration="0.91667" track="4" special="0" />
    </Chart>
  `);

  assert.deepEqual(chart.notes.map(note => note.lane), [0, 4]);
});
