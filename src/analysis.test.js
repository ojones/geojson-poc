import assert from 'node:assert/strict';
import test from 'node:test';
import { qualityEvents, routeDeviation } from './analysis.js';
import { computeCoverage } from './coverage.js';
import { planRoute } from './route-planner.js';
import { buildScenario } from './scenario.js';
import { simulateTelemetry } from './telemetry.js';
import { parseOk, polygonText, sampleBoundary, SETTINGS, squareRing, wideRing } from './test-helpers.js';

function setup(overrides = {}, boundary = sampleBoundary()) {
  const scenario = buildScenario({ ...SETTINGS, ...overrides }, boundary);
  const { route } = planRoute(boundary, scenario);
  return { boundary, scenario, route };
}

test('zero-noise telemetry has near-zero deviation', () => {
  const { boundary, scenario, route } = setup();
  const { samples } = simulateTelemetry(route, scenario, boundary.projection, { noiseScale: 0 });
  const deviation = routeDeviation(route, samples, boundary.projection);
  assert.ok(deviation.max < 1e-4, `max ${deviation.max}`);
});

test('a known 10 m cross-track offset yields a 10 m deviation', () => {
  const { boundary, scenario, route } = setup({ simulate_gps_quality_dip: false }, parseOk(polygonText([wideRing(-122.5, 37.8)])));
  const { samples } = simulateTelemetry(route, scenario, boundary.projection, { noiseScale: 0 });
  const searchOnly = samples.filter((s) => s.segment_type === 'search');
  const shifted = searchOnly.map((s) => ({ ...s, latitude: s.latitude + 10 / 111194.9 }));
  const deviation = routeDeviation(route, shifted, boundary.projection);
  assert.ok(Math.abs(deviation.mean - 10) < 0.01, `mean ${deviation.mean}`);
  assert.ok(Math.abs(deviation.max - 10) < 0.01, `max ${deviation.max}`);
});

test('quality events are contiguous degraded intervals', () => {
  const quality = ['good', 'degraded', 'degraded', 'good', 'degraded'];
  const events = qualityEvents(quality.map((position_quality, timestamp_s) => ({ position_quality, timestamp_s })));
  assert.deepEqual(events, [{ start_s: 1, end_s: 2 }, { start_s: 4, end_s: 4 }]);
});

test('a single pass covers about swath / side and never exceeds 100%', () => {
  const { boundary, route } = setup({}, parseOk(polygonText([squareRing(-122.5, 37.8, 0.01)])));
  const single = { segments: [route.segments[0]] };
  const part = computeCoverage(boundary, single, 100);
  const side = boundary.extent.height_m;
  assert.ok(Math.abs(part.coverage_pct - (100 * 100) / side) < 4, `${part.coverage_pct}`);
  assert.ok(computeCoverage(boundary, route, 100).coverage_pct <= 100);
});

test('overlap is counted once for coverage and flagged as repeat coverage', () => {
  const { boundary, route } = setup({ pattern: 'crosshatch' }, parseOk(polygonText([squareRing(-122.5, 37.8, 0.01)])));
  const hatch = computeCoverage(boundary, route, 100);
  assert.ok(hatch.coverage_pct <= 100 && hatch.coverage_pct > 95);
  assert.ok(hatch.repeat_coverage_pct > 80);
});

test('coverage excludes areas outside the polygon and holes', () => {
  const holey = parseOk(polygonText([squareRing(-122.5, 37.8, 0.01), squareRing(-122.4965, 37.8035, 0.003)]));
  const { route } = setup({ swath_width_m: 100 }, holey);
  const withHole = computeCoverage(holey, route, 100);
  assert.ok(withHole.coverage_pct <= 100);
  assert.ok(withHole.eligible_cells < (holey.extent.width_m / withHole.cell_size_m) * (holey.extent.height_m / withHole.cell_size_m));
});
