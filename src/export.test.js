import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCsv, buildMetadata, CSV_COLUMNS, csvFilename, metadataFilename } from './export.js';
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

test('CSV rows carry battery and event indicators', () => {
  const { run } = buildRun(sampleBoundary(), SETTINGS);
  const csv = parseCsv(buildCsv(run));
  assert.ok(csv.rows.every((r, i) => r.battery_pct === String(run.samples[i].battery_pct)));
  assert.ok(csv.rows.some((r) => r.event_types === 'gps_quality_degraded'));
  assert.ok(csv.rows.some((r) => r.event_types === 'battery_reserve'));
  assert.match(csv.metadata.join('\n'), /battery_reserve_event: \d+s at 25% threshold/);
});

test('metadata JSON records settings, events, methods and context provenance', () => {
  const { run } = buildRun(sampleBoundary(), SETTINGS);
  const context = { trails: { layer_id: 'trails-1', type: 'trail_context', source_name: 'trails.geojson', source_url: null, format: 'GeoJSON', attribution: '© OpenStreetMap contributors', enabled: true, lines_in_view: 3 }, terrain: { loaded: true, source_name: 'Test DEM', demo: false }, profile: null };
  const metadata = buildMetadata(run, undefined, context);
  assert.equal(metadata.synthetic, true);
  assert.equal(metadata.scenario.seed, 42);
  assert.equal(metadata.battery.reserve_pct, 25);
  assert.deepEqual(metadata.events.map((e) => e.type), ['gps_quality_degraded', 'battery_reserve']);
  assert.equal(metadata.metric_methods.terrain_visibility, 'not_calculated');
  assert.equal(metadata.context_layers[0].attribution, '© OpenStreetMap contributors');
  assert.ok(metadata.provenance.some((row) => row.layer === 'Trail context'));
  assert.equal(metadata.generated_at, undefined);
  assert.equal(metadataFilename(run), `simulated_run_metadata_${run.id}.json`);
});
