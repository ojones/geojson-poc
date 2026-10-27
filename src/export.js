import { TELEMETRY } from './telemetry.js';
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
  'scenario',
  'sensor_assumption',
  'seed',
  'synthetic',
];

const NOT_MODELED = 'sensor detection, imagery, terrain, weather, obstacles, airspace, vehicle dynamics';

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
  ];
}

function modelLines(run) {
  const events = run.analysis.gps_quality_events.map((e) => `${e.start_s}-${e.end_s}s`).join(' ') || 'none (no simulated GPS-quality dip included)';
  return [
    `gps_quality_events: ${events}`,
    `simulated_speed_mps: ${TELEMETRY.speed_mps}`,
    `sample_interval_s: ${TELEMETRY.sample_interval_s}`,
    'units: timestamp_s = seconds since start; latitude/longitude = decimal degrees WGS84; altitude_m = meters; horizontal_uncertainty_m = RMS horizontal error injected by the simulator, meters',
    `not_modeled: ${NOT_MODELED}`,
  ];
}

function metadataLines(run, generatedAt) {
  const lines = [...identityLines(run), ...settingLines(run), ...modelLines(run)];
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
    scenario.scenario_id,
    scenario.sensor_assumption,
    scenario.seed,
    sample.synthetic,
  ].join(',');
}

export function buildCsv(run, generatedAt) {
  const rows = run.samples.map((sample) => rowOf(sample, run.scenario));
  return [...metadataLines(run, generatedAt), CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

export function downloadCsv(run) {
  const blob = new Blob([buildCsv(run, new Date().toISOString())], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = csvFilename(run);
  link.click();
  URL.revokeObjectURL(link.href);
}
