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
  'No sensor detection, imagery quality, terrain, weather, or obstacles are modeled.',
  'Estimated geometric coverage is not usable imagery, sensor detection, or successful search coverage.',
  'The assumed footprint is a circle from swath width / 2, not a camera frustum.',
];

export function analyzeMission({ boundary, scenario, route, samples }) {
  const deviation = routeDeviation(route, samples, boundary.projection);
  const coverage = computeCoverage(boundary, route, scenario.swath_width_m);
  const analysis = {
    duration_s: samples[samples.length - 1].timestamp_s - samples[0].timestamp_s,
    mean_route_deviation_m: deviation.mean,
    max_route_deviation_m: deviation.max,
    estimated_geometric_coverage_pct: coverage.coverage_pct,
    repeat_coverage_pct: coverage.repeat_coverage_pct,
    coverage_method: coverage.method,
    coverage_cell_size_m: coverage.cell_size_m,
    gps_quality_events: qualityEvents(samples),
    route_length_m: route.total_length_m,
    search_length_m: route.search_length_m,
    sample_count: samples.length,
    diagnostics: route.diagnostics,
    limitations: LIMITATIONS,
  };
  return { ...analysis, interpretation: describeRun(analysis, scenario) };
}
