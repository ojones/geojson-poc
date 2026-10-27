import assert from 'node:assert/strict';
import test from 'node:test';
import { BATTERY, batteryAt, findReserveCrossing } from './battery.js';
import { activeEvents, buildEvents } from './events.js';
import { buildRun } from './mission.js';
import { sampleBoundary, SETTINGS } from './test-helpers.js';

const build = (overrides = {}) => buildRun(sampleBoundary(), { ...SETTINGS, ...overrides }).run;

test('battery drains linearly and deterministically', () => {
  assert.equal(batteryAt(0), BATTERY.initial_pct);
  assert.equal(batteryAt(60), BATTERY.initial_pct - BATTERY.drain_pct_per_min);
  assert.equal(batteryAt(100000), 0);
});

test('identical settings give identical battery series and event times; the seed does not move the reserve event', () => {
  const a = build();
  const b = build();
  assert.deepEqual(a.samples.map((s) => s.battery_pct), b.samples.map((s) => s.battery_pct));
  assert.deepEqual(a.events, b.events);
  const reserve = (run) => run.events.find((e) => e.type === 'battery_reserve');
  assert.equal(reserve(build({ seed: 7 })).timestamp_s, reserve(a).timestamp_s);
});

test('a reserve crossing emits exactly one structured event', () => {
  const run = build();
  const reserves = run.events.filter((e) => e.type === 'battery_reserve');
  assert.equal(reserves.length, 1);
  assert.deepEqual([reserves[0].value, reserves[0].unit, reserves[0].severity, reserves[0].synthetic], [25, '%', 'notice', true]);
  const sample = run.samples.find((s) => s.timestamp_s === reserves[0].timestamp_s);
  assert.ok(sample.battery_pct <= 25 && run.samples[sample.timestamp_s - 1].battery_pct > 25);
  assert.deepEqual(sample.events.includes('battery_reserve'), true);
});

test('no reserve event is claimed when the battery stays above the threshold', () => {
  const run = build({ battery_reserve_pct: 5 });
  assert.equal(run.events.some((e) => e.type === 'battery_reserve'), false);
  assert.equal(run.analysis.battery_reserve_event, null);
  assert.match(run.analysis.interpretation, /stayed above the assumed 5% reserve/);
});

test('event ids are stable, ordered by time, and GPS events can be absent', () => {
  const run = build();
  assert.deepEqual(run.events.map((e) => e.event_id), ['event-001', 'event-002']);
  assert.ok(run.events[0].timestamp_s <= run.events[1].timestamp_s);
  const without = build({ simulate_gps_quality_dip: false });
  assert.deepEqual(without.events.map((e) => e.type), ['battery_reserve']);
  assert.equal(findReserveCrossing([{ timestamp_s: 0, battery_pct: 90 }], 25), null);
});

test('active events follow playback time', () => {
  const events = buildEvents(build().samples, { start_s: 10, end_s: 20 }, { battery_reserve_pct: 25 });
  assert.deepEqual(activeEvents(events, 5).map((e) => e.type), []);
  assert.deepEqual(activeEvents(events, 15).map((e) => e.type), ['gps_quality_degraded']);
  assert.deepEqual(activeEvents(events, 25).map((e) => e.type), []);
  assert.deepEqual(activeEvents(events, 2000).map((e) => e.type), ['battery_reserve']);
});

test('battery wording never implies a return or landing', () => {
  const text = build().analysis.interpretation;
  assert.match(text, /modeled value only/);
  assert.doesNotMatch(text, /return|land/i);
});
