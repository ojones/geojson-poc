import { readFileSync } from 'node:fs';
import { parseBoundary } from './boundary.js';

export function polygonText(rings, type = 'Polygon') {
  return JSON.stringify({ type, coordinates: rings });
}

export function squareRing(lon, lat, sizeDeg) {
  return [[lon, lat], [lon + sizeDeg, lat], [lon + sizeDeg, lat + sizeDeg], [lon, lat + sizeDeg], [lon, lat]];
}

export function parseOk(text, name = 'test.geojson') {
  const result = parseBoundary(text, name);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.boundary;
}

export function sampleBoundary() {
  const url = new URL('../data/sample_search_area.geojson', import.meta.url);
  return parseOk(readFileSync(url, 'utf8'), 'sample_search_area.geojson');
}

export const SETTINGS = {
  pattern: 'parallel_sweep',
  sensor_assumption: 'thermal',
  altitude_m: 60,
  swath_width_m: 100,
  seed: 42,
  simulate_gps_quality_dip: true,
  battery_reserve_pct: 25,
};

export function wideRing(lon, lat) {
  return [[lon, lat], [lon + 0.02, lat], [lon + 0.02, lat + 0.005], [lon, lat + 0.005], [lon, lat]];
}

export function demText(overrides = {}) {
  const values = Array.from({ length: 16 }, (_, i) => 100 + i);
  const dem = {
    format: 'fieldline-dem-v1',
    source_name: 'Test DEM',
    crs: 'EPSG:4326',
    bounds: { west: -122.51, south: 37.82, east: -122.49, north: 37.83 },
    width: 4,
    height: 4,
    vertical_units: 'm',
    no_data_value: -9999,
    values,
    ...overrides,
  };
  return JSON.stringify(dem);
}

export function trailsText(coordinates, type = 'LineString') {
  return JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Test trail' }, geometry: { type, coordinates } }] });
}
