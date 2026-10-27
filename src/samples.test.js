import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { parseBoundary } from './boundary.js';
import { buildRun } from './mission.js';
import { SAMPLES } from './samples.js';
import { SETTINGS } from './test-helpers.js';

const dataDir = new URL('../data/', import.meta.url);

const load = (file) => parseBoundary(readFileSync(new URL(file, dataDir), 'utf8'), file);

test('every data file is listed and every listed file exists', () => {
  const onDisk = readdirSync(dataDir).filter((f) => f.endsWith('.geojson')).sort();
  assert.deepEqual(SAMPLES.map((s) => s.file).sort(), onDisk);
});

test('every sample validates and generates both patterns', () => {
  for (const { file } of SAMPLES) {
    const parsed = load(file);
    assert.equal(parsed.ok, true, `${file}: ${parsed.errors}`);
    for (const pattern of ['parallel_sweep', 'crosshatch']) {
      const result = buildRun(parsed.boundary, { ...SETTINGS, pattern });
      assert.equal(result.ok, true, `${file} ${pattern}: ${result.errors}`);
      assert.ok(result.run.analysis.estimated_geometric_coverage_pct <= 100);
    }
  }
});

test('the samples exercise the intended geometry', () => {
  const geometries = Object.fromEntries(SAMPLES.map(({ file }) => [file, load(file).boundary]));
  assert.equal(geometries['sample_islands_multipolygon.geojson'].polygons.length, 3);
  assert.equal(geometries['sample_forest_with_clearing.geojson'].polygons[0].length, 2);
  const corridor = geometries['sample_river_corridor.geojson'].extent;
  assert.ok(Math.max(corridor.width_m, corridor.height_m) > 2500);
});
