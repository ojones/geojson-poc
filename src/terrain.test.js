import assert from 'node:assert/strict';
import test from 'node:test';
import { describeTerrain, parseDem, sampleElevation } from './terrain.js';
import { demText, sampleBoundary } from './test-helpers.js';

const load = (overrides) => parseDem(demText(overrides), 'dem.json', sampleBoundary());

test('a valid DEM reports metadata, resolution and coverage', () => {
  const { dem } = load();
  assert.equal(dem.metadata.coverage, 'full');
  assert.equal(dem.metadata.vertical_units, 'm');
  assert.ok(dem.metadata.horizontal_resolution_m > 100);
  assert.match(describeTerrain(dem.metadata), /Elevation model only/);
});

test('sampling returns north-up cells and null outside or on no-data', () => {
  const values = Array.from({ length: 16 }, (_, i) => (i === 5 ? -9999 : 100 + i));
  const { dem } = load({ values });
  assert.equal(sampleElevation(dem, 37.8295, -122.5095), 100);
  assert.equal(sampleElevation(dem, 37.8205, -122.4905), 115);
  assert.equal(sampleElevation(dem, 37.8272, -122.5025), null);
  assert.equal(sampleElevation(dem, 38.5, -122.5), null);
});

test('feet are converted to meters', () => {
  const { dem } = load({ vertical_units: 'ft', values: Array(16).fill(1000) });
  assert.ok(Math.abs(sampleElevation(dem, 37.825, -122.5) - 304.8) < 0.01);
});

test('partial overlap is flagged; no overlap is an error', () => {
  const partial = load({ bounds: { west: -122.5, south: 37.82, east: -122.48, north: 37.83 } });
  assert.equal(partial.dem.metadata.coverage, 'partial');
  const far = load({ bounds: { west: -100, south: 30, east: -99, north: 31 } });
  assert.match(far.errors[0], /does not overlap/);
});

test('unsupported or missing georeferencing fails clearly', () => {
  assert.match(load({ crs: 'EPSG:32610' }).errors[0], /not supported; reproject/);
  assert.match(load({ crs: undefined }).errors[0], /does not declare/);
  assert.match(load({ bounds: undefined }).errors[0], /missing georeferencing/);
  assert.match(load({ format: 'GeoTIFF' }).errors[0], /Arbitrary GeoTIFFs are not read/);
  assert.match(load({ values: [1, 2] }).errors[0], /must list/);
  assert.match(load({ vertical_units: 'furlongs' }).errors[0], /Vertical units/);
  assert.match(parseDem('nope', 'x', sampleBoundary()).errors[0], /not valid JSON/);
});
