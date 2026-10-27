import { positionAt } from './replay.js';

const STYLES = {
  boundary: { color: '#1f3a5f', weight: 2, fillColor: '#4f7cac', fillOpacity: 0.12 },
  search: { color: '#6b7280', weight: 3, dashArray: '8 6', opacity: 0.9 },
  connector: { color: '#9ca3af', weight: 2, dashArray: '2 6', opacity: 0.9 },
  track: { color: '#d9480f', weight: 3, opacity: 0.95 },
  degraded: { color: '#7b2cbf', weight: 6, opacity: 0.8, dashArray: '1 8', lineCap: 'round' },
  footprint: { color: '#0b7285', weight: 1.5, dashArray: '4 4', fillColor: '#0b7285', fillOpacity: 0.12 },
};

const AIRCRAFT_ICON = '<div class="aircraft" role="img" aria-label="Simulated aircraft"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2 L20 21 L12 17 L4 21 Z" fill="#d9480f" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div>';

const latLng = (p) => [p.latitude, p.longitude];

function segmentLatLngs(run, type) {
  const { projection } = run.boundary;
  const toLatLng = (p) => {
    const { latitude, longitude } = projection.toLatLon(p.x, p.y);
    return [latitude, longitude];
  };
  const wanted = (s) => (type === 'search' ? s.type === 'search' : s.type !== 'search');
  return run.route.segments.filter(wanted).map((s) => [toLatLng(s.start), toLatLng(s.end)]);
}

function headingDegrees(segment) {
  return (Math.atan2(segment.end.x - segment.start.x, segment.end.y - segment.start.y) * 180) / Math.PI;
}

function degradedRange(run) {
  if (run.event === null) return null;
  const first = run.samples.findIndex((s) => s.timestamp_s >= run.event.start_s);
  const last = run.samples.findLastIndex((s) => s.timestamp_s <= run.event.end_s);
  return { first, last };
}

export function createMapView(container, L, handlers) {
  if (!L) {
    container.textContent = 'Map library unavailable (network access to the Leaflet CDN is required). Mission data, results, replay timing and CSV export still work.';
    return unavailableView();
  }
  const map = L.map(container, { zoomControl: true }).setView([37.825, -122.5], 14);
  addTiles(L, map, handlers);
  const layers = { boundary: null, run: [], dynamic: null };
  return {
    showBoundary: (boundary) => showBoundary(L, map, layers, boundary),
    showRun: (run) => showRun(L, map, layers, run),
    clearRun: () => clearRun(map, layers),
    update: (t) => updateDynamic(layers, t),
    invalidate: () => map.invalidateSize(),
  };
}

function unavailableView() {
  const noop = () => {};
  return { showBoundary: noop, showRun: noop, clearRun: noop, update: noop, invalidate: noop, unavailable: true };
}

function addTiles(L, map, handlers) {
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  let errors = 0;
  tiles.on('tileerror', () => {
    errors += 1;
    if (errors === 1) handlers.onTilesUnavailable();
  });
  tiles.on('tileload', () => {
    if (errors > 0) handlers.onTilesRecovered();
    errors = 0;
  });
  tiles.addTo(map);
}

function showBoundary(L, map, layers, boundary) {
  clearRun(map, layers);
  if (layers.boundary) layers.boundary.remove();
  const rings = boundary.polygons.map((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => [lat, lon])));
  layers.boundary = L.polygon(rings, STYLES.boundary).addTo(map);
  layers.boundary.bindTooltip('Search-area boundary', { sticky: true });
  const { minLat, maxLat, minLon, maxLon } = boundary.bounds;
  map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [24, 24] });
}

function clearRun(map, layers) {
  layers.run.forEach((layer) => layer.remove());
  layers.run = [];
  layers.dynamic = null;
}

function showRun(L, map, layers, run) {
  clearRun(map, layers);
  const planned = [
    L.polyline(segmentLatLngs(run, 'search'), STYLES.search).bindTooltip('Planned search legs'),
    L.polyline(segmentLatLngs(run, 'connector'), STYLES.connector).bindTooltip('Planned turns / transit (not search)'),
  ];
  const dynamic = createDynamic(L, run);
  layers.run = [...planned, dynamic.track, dynamic.degraded, dynamic.footprint, dynamic.marker];
  layers.run.forEach((layer) => layer.addTo(map));
  layers.dynamic = dynamic;
  updateDynamic(layers, 0);
}

function createDynamic(L, run) {
  const first = latLng(run.samples[0]);
  const icon = L.divIcon({ html: AIRCRAFT_ICON, className: 'aircraft-icon', iconSize: [26, 26], iconAnchor: [13, 13] });
  return {
    run,
    range: degradedRange(run),
    observed: run.samples.map(latLng),
    track: L.polyline([first], STYLES.track),
    degraded: L.polyline([], STYLES.degraded),
    footprint: L.circle(first, { ...STYLES.footprint, radius: run.scenario.swath_width_m / 2 }).bindTooltip('Assumed footprint (swath width / 2), not a verified sensor observation'),
    marker: L.marker(first, { icon, keyboard: false, interactive: false }),
  };
}

function updateDynamic(layers, t) {
  const dynamic = layers.dynamic;
  if (!dynamic) return null;
  const position = positionAt(dynamic.run.samples, t);
  const here = latLng(position);
  dynamic.track.setLatLngs([...dynamic.observed.slice(0, position.index + 1), here]);
  dynamic.degraded.setLatLngs(degradedPath(dynamic, position.index, here));
  dynamic.footprint.setLatLng(here);
  dynamic.marker.setLatLng(here);
  rotateMarker(dynamic, position);
  return position;
}

function degradedPath(dynamic, index, here) {
  if (dynamic.range === null || index < dynamic.range.first) return [];
  return [...dynamic.observed.slice(dynamic.range.first, Math.min(index, dynamic.range.last) + 1), ...(index <= dynamic.range.last ? [here] : [])];
}

function rotateMarker(dynamic, position) {
  const element = dynamic.marker.getElement()?.firstChild;
  if (!element) return;
  const segment = dynamic.run.route.segments[position.route_segment_index];
  element.style.transform = `rotate(${headingDegrees(segment)}deg)`;
}
