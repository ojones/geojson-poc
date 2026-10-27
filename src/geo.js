export const EARTH_RADIUS_M = 6371008.8;

export function createProjection(originLat, originLon) {
  const metersPerDegLat = (EARTH_RADIUS_M * Math.PI) / 180;
  const metersPerDegLon = metersPerDegLat * Math.cos((originLat * Math.PI) / 180);
  return {
    originLat,
    originLon,
    toXY: (lat, lon) => ({
      x: (lon - originLon) * metersPerDegLon,
      y: (lat - originLat) * metersPerDegLat,
    }),
    toLatLon: (x, y) => ({
      latitude: originLat + y / metersPerDegLat,
      longitude: originLon + x / metersPerDegLon,
    }),
  };
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function crosses(ring, i, x, y) {
  const a = ring[i];
  const b = ring[(i + 1) % ring.length];
  if (a.y > y === b.y > y) return false;
  return x < a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
}

export function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      if (crosses(ring, i, x, y)) inside = !inside;
    }
  }
  return inside;
}

export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + clamped * dx), p.y - (a.y + clamped * dy));
}

function orientation(a, b, c) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

export function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

export function ringSelfIntersects(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function boundsOf(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function rotate(point, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
