import { distanceToSegment } from './geo.js';
import { computeCoverage } from './coverage.js';
import { describeRun } from './narrative.js';

export function routeDeviation(route, samples, projection) {
  const distances = samples.map((sample) => {
    const segment = route.segments[sample.route_segment_index];
    const observed = projection.toXY(sample.latitude, sample.longitude);
    return distanceToSegment(observed, segment.start, segment.end);
  });
  return { mean: distances.reduce((a, b) => a + b, 0) / distances.length, max: Math.max(...distances) };
}

export function qualityEvents(samples) {
  const events = [];
  let open = null;
  for (const sample of samples) {
    const degraded = sample.position_quality === 'degraded';
    if (degraded && open === null) open = { start_s: sample.timestamp_s, end_s: sample.timestamp_s };
    if (degraded && open !== null) open.end_s = sample.timestamp_s;
    if (!degraded && open !== null) {
      events.push(open);
      open = null;
    }
  }
  return open === null ? events : [...events, open];
}

export const LIMITATIONS = [
  'Synthetic data: the track is generated, not recorded from an aircraft.',
  'No sensor detection, imagery quality, weather, or obstacles are modeled. Optional terrain is a bare-earth elevation model for context only.',
  'Battery state is an illustrative linear drain, not a vehicle model; it does not imply the aircraft would return, land, or finish a mission.',
  'Estimated geometric coverage is not usable imagery, sensor detection, or successful search coverage.',
  'The assumed footprint is a circle from swath width / 2, not a camera frustum.',
];

function lengthFields(route) {
  return {
    route_length_m: route.total_length_m,
    search_length_m: route.search_length_m,
    turn_length_m: route.turn_length_m,
    transit_length_m: route.transit_length_m,
  };
}

function batteryFields(samples, events) {
  return {
    final_battery_pct: samples[samples.length - 1].battery_pct,
    battery_reserve_event: events.find((e) => e.type === 'battery_reserve') ?? null,
    events,
  };
}

function coverageFields(coverage) {
  return {
    estimated_geometric_coverage_pct: coverage.coverage_pct,
    repeat_coverage_pct: coverage.repeat_coverage_pct,
    coverage_method: coverage.method,
    coverage_cell_size_m: coverage.cell_size_m,
  };
}

export function analyzeMission({ boundary, scenario, route, samples, events }) {
  const deviation = routeDeviation(route, samples, boundary.projection);
  const analysis = {
    duration_s: samples[samples.length - 1].timestamp_s - samples[0].timestamp_s,
    mean_route_deviation_m: deviation.mean,
    max_route_deviation_m: deviation.max,
    ...coverageFields(computeCoverage(boundary, route, scenario.swath_width_m)),
    gps_quality_events: qualityEvents(samples),
    ...lengthFields(route),
    ...batteryFields(samples, events),
    sample_count: samples.length,
    diagnostics: route.diagnostics,
    limitations: LIMITATIONS,
  };
  return { ...analysis, interpretation: describeRun(analysis, scenario) };
}
