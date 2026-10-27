import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRun } from './mission.js';
import { buildProfile, unavailableIntervals } from './profile.js';
import { parseDem } from './terrain.js';
import { demText, sampleBoundary, SETTINGS } from './test-helpers.js';

const boundary = sampleBoundary();
const run = buildRun(boundary, SETTINGS).run;
const wide = { west: -122.52, south: 37.81, east: -122.48, north: 37.84 };

test('a covering DEM yields an elevation for every sample with growing distance', () => {
  const dem = parseDem(demText({ bounds: wide }), 'd', boundary).dem;
  const profile = buildProfile(run, dem);
  assert.equal(profile.available_count, run.samples.length);
  assert.deepEqual(profile.unavailable, []);
  assert.ok(profile.total_distance_m > 5000);
  assert.ok(profile.points.every((p, i) => i === 0 || p.distance_m >= profile.points[i - 1].distance_m));
});

test('samples outside coverage or on no-data are unavailable, never interpolated', () => {
  const dem = parseDem(demText({ bounds: { west: -122.51, south: 37.82, east: -122.50, north: 37.83 } }), 'd', boundary).dem;
  const profile = buildProfile(run, dem);
  assert.ok(profile.unavailable.length > 0);
  assert.ok(profile.points.filter((p) => p.elevation_m === null).length > 0);
  assert.ok(profile.available_count < run.samples.length);
});

test('contiguous gaps merge into intervals', () => {
  const points = [1, null, null, 4, null].map((e, index) => ({ index, timestamp_s: index, elevation_m: e }));
  assert.deepEqual(unavailableIntervals(points), [{ start_s: 1, end_s: 2 }, { start_s: 4, end_s: 4 }]);
});
