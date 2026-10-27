import { pointInRings } from './geo.js';

export const HILLSHADE = { azimuthDeg: 315, altitudeDeg: 45, lowTint: [150, 190, 140], highTint: [225, 205, 160], opacity: 170 };

function elevationAt(dem, col, row) {
  const c = Math.min(dem.width - 1, Math.max(0, col));
  const r = Math.min(dem.height - 1, Math.max(0, row));
  return dem.elevations[r * dem.width + c];
}

function neighborhood(dem, col, row) {
  const center = elevationAt(dem, col, row);
  const at = (dc, dr) => {
    const value = elevationAt(dem, col + dc, row + dr);
    return Number.isNaN(value) ? center : value;
  };
  return { a: at(-1, -1), b: at(0, -1), c: at(1, -1), d: at(-1, 0), f: at(1, 0), g: at(-1, 1), h: at(0, 1), i: at(1, 1) };
}

function gradient(n, cell) {
  const dzdx = (n.c + 2 * n.f + n.i - (n.a + 2 * n.d + n.g)) / (8 * cell.x);
  const dzdy = (n.g + 2 * n.h + n.i - (n.a + 2 * n.b + n.c)) / (8 * cell.y);
  return { dzdx, dzdy };
}

export function shadeValue({ dzdx, dzdy }) {
  const zenith = ((90 - HILLSHADE.altitudeDeg) * Math.PI) / 180;
  const azimuth = ((360 - HILLSHADE.azimuthDeg + 90) * Math.PI) / 180;
  const slope = Math.atan(Math.hypot(dzdx, dzdy));
  const aspect = Math.atan2(dzdy, -dzdx);
  const shade = Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(azimuth - aspect);
  return Math.max(0, Math.min(1, shade));
}

function tint(fraction) {
  return HILLSHADE.lowTint.map((low, k) => low + (HILLSHADE.highTint[k] - low) * fraction);
}

function elevationRange(dem) {
  const known = dem.elevations.filter((v) => !Number.isNaN(v));
  return known.length === 0 ? { min: 0, max: 1 } : { min: known.reduce((a, b) => Math.min(a, b)), max: known.reduce((a, b) => Math.max(a, b)) };
}

function insideBoundary(dem, boundary, col, row) {
  const lon = dem.west + ((col + 0.5) / dem.width) * (dem.east - dem.west);
  const lat = dem.north - ((row + 0.5) / dem.height) * (dem.north - dem.south);
  const { x, y } = boundary.projection.toXY(lat, lon);
  return pointInRings(x, y, boundary.projected.flat());
}

function paintPixel(data, offset, rgb, shade) {
  rgb.forEach((channel, k) => (data[offset + k] = channel * (0.35 + 0.65 * shade)));
  data[offset + 3] = HILLSHADE.opacity;
}

export function hillshadePixels(dem, boundary, cell) {
  const data = new Uint8ClampedArray(dem.width * dem.height * 4);
  const range = elevationRange(dem);
  for (let row = 0; row < dem.height; row++) {
    for (let col = 0; col < dem.width; col++) {
      const value = elevationAt(dem, col, row);
      if (Number.isNaN(value) || !insideBoundary(dem, boundary, col, row)) continue;
      const rgb = tint((value - range.min) / Math.max(1e-6, range.max - range.min));
      paintPixel(data, (row * dem.width + col) * 4, rgb, shadeValue(gradient(neighborhood(dem, col, row), cell)));
    }
  }
  return data;
}
