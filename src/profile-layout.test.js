import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceAt, layoutProfile } from './profile-layout.js';

const points = [10, 20, null, null, 40, 50].map((e, i) => ({ index: i, timestamp_s: i, distance_m: i * 100, elevation_m: e }));
const profile = { points, unavailable: [{ start_s: 2, end_s: 3 }], available_count: 4, min_m: 10, max_m: 50, total_distance_m: 500 };

test('gaps split the line into separate paths and get a band', () => {
  const layout = layoutProfile(profile);
  assert.equal(layout.paths.length, 2);
  assert.equal(layout.gaps.length, 1);
  assert.ok(layout.gaps[0].width > 2);
  assert.equal(layout.xTicks.at(-1).label, '0.5');
});

test('the playhead follows time in distance, interpolating between samples', () => {
  assert.equal(distanceAt(profile, 0), 0);
  assert.equal(distanceAt(profile, 2.5), 250);
  assert.equal(distanceAt(profile, 99), 500);
  const layout = layoutProfile(profile);
  assert.ok(layout.playheadX(1) < layout.playheadX(4));
});

test('a profile with no known elevations has no layout', () => {
  assert.equal(layoutProfile({ ...profile, available_count: 0 }), null);
});
