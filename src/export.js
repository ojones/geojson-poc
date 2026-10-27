import { TELEMETRY } from './telemetry.js';
import { BATTERY, batteryDescription } from './battery.js';
import { contextSummary, NO_CONTEXT, provenanceRows, VERSIONS } from './provenance.js';
import { PLANNER } from './route-planner.js';

export const CSV_COLUMNS = [
  'timestamp_s',
  'latitude',
  'longitude',
  'planned_latitude',
  'planned_longitude',
  'position_quality',
  'horizontal_uncertainty_m',
  'altitude_m',
  'segment_type',
  'battery_pct',
  'event_types',
  'scenario',
  'sensor_assumption',
  'seed',
  'synthetic',
];

const NOT_MODELED = 'sensor detection, imagery, weather, obstacles, airspace, vehicle dynamics, terrain-based visibility (terrain is context only)';

export function csvFilename(run) {
  return `simulated_flight_log_${run.id}.csv`;
}

function identityLines(run) {
  const { scenario } = run;
  return [
    'SIMULATED FLIGHT LOG - synthetic data; not from a real aircraft, autopilot, or sensor; not evidence of detection',
    `run_id: ${run.id}`,
    `scenario: ${scenario.scenario_id} (${scenario.scenario_label})`,
    `boundary_source: ${scenario.boundary_source}`,
    `boundary_geometry: ${scenario.boundary_geometry}`,
    `boundary_hash: ${scenario.boundary_hash}`,
    `app_version: ${VERSIONS.app}`,
    `spec_version: ${VERSIONS.spec}`,
  ];
}

function settingLines(run) {
  const { scenario } = run;
  return [
    `pattern: ${scenario.pattern}`,
    `sensor_assumption: ${scenario.sensor_assumption} (label only; sensor physics are not modeled)`,
    `altitude_m: ${scenario.altitude_m} (nominal assumption)`,
    `swath_width_m: ${scenario.swath_width_m} (assumed)`,
    `line_spacing_m: ${run.route.diagnostics.line_spacing_m} (swath x ${1 - PLANNER.sidelap})`,
    `seed: ${scenario.seed}`,
    `simulate_gps_quality_dip: ${scenario.simulate_gps_quality_dip}`,
    `battery_model: ${batteryDescription(scenario.battery_reserve_pct)}`,
  ];
}

function eventLines(run) {
  const gps = run.analysis.gps_quality_events.map((e) => `${e.start_s}-${e.end_s}s`).join(' ') || 'none (no simulated GPS-quality dip included)';
  const reserve = run.analysis.battery_reserve_event;
  return [
    `gps_quality_events: ${gps}`,
    `battery_reserve_event: ${reserve ? `${reserve.timestamp_s}s at ${reserve.value}% threshold (simulated)` : 'none (simulated battery stayed above the reserve threshold)'}`,
  ];
}

function contextLines(context) {
  const trails = context.trails ? `${context.trails.source_name} (${context.trails.attribution || 'no attribution supplied'})` : 'none loaded';
  const terrain = context.terrain ? `${context.terrain.source_name}, ${context.terrain.horizontal_resolution_m} m, ${context.terrain.vertical_units}, ${context.terrain.crs}, coverage ${context.terrain.coverage}` : 'none loaded';
  return [`context_trails: ${trails}`, `context_terrain: ${terrain}`];
}

function modelLines(run, context) {
  return [
    ...eventLines(run),
    ...contextLines(context),
    `simulated_speed_mps: ${TELEMETRY.speed_mps}`,
    `sample_interval_s: ${TELEMETRY.sample_interval_s}`,
    'units: timestamp_s = seconds since start; latitude/longitude = decimal degrees WGS84; altitude_m = meters; horizontal_uncertainty_m = RMS horizontal error injected by the simulator, meters',
    `not_modeled: ${NOT_MODELED}`,
  ];
}

function metadataLines(run, generatedAt, context) {
  const lines = [...identityLines(run), ...settingLines(run), ...modelLines(run, context)];
  if (generatedAt) lines.push(`generated_at: ${generatedAt}`);
  return lines.map((line) => `# ${line}`);
}

function coordinate(value) {
  return value.toFixed(7);
}

function rowOf(sample, scenario) {
  return [
    sample.timestamp_s,
    coordinate(sample.latitude),
    coordinate(sample.longitude),
    coordinate(sample.planned_latitude),
    coordinate(sample.planned_longitude),
    sample.position_quality,
    sample.horizontal_uncertainty_m,
    sample.altitude_m,
    sample.segment_type,
    sample.battery_pct,
    sample.events.join('|'),
    scenario.scenario_id,
    scenario.sensor_assumption,
    scenario.seed,
    sample.synthetic,
  ].join(',');
}

export function buildCsv(run, generatedAt, context = NO_CONTEXT) {
  const rows = run.samples.map((sample) => rowOf(sample, run.scenario));
  return [...metadataLines(run, generatedAt, context), CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

export function metadataFilename(run) {
  return `simulated_run_metadata_${run.id}.json`;
}

function methodsOf(run) {
  return {
    coverage: run.analysis.coverage_method,
    route_deviation: 'observed_to_own_planned_segment_v1',
    battery: BATTERY.model_id,
    terrain_visibility: 'not_calculated',
    sensor_detection: 'not_modeled',
  };
}

function settingsOf(scenario) {
  const { boundary_geometry: geometry, ...rest } = scenario;
  return { ...rest, boundary_geometry_type: geometry };
}

export function buildMetadata(run, generatedAt, context = NO_CONTEXT) {
  const { analysis } = run;
  return {
    synthetic: true,
    notice: 'Simulated run; not from a real aircraft or sensor; not evidence of detection.',
    run_id: run.id,
    ...versionFields(),
    scenario: settingsOf(run.scenario),
    battery: { model: BATTERY.model_id, initial_pct: BATTERY.initial_pct, drain_pct_per_min: BATTERY.drain_pct_per_min, reserve_pct: run.scenario.battery_reserve_pct },
    events: run.events,
    metric_methods: methodsOf(run),
    metrics: { search_length_m: analysis.search_length_m, turn_length_m: analysis.turn_length_m, transit_length_m: analysis.transit_length_m, total_flown_length_m: analysis.route_length_m, estimated_geometric_coverage_pct: analysis.estimated_geometric_coverage_pct },
    ...contextSummary(context),
    provenance: provenanceRows(run, context),
    ...(generatedAt ? { generated_at: generatedAt } : {}),
  };
}

function versionFields() {
  return { app_version: VERSIONS.app, spec_version: VERSIONS.spec };
}

function saveBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadCsv(run, context = NO_CONTEXT) {
  const csv = buildCsv(run, new Date().toISOString(), context);
  saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), csvFilename(run));
}

export function downloadMetadata(run, context = NO_CONTEXT) {
  const json = JSON.stringify(buildMetadata(run, new Date().toISOString(), context), null, 2);
  saveBlob(new Blob([json], { type: 'application/json' }), metadataFilename(run));
}
