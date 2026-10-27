import { formatDuration } from './narrative.js';

const METRICS = [
  ['duration', (a) => formatDuration(a.duration_s)],
  ['mean-deviation', (a) => `${a.mean_route_deviation_m.toFixed(1)} m`],
  ['max-deviation', (a) => `${a.max_route_deviation_m.toFixed(1)} m`],
  ['coverage', (a) => `≈ ${Math.round(a.estimated_geometric_coverage_pct)} %`],
  ['repeat-coverage', (a) => `≈ ${Math.round(a.repeat_coverage_pct)} %`],
  ['gps-event', (a) => gpsEventText(a.gps_quality_events)],
];

function gpsEventText(events) {
  if (events.length === 0) return 'No simulated GPS-quality dip included';
  return events.map((e) => `⚠ ${formatDuration(e.start_s)}–${formatDuration(e.end_s)} (simulated dip)`).join(', ');
}

function listItems(items) {
  return items.map((text) => `<li>${escapeHtml(text)}</li>`).join('');
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function renderResults(root, run) {
  const analysis = run.analysis;
  for (const [id, format] of METRICS) root.querySelector(`#metric-${id}`).textContent = format(analysis);
  root.querySelector('#coverage-method').textContent = `Method ${analysis.coverage_method}: ${analysis.coverage_cell_size_m.toFixed(0)} m grid cells whose centers fall inside the boundary and within swath/2 of a planned search leg.`;
  root.querySelector('#interpretation').textContent = analysis.interpretation;
  root.querySelector('#limitations').innerHTML = listItems(analysis.limitations);
  root.querySelector('#run-id').textContent = run.id;
  root.hidden = false;
}

export function clearResults(root) {
  root.hidden = true;
}

export function renderLiveReadout(element, t, position) {
  const uncertainty = position.horizontal_uncertainty_m;
  const flag = position.position_quality === 'degraded' ? '⚠ DEGRADED (simulated GPS-quality dip)' : 'good';
  element.textContent = `Simulated position quality: ${flag}, ±${uncertainty} m · segment: ${position.segment_type}`;
}
