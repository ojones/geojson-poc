import { EARTH_RADIUS_M } from './geo.js';

export const DEM_FORMAT = 'fieldline-dem-v1';

export const DEM_LIMITS = { maxCells: 1000000, minSide: 2, supportedCrs: 'EPSG:4326' };

const UNIT_TO_METERS = { m: 1, ft: 0.3048 };

const fail = (message) => ({ ok: false, errors: [message] });

function parseJson(text) {
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return fail('Elevation file is not valid JSON. Expected the compact "fieldline-dem-v1" format described in the README.');
  }
}

function boundsProblem(b) {
  const numbers = [b?.west, b?.south, b?.east, b?.north];
  if (!numbers.every(Number.isFinite)) return 'Elevation file is missing georeferencing: "bounds" needs numeric west, south, east, north in degrees.';
  if (b.west >= b.east || b.south >= b.north || Math.abs(b.west) > 180 || Math.abs(b.south) > 90 || Math.abs(b.east) > 180 || Math.abs(b.north) > 90) return 'Elevation bounds are not a valid west < east, south < north box in degrees.';
  return null;
}

function gridProblem(json) {
  const { width, height, values } = json;
  const sizes = [width, height];
  if (!sizes.every((n) => Number.isInteger(n) && n >= DEM_LIMITS.minSide)) return `Elevation width and height must be whole numbers of at least ${DEM_LIMITS.minSide} cells.`;
  if (width * height > DEM_LIMITS.maxCells) return `Elevation grid has ${width * height} cells; the limit is ${DEM_LIMITS.maxCells}. Clip or downsample it first.`;
  if (!Array.isArray(values) || values.length !== width * height) return `Elevation "values" must list width x height = ${width * height} numbers, north row first.`;
  return null;
}

function headerProblem(json) {
  if (json?.format !== DEM_FORMAT) return `Unsupported elevation file: format must be "${DEM_FORMAT}". Arbitrary GeoTIFFs are not read; see the README conversion steps.`;
  if (json.crs === undefined || json.crs === null) return 'Elevation file does not declare a coordinate reference system (crs).';
  if (json.crs !== DEM_LIMITS.supportedCrs) return `Elevation CRS "${json.crs}" is not supported; reproject to ${DEM_LIMITS.supportedCrs} (WGS84 degrees) first.`;
  if (!Object.hasOwn(UNIT_TO_METERS, json.vertical_units)) return `Vertical units must be one of: ${Object.keys(UNIT_TO_METERS).join(', ')}.`;
  return boundsProblem(json.bounds) ?? gridProblem(json);
}

function convertValues(json) {
  const factor = UNIT_TO_METERS[json.vertical_units];
  const noData = json.no_data_value ?? null;
  return Float32Array.from(json.values, (v) => (Number.isFinite(v) && v !== noData ? v * factor : NaN));
}

export function cellSizeM(json) {
  const { west, south, east, north } = json.bounds;
  const metersPerDeg = (EARTH_RADIUS_M * Math.PI) / 180;
  const midLat = ((south + north) / 2) * (Math.PI / 180);
  const x = ((east - west) / json.width) * metersPerDeg * Math.cos(midLat);
  const y = ((north - south) / json.height) * metersPerDeg;
  return { x, y };
}

export function coverageOf(bounds, boundary) {
  const b = boundary.bounds;
  const disjoint = b.maxLon < bounds.west || b.minLon > bounds.east || b.maxLat < bounds.south || b.minLat > bounds.north;
  if (disjoint) return 'none';
  const inside = b.minLon >= bounds.west && b.maxLon <= bounds.east && b.minLat >= bounds.south && b.maxLat <= bounds.north;
  return inside ? 'full' : 'partial';
}

function metadataOf(json, name, coverage) {
  const cell = cellSizeM(json);
  return {
    loaded: true,
    file_name: name,
    source_name: json.source_name ?? name,
    source_url: json.source_url ?? null,
    retrieved: json.retrieved ?? null,
    format: DEM_FORMAT,
    horizontal_resolution_m: json.resolution_m ?? Math.round(((cell.x + cell.y) / 2) * 10) / 10,
    vertical_units: json.vertical_units,
    crs: json.crs,
    no_data_value: json.no_data_value ?? null,
    width: json.width,
    height: json.height,
    coverage,
    demo: json.demo === true,
    description: json.description ?? null,
  };
}

export function parseDem(text, name, boundary) {
  if (!boundary) return fail('Load a search boundary before adding terrain.');
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const problem = headerProblem(parsed.json);
  if (problem) return fail(problem);
  const coverage = coverageOf(parsed.json.bounds, boundary);
  if (coverage === 'none') return fail('The elevation raster does not overlap the search boundary. Load a DEM covering this area.');
  const { bounds, width, height } = parsed.json;
  return { ok: true, dem: { ...bounds, width, height, elevations: convertValues(parsed.json), metadata: metadataOf(parsed.json, name, coverage) } };
}

export function cellIndex(dem, lat, lon) {
  if (lon < dem.west || lon > dem.east || lat < dem.south || lat > dem.north) return -1;
  const col = Math.min(dem.width - 1, Math.floor(((lon - dem.west) / (dem.east - dem.west)) * dem.width));
  const row = Math.min(dem.height - 1, Math.floor(((dem.north - lat) / (dem.north - dem.south)) * dem.height));
  return row * dem.width + col;
}

export function sampleElevation(dem, lat, lon) {
  const index = cellIndex(dem, lat, lon);
  if (index < 0) return null;
  const value = dem.elevations[index];
  return Number.isNaN(value) ? null : value;
}

export function describeTerrain(metadata) {
  const coverage = metadata.coverage === 'full' ? 'fully covers' : 'only partly covers';
  const demo = metadata.demo ? ' SYNTHETIC DEMO terrain, not real elevation.' : '';
  return `${metadata.source_name}: ${metadata.horizontal_resolution_m} m cells (${metadata.width}×${metadata.height}), elevation in ${metadata.vertical_units}, ${metadata.crs}; ${coverage} the search area. Elevation model only (no trees, buildings, or wires).${demo}`;
}
