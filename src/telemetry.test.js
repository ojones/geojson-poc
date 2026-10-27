import assert from 'node:assert/strict';
import test from 'node:test';
import { planRoute } from './route-planner.js';
import { buildScenario } from './scenario.js';
import { simulateTelemetry, TELEMETRY } from './telemetry.js';
import { sampleBoundary, SETTINGS } from './test-helpers.js';

function simulate(overrides = {}, options = {}) {
  const boundary = sampleBoundary();
  const scenario = buildScenario({ ...SETTINGS, ...overrides }, boundary);
  const { route } = planRoute(boundary, scenario);
  return { route, boundary, ...simulateTelemetry(route, scenario, boundary.projection, options) };
}

test('same seed reproduces identical telemetry; a new seed changes the variation only', () => {
  const a = simulate();
  const b = simulate();
  const c = simulate({ seed: 43 });
  assert.deepEqual(a.samples, b.samples);
  assert.notDeepEqual(a.samples.map((s) => s.latitude), c.samples.map((s) => s.latitude));
  assert.deepEqual(a.samples.map((s) => s.planned_latitude), c.samples.map((s) => s.planned_latitude));
});

test('timestamps are monotonic and evenly sampled', () => {
  const { samples } = simulate();
  samples.slice(1).forEach((s, i) => assert.equal(s.timestamp_s - samples[i].timestamp_s, TELEMETRY.sample_interval_s));
});

test('planned and observed positions are distinct fields', () => {
  const { samples } = simulate();
  assert.ok(samples.some((s) => s.latitude !== s.planned_latitude));
  assert.ok(samples.every((s) => s.synthetic === true));
});

test('the GPS dip is deterministic, bounded and raises uncertainty', () => {
  const { samples, event } = simulate();
  const degraded = samples.filter((s) => s.position_quality === 'degraded');
  assert.ok(degraded.length > 10);
  assert.equal(degraded[0].timestamp_s, event.start_s);
  assert.equal(degraded[degraded.length - 1].timestamp_s, event.end_s);
  assert.ok(degraded.every((s) => s.horizontal_uncertainty_m === TELEMETRY.degraded_uncertainty_m));
  assert.deepEqual(simulate().event, event);
});

test('no event when the dip is off', () => {
  const { samples, event } = simulate({ simulate_gps_quality_dip: false });
  assert.equal(event, null);
  assert.ok(samples.every((s) => s.position_quality === 'good'));
});

test('missions over the sample cap are refused', () => {
  const boundary = sampleBoundary();
  const scenario = buildScenario({ ...SETTINGS, swath_width_m: 10 }, boundary);
  const { route } = planRoute(boundary, scenario);
  const result = simulateTelemetry(route, scenario, boundary.projection);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /limit is 6000/);
});
