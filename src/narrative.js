import { PATTERNS, SENSORS } from './scenario.js';

export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

function eventSentence(events) {
  if (events.length === 0) return 'No simulated GPS-quality dip was included in this run.';
  const { start_s, end_s } = events[0];
  return `A simulated GPS-quality dip lasts from ${formatDuration(start_s)} to ${formatDuration(end_s)}, during which modeled position uncertainty is higher.`;
}

function batterySentence(analysis, scenario) {
  const event = analysis.battery_reserve_event;
  if (event === null) return `The simulated battery estimate stayed above the assumed ${scenario.battery_reserve_pct}% reserve threshold (final ${analysis.final_battery_pct}%).`;
  return `The simulated battery estimate crossed the assumed ${scenario.battery_reserve_pct}% reserve threshold at ${formatDuration(event.timestamp_s)}; this is a modeled value only.`;
}

function overlapSentence(analysis) {
  const repeat = Math.round(analysis.repeat_coverage_pct);
  return repeat > 0 ? `About ${repeat}% of the area is passed over by more than one search leg.` : 'Little of the area is passed over by more than one search leg.';
}

function connectorSentence(diagnostics) {
  if (diagnostics.connectors_leaving_area === 0) return '';
  return ` ${diagnostics.connectors_leaving_area} connector segment(s) cross excluded or outside areas; they are not counted as search.`;
}

export function describeRun(analysis, scenario) {
  const pattern = PATTERNS[scenario.pattern].toLowerCase();
  const km = (analysis.route_length_m / 1000).toFixed(1);
  return [
    `In this simulated run, a ${pattern} route at an assumed ${scenario.swath_width_m} m swath and nominal ${scenario.altitude_m} m altitude geometrically covers an estimated ${Math.round(analysis.estimated_geometric_coverage_pct)}% of the boundary.`,
    overlapSentence(analysis),
    `The synthetic aircraft follows ${km} km of route (${(analysis.search_length_m / 1000).toFixed(1)} km of it search legs) in ${formatDuration(analysis.duration_s)}, staying a mean ${analysis.mean_route_deviation_m.toFixed(1)} m (maximum ${analysis.max_route_deviation_m.toFixed(1)} m) from the planned line.`,
    eventSentence(analysis.gps_quality_events) + connectorSentence(analysis.diagnostics),
    batterySentence(analysis, scenario),
    `The ${SENSORS[scenario.sensor_assumption].toLowerCase()} sensor choice is a label only. These figures describe generated geometry; they do not model sensor performance and say nothing about whether anything would be seen.`,
  ].join(' ');
}
