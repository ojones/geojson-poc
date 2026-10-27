import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { parseBoundary } from './boundary.js';
import { parseTrails } from './context-layer.js';
import { buildRun } from './mission.js';
import { buildProfile } from './profile.js';
import { parseDem } from './terrain.js';
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

test('the synthetic demo trails and terrain load against the default sample and are labeled synthetic', () => {
  const boundary = load(SAMPLES[0].file).boundary;
  const read = (file) => readFileSync(new URL(`context/${file}`, dataDir), 'utf8');
  const trails = parseTrails(read('sample_trails_synthetic.geojson'), 'sample_trails_synthetic.geojson', boundary);
  const terrain = parseDem(read('sample_terrain_synthetic.dem.json'), 'sample_terrain_synthetic.dem.json', boundary);
  assert.equal(trails.ok, true, trails.errors);
  assert.equal(terrain.ok, true, terrain.errors);
  assert.equal(terrain.dem.metadata.demo, true);
  assert.match(terrain.dem.metadata.source_name, /NOT real/);
  assert.ok(buildProfile(buildRun(boundary, SETTINGS).run, terrain.dem).unavailable.length > 0);
});
