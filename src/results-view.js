import { formatDuration } from './narrative.js';
import { NO_CONTEXT, provenanceRows } from './provenance.js';

const METRICS = [
  ['duration', (a) => formatDuration(a.duration_s)],
  ['mean-deviation', (a) => `${a.mean_route_deviation_m.toFixed(1)} m`],
  ['max-deviation', (a) => `${a.max_route_deviation_m.toFixed(1)} m`],
  ['coverage', (a) => `≈ ${Math.round(a.estimated_geometric_coverage_pct)} %`],
  ['repeat-coverage', (a) => `≈ ${Math.round(a.repeat_coverage_pct)} %`],
  ['gps-event', (a) => gpsEventText(a.gps_quality_events)],
  ['search-distance', (a) => kilometers(a.search_length_m)],
  ['total-distance', (a) => `${kilometers(a.route_length_m)} (turn ${kilometers(a.turn_length_m)}, transit ${kilometers(a.transit_length_m)})`],
  ['battery', (a) => batteryText(a)],
];

function kilometers(meters) {
  return `${(meters / 1000).toFixed(2)} km`;
}

function batteryText(analysis) {
  const event = analysis.battery_reserve_event;
  const crossing = event ? `crossed ${event.value}% reserve at ${formatDuration(event.timestamp_s)}` : 'stayed above reserve';
  return `${analysis.final_battery_pct}% at end (simulated; ${crossing})`;
}

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

function provenanceItems(rows) {
  return rows.map((row) => `<li><strong>${escapeHtml(row.layer)}</strong> — ${escapeHtml(row.kind)}: ${escapeHtml(row.detail)}</li>`).join('');
}

export function renderResults(root, run, context = NO_CONTEXT) {
  const analysis = run.analysis;
  for (const [id, format] of METRICS) root.querySelector(`#metric-${id}`).textContent = format(analysis);
  root.querySelector('#coverage-method').textContent = `Method ${analysis.coverage_method}: ${analysis.coverage_cell_size_m.toFixed(0)} m grid cells whose centers fall inside the boundary and within swath/2 of a planned search leg.`;
  root.querySelector('#interpretation').textContent = analysis.interpretation;
  root.querySelector('#limitations').innerHTML = listItems(analysis.limitations);
  root.querySelector('#run-id').textContent = run.id;
  root.querySelector('#coverage-summary').textContent = `${format('coverage', analysis)} (modeled geometry)`;
  root.querySelector('#provenance').innerHTML = provenanceItems(provenanceRows(run, context));
  root.hidden = false;
}

export function refreshProvenance(root, run, context) {
  root.querySelector('#provenance').innerHTML = provenanceItems(provenanceRows(run, context));
}

export function clearResults(root) {
  root.hidden = true;
}

function format(id, analysis) {
  return METRICS.find(([key]) => key === id)[1](analysis);
}

export function renderLiveReadout(element, t, position) {
  const uncertainty = position.horizontal_uncertainty_m;
  const flag = position.position_quality === 'degraded' ? '⚠ DEGRADED (simulated GPS-quality dip)' : 'good';
  element.textContent = `Simulated position quality: ${flag}, ±${uncertainty} m · segment: ${position.segment_type} · battery ${position.battery_pct}% (simulated)`;
}
