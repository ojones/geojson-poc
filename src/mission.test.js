import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRun } from './mission.js';
import { parseOk, polygonText, sampleBoundary, SETTINGS, squareRing } from './test-helpers.js';

const FORBIDDEN = /\b(was|were|been|is|are) (detected|found|located|rescued)\b|successfully|no target|target (was|is) (present|absent)/i;

test('the same boundary, settings and seed reproduce the same run', () => {
  const a = buildRun(sampleBoundary(), SETTINGS).run;
  const b = buildRun(sampleBoundary(), SETTINGS).run;
  assert.equal(a.id, b.id);
  assert.deepEqual(a.route.waypoints, b.route.waypoints);
  assert.deepEqual(a.samples, b.samples);
  assert.equal(a.analysis.interpretation, b.analysis.interpretation);
});

test('a different seed gives a different run id and variation', () => {
  const a = buildRun(sampleBoundary(), SETTINGS).run;
  const b = buildRun(sampleBoundary(), { ...SETTINGS, seed: 7 }).run;
  assert.notEqual(a.id, b.id);
  assert.notDeepEqual(a.samples, b.samples);
});

test('the sample mission generates well inside two seconds', () => {
  const start = performance.now();
  const result = buildRun(sampleBoundary(), { ...SETTINGS, pattern: 'crosshatch' });
  assert.equal(result.ok, true);
  assert.ok(performance.now() - start < 2000);
});

test('analysis matches the telemetry it was derived from', () => {
  const { analysis, samples } = buildRun(sampleBoundary(), SETTINGS).run;
  assert.equal(analysis.duration_s, samples[samples.length - 1].timestamp_s);
  assert.equal(analysis.sample_count, samples.length);
  assert.ok(analysis.gps_quality_events.length === 1);
});

test('interpretation avoids detection claims and states limitations', () => {
  for (const dip of [true, false]) {
    const { analysis } = buildRun(sampleBoundary(), { ...SETTINGS, simulate_gps_quality_dip: dip }).run;
    assert.doesNotMatch(analysis.interpretation, FORBIDDEN);
    assert.match(analysis.interpretation, /do not model sensor performance/);
    assert.ok(analysis.limitations.some((l) => /not usable imagery/.test(l)));
  }
});

test('no-dip runs say so instead of claiming good GPS', () => {
  const { analysis } = buildRun(sampleBoundary(), { ...SETTINGS, simulate_gps_quality_dip: false }).run;
  assert.match(analysis.interpretation, /No simulated GPS-quality dip was included/);
  assert.doesNotMatch(analysis.interpretation, /GPS was good/i);
});

test('unusable areas fail with a recoverable message', () => {
  const tiny = parseOk(polygonText([squareRing(-122.5, 37.8, 0.0006)]));
  const result = buildRun(tiny, { ...SETTINGS, swath_width_m: 500 });
  assert.equal(result.ok, true);
  const huge = parseOk(polygonText([squareRing(-122.5, 37.8, 0.08)]));
  const refused = buildRun(huge, { ...SETTINGS, swath_width_m: 50 });
  assert.equal(refused.ok, false);
  assert.match(refused.errors[0], /limit/);
});
