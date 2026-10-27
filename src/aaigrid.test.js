import assert from 'node:assert/strict';
import test from 'node:test';
import { aaigridToDem } from './aaigrid.js';
import { parseDem, sampleElevation } from './terrain.js';
import { sampleBoundary } from './test-helpers.js';

const GRID = ['ncols 2', 'nrows 2', 'xllcorner -122.51', 'yllcorner 37.82', 'cellsize 0.01', 'NODATA_value -9999', '10 20', '30 -9999'].join('\n');

test('an ASCII grid converts to a DEM the loader accepts, north row first', () => {
  const converted = aaigridToDem(GRID, { crs: 'EPSG:4326', source: 'test' });
  assert.equal(converted.ok, true);
  const { west, south, east, north } = converted.dem.bounds;
  assert.deepEqual([west, south], [-122.51, 37.82]);
  assert.ok(Math.abs(east - -122.49) < 1e-9 && Math.abs(north - 37.84) < 1e-9);
  const loaded = parseDem(JSON.stringify(converted.dem), 'g', sampleBoundary());
  assert.equal(loaded.ok, true);
  assert.equal(sampleElevation(loaded.dem, 37.835, -122.505), 10);
  assert.equal(sampleElevation(loaded.dem, 37.825, -122.495), null);
});

test('a missing CRS, bad header, or wrong value count is refused', () => {
  assert.match(aaigridToDem(GRID, {}).errors[0], /CRS explicitly/);
  assert.match(aaigridToDem('hello\nworld', { crs: 'EPSG:4326' }).errors[0], /ncols/);
  assert.match(aaigridToDem(GRID.replace('10 20', '10'), { crs: 'EPSG:4326' }).errors[0], /expected 4/);
});
