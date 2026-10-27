import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULTS, parseSettings } from './scenario.js';

test('defaults are valid', () => {
  assert.equal(parseSettings(DEFAULTS).ok, true);
});

test('form strings are parsed to numbers', () => {
  const result = parseSettings({ ...DEFAULTS, altitude_m: '75', swath_width_m: '120', seed: '7' });
  assert.deepEqual([result.settings.altitude_m, result.settings.swath_width_m, result.settings.seed], [75, 120, 7]);
});

test('invalid values are rejected rather than replaced', () => {
  for (const bad of [{ altitude_m: '' }, { altitude_m: '5' }, { swath_width_m: '9999' }, { seed: '1.5' }, { seed: '-1' }, { seed: 'abc' }, { pattern: 'spiral' }, { sensor_assumption: 'radar' }]) {
    const result = parseSettings({ ...DEFAULTS, ...bad });
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.errors.length >= 1);
  }
});

test('all problems are reported together', () => {
  const result = parseSettings({ ...DEFAULTS, altitude_m: '', swath_width_m: '' });
  assert.equal(result.errors.length, 2);
});
