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
};

export function wideRing(lon, lat) {
  return [[lon, lat], [lon + 0.02, lat], [lon + 0.02, lat + 0.005], [lon, lat + 0.005], [lon, lat]];
}
