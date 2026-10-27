import { boundsOf, createProjection, ringArea, ringSelfIntersects } from './geo.js';
import { hashString } from './random.js';

export const BOUNDARY_LIMITS = { maxExtentM: 10000, minAreaM2: 2500 };

const POLYGON_TYPES = ['Polygon', 'MultiPolygon'];

const fail = (message) => ({ ok: false, errors: [message] });

export function parseBoundary(text, name) {
  const json = parseJson(text);
  if (!json.ok) return json;
  const found = collectPolygons(json.value);
  if (!found.ok) return found;
  return buildBoundary(found.polygons, name);
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return fail(`File is not valid JSON: ${error.message}`);
  }
}

function geometriesOf(value) {
  if (value?.type === 'FeatureCollection') {
    return Array.isArray(value.features) ? value.features.map((f) => f?.geometry ?? null) : null;
  }
  if (value?.type === 'Feature') return [value.geometry ?? null];
  return [value];
}

function unsupportedMessage(geometry) {
  const type = geometry?.type ?? 'missing geometry';
  return `Unsupported geometry (${type}). Only Polygon and MultiPolygon are supported; nothing was analyzed.`;
}

function polygonsOfGeometry(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  return Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
}

function collectPolygons(value) {
  const geometries = geometriesOf(value);
  if (geometries === null) return fail('FeatureCollection has no "features" array.');
  if (geometries.length === 0) return fail('FeatureCollection is empty; it must contain a Polygon or MultiPolygon.');
  const unsupported = geometries.find((g) => !POLYGON_TYPES.includes(g?.type));
  if (unsupported !== undefined) return fail(unsupportedMessage(unsupported));
  return validatePolygons(geometries.flatMap(polygonsOfGeometry));
}

function validatePolygons(polygons) {
  if (polygons.length === 0) return fail('The geometry contains no polygons.');
  const cleaned = [];
  for (const [index, rings] of polygons.entries()) {
    const result = validateRings(rings, `Polygon ${index + 1}`);
    if (!result.ok) return result;
    cleaned.push(result.rings);
  }
  return { ok: true, polygons: cleaned };
}

function validateRings(rings, label) {
  if (!Array.isArray(rings) || rings.length === 0) return fail(`${label}: has no coordinate rings.`);
  const cleaned = [];
  for (const [index, ring] of rings.entries()) {
    const result = validateRing(ring, `${label}, ${index === 0 ? 'outer ring' : `hole ${index}`}`);
    if (!result.ok) return result;
    cleaned.push(result.ring);
  }
  return { ok: true, rings: cleaned };
}

function positionProblem(position) {
  if (!Array.isArray(position) || position.length < 2) return 'positions must be [longitude, latitude]';
  const [lon, lat] = position;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return 'coordinates must be finite numbers';
  if (lat < -90 || lat > 90) return `latitude ${lat} is outside [-90, 90] (GeoJSON order is [longitude, latitude]; were they swapped?)`;
  if (lon < -180 || lon > 180) return `longitude ${lon} is outside [-180, 180]`;
  return null;
}

function withoutRepeats(positions) {
  return positions.filter((p, i) => i === 0 || p[0] !== positions[i - 1][0] || p[1] !== positions[i - 1][1]);
}

function validateRing(ring, label) {
  if (!Array.isArray(ring)) return fail(`${label}: a ring must be an array of positions.`);
  const problem = ring.map(positionProblem).find((p) => p !== null);
  if (problem !== undefined) return fail(`${label}: ${problem}.`);
  const positions = withoutRepeats(ring.map((p) => [p[0], p[1]]));
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (positions.length < 2 || first[0] !== last[0] || first[1] !== last[1]) return fail(`${label}: ring is not closed (first and last position must match).`);
  if (new Set(positions.map((p) => `${p[0]},${p[1]}`)).size < 3) return fail(`${label}: needs at least three distinct vertices.`);
  return { ok: true, ring: positions };
}

function allPositions(polygons) {
  return polygons.flatMap((rings) => rings.flat());
}

function projectPolygons(polygons, projection) {
  return polygons.map((rings) => rings.map((ring) => ring.slice(0, -1).map(([lon, lat]) => projection.toXY(lat, lon))));
}

function buildBoundary(polygons, name) {
  const positions = allPositions(polygons);
  const lats = positions.map((p) => p[1]);
  const lons = positions.map((p) => p[0]);
  const bounds = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) };
  const projection = createProjection((bounds.minLat + bounds.maxLat) / 2, (bounds.minLon + bounds.maxLon) / 2);
  const projected = projectPolygons(polygons, projection);
  const geometry = polygons.length === 1 ? 'Polygon' : 'MultiPolygon';
  const boundary = { name, geometry, polygons, projected, projection, bounds, hash: hashString(JSON.stringify(polygons)) };
  return checkGeometry(boundary);
}

function ringProblem(ring, label) {
  if (ringSelfIntersects(ring)) return `${label} crosses itself; fix the self-intersection.`;
  if (Math.abs(ringArea(ring)) < 1e-6) return `${label} has zero area.`;
  return null;
}

function geometryProblem(projected) {
  for (const [p, rings] of projected.entries()) {
    const problem = rings.map((ring, r) => ringProblem(ring, `Polygon ${p + 1} ${r === 0 ? 'outer ring' : `hole ${r}`}`)).find(Boolean);
    if (problem) return problem;
  }
  return null;
}

export function netArea(projected) {
  return projected.reduce((total, rings) => {
    const [outer, ...holes] = rings;
    return total + Math.abs(ringArea(outer)) - holes.reduce((sum, hole) => sum + Math.abs(ringArea(hole)), 0);
  }, 0);
}

function checkGeometry(boundary) {
  const problem = geometryProblem(boundary.projected);
  if (problem) return fail(problem);
  const box = boundsOf(boundary.projected.flat(2));
  const extent = { width_m: box.maxX - box.minX, height_m: box.maxY - box.minY };
  if (Math.max(extent.width_m, extent.height_m) > BOUNDARY_LIMITS.maxExtentM) {
    return fail(`Boundary spans ${(Math.max(extent.width_m, extent.height_m) / 1000).toFixed(1)} km; the limit is ${BOUNDARY_LIMITS.maxExtentM / 1000} km on either side.`);
  }
  const area = netArea(boundary.projected);
  if (area < BOUNDARY_LIMITS.minAreaM2) return fail(`Boundary area is ${Math.round(area)} m²; at least ${BOUNDARY_LIMITS.minAreaM2} m² is required.`);
  return { ok: true, boundary: { ...boundary, extent, area_m2: area } };
}
