import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCsv, CSV_COLUMNS, csvFilename } from './export.js';
import { buildRun } from './mission.js';
import { sampleBoundary, SETTINGS } from './test-helpers.js';

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const metadata = lines.filter((l) => l.startsWith('# ')).map((l) => l.slice(2));
  const [header, ...rows] = lines.filter((l) => !l.startsWith('# '));
  const columns = header.split(',');
  return { metadata, columns, rows: rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [columns[i], v]))) };
}

test('CSV carries every required column and one row per sample', () => {
  const { run } = buildRun(sampleBoundary(), SETTINGS);
  const csv = parseCsv(buildCsv(run));
  assert.deepEqual(csv.columns, CSV_COLUMNS);
  assert.equal(csv.rows.length, run.samples.length);
  const first = csv.rows[0];
  assert.equal(first.sensor_assumption, 'thermal');
  assert.equal(first.seed, '42');
  assert.equal(first.altitude_m, '60');
  assert.equal(first.synthetic, 'true');
  assert.notEqual(first.latitude, first.planned_latitude);
});

test('metadata identifies the data as simulated, with units and run identity', () => {
  const { run } = buildRun(sampleBoundary(), SETTINGS);
  const text = parseCsv(buildCsv(run, '2026-10-26T00:00:00Z')).metadata.join('\n');
  assert.match(text, /SIMULATED FLIGHT LOG/);
  assert.match(text, new RegExp(`run_id: ${run.id}`));
  assert.match(text, /units: timestamp_s = seconds/);
  assert.match(text, /not_modeled: sensor detection/);
  assert.match(text, /generated_at: 2026-10-26T00:00:00Z/);
  assert.match(text, /gps_quality_events: \d+-\d+s/);
});

test('exports are reproducible without a timestamp and the filename names the run', () => {
  const { run } = buildRun(sampleBoundary(), SETTINGS);
  assert.equal(buildCsv(run), buildCsv(buildRun(sampleBoundary(), SETTINGS).run));
  assert.equal(csvFilename(run), `simulated_flight_log_${run.id}.csv`);
});

test('a run without a dip says so in the metadata', () => {
  const { run } = buildRun(sampleBoundary(), { ...SETTINGS, simulate_gps_quality_dip: false });
  assert.match(buildCsv(run), /gps_quality_events: none \(no simulated GPS-quality dip included\)/);
});
