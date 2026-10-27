export const TRAILS = { maxVertices: 100000, paddingDeg: 0.01, layerId: 'trails-1', type: 'trail_context' };

const LINE_TYPES = ['LineString', 'MultiLineString'];

const fail = (message) => ({ ok: false, errors: [message] });

function parseJson(text) {
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return fail('Trail file is not valid JSON.');
  }
}

function featuresOf(json) {
  if (json?.type === 'FeatureCollection' && Array.isArray(json.features)) return json.features;
  if (json?.type === 'Feature') return [json];
  return null;
}

function linesOf(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return null;
}

function validPosition(position) {
  const [lon, lat] = Array.isArray(position) ? position : [];
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
}

function unsupportedTypes(features) {
  const types = features.map((f) => f?.geometry?.type ?? 'missing geometry');
  return [...new Set(types.filter((type) => !LINE_TYPES.includes(type)))];
}

function geometryProblem(features) {
  const unsupported = unsupportedTypes(features);
  if (unsupported.length > 0) return `Trail layers accept only LineString or MultiLineString features; found ${unsupported.join(', ')}.`;
  const lines = features.flatMap((f) => linesOf(f.geometry));
  if (!lines.every((line) => Array.isArray(line) && line.length >= 2 && line.every(validPosition))) {
    return 'A trail line has fewer than 2 positions or a coordinate that is not a [longitude, latitude] pair in range.';
  }
  return null;
}

function overlapsBounds(line, bounds) {
  const pad = TRAILS.paddingDeg;
  return line.some(([lon, lat]) => lon >= bounds.minLon - pad && lon <= bounds.maxLon + pad && lat >= bounds.minLat - pad && lat <= bounds.maxLat + pad);
}

function nearbyLines(features, bounds) {
  return features.flatMap((f) => linesOf(f.geometry).filter((line) => overlapsBounds(line, bounds)).map((line) => ({ name: f.properties?.name ?? null, line })));
}

function summarize(features, boundary, name, attribution, demo) {
  const lines = nearbyLines(features, boundary.bounds);
  const vertices = lines.reduce((total, l) => total + l.line.length, 0);
  if (lines.length === 0) return fail('No trail lines are within about 1 km of the search boundary. Check that the file covers this area and uses [longitude, latitude] order.');
  if (vertices > TRAILS.maxVertices) return fail(`Trail layer has ${vertices} vertices near the boundary; the limit is ${TRAILS.maxVertices}. Export a smaller area.`);
  return { ok: true, layer: layerOf(lines, features.length, name, attribution, demo) };
}

function layerOf(lines, featureCount, name, attribution, demo) {
  return {
    layer_id: TRAILS.layerId,
    type: TRAILS.type,
    source_name: name,
    source_url: null,
    format: 'GeoJSON',
    attribution,
    enabled: true,
    demo,
    feature_count: featureCount,
    lines_in_view: lines.length,
    lines: lines.map(({ name: label, line }) => ({ name: label, latlngs: line.map(([lon, lat]) => [lat, lon]) })),
  };
}

export function parseTrails(text, name, boundary, attribution = '') {
  if (!boundary) return fail('Load a search boundary before adding trail context.');
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const features = featuresOf(parsed.json);
  if (features === null || features.length === 0) return fail('Trail file must be a GeoJSON FeatureCollection with at least one LineString or MultiLineString feature.');
  const problem = geometryProblem(features);
  return problem ? fail(problem) : summarize(features, boundary, name, attribution.trim(), parsed.json.properties?.synthetic === true);
}

export function describeAttribution(layer) {
  if (layer.attribution) return layer.attribution;
  return 'No attribution was supplied for this file. Confirm its license and credit its source before sharing.';
}

export function mentionsOpenStreetMap(layer) {
  return /openstreetmap|\bosm\b/i.test(`${layer.attribution} ${layer.source_name}`);
}
