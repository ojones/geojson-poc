import { boundsOf, distanceToSegment, pointInRings, rotate } from './geo.js';

export const PLANNER = { sidelap: 0.1, minLegM: 1, connectorSampleM: 5, edgeToleranceM: 1 };

const fail = (message) => ({ ok: false, errors: [message] });

export function lineSpacing(swathWidthM) {
  return swathWidthM * (1 - PLANNER.sidelap);
}

function rotateRings(polygons, angle) {
  return polygons.flatMap((rings) => rings).map((ring) => ring.map((p) => rotate(p, angle)));
}

function scanYs(rings, spacing) {
  const box = boundsOf(rings.flat());
  const count = Math.max(1, Math.ceil((box.maxY - box.minY) / spacing));
  const first = box.minY + (box.maxY - box.minY - (count - 1) * spacing) / 2;
  return Array.from({ length: count }, (_, i) => first + i * spacing);
}

function crossingsAt(rings, y) {
  const xs = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  return xs.sort((p, q) => p - q);
}

function intervalsAt(rings, y) {
  const xs = crossingsAt(rings, y);
  const intervals = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] >= PLANNER.minLegM) intervals.push([xs[i], xs[i + 1]]);
  }
  return intervals;
}

function scanLegs(rings, spacing) {
  const legs = [];
  let forward = true;
  for (const [line, y] of scanYs(rings, spacing).entries()) {
    const intervals = intervalsAt(rings, y);
    if (intervals.length === 0) continue;
    const ordered = forward ? intervals : [...intervals].reverse();
    for (const [x0, x1] of ordered) legs.push(forward ? { line, a: { x: x0, y }, b: { x: x1, y } } : { line, a: { x: x1, y }, b: { x: x0, y } });
    forward = !forward;
  }
  return legs;
}

function swap(leg) {
  return { ...leg, a: leg.b, b: leg.a };
}

function startDistance(legs, from) {
  return Math.hypot(legs[0].a.x - from.x, legs[0].a.y - from.y);
}

function nearestOrdering(legs, from) {
  const flipped = legs.map(swap);
  const candidates = [legs, [...legs].reverse(), flipped, [...flipped].reverse()];
  if (from === null) return legs;
  return candidates.reduce((best, c) => (startDistance(c, from) < startDistance(best, from) ? c : best));
}

function passLegs(polygons, angle, spacing, passIndex, from) {
  const rotated = rotateRings(polygons, -angle);
  const legs = nearestOrdering(scanLegs(rotated, spacing), from);
  return legs.map((leg) => ({ ...leg, pass: passIndex, a: rotate(leg.a, angle), b: rotate(leg.b, angle) }));
}

function passAngles(boundary, pattern) {
  const wide = boundary.extent.width_m >= boundary.extent.height_m;
  const primary = wide ? 0 : Math.PI / 2;
  return pattern === 'crosshatch' ? [primary, primary + Math.PI / 2] : [primary];
}

function allLegs(boundary, scenario) {
  const spacing = lineSpacing(scenario.swath_width_m);
  const legs = [];
  for (const [passIndex, angle] of passAngles(boundary, scenario.pattern).entries()) {
    const from = legs.length === 0 ? null : legs[legs.length - 1].b;
    const pass = passLegs(boundary.projected, angle, spacing, passIndex, from);
    legs.push(...pass);
  }
  return legs;
}

function connectorType(previous, next) {
  const sameLinePass = previous.pass === next.pass && Math.abs(previous.line - next.line) === 1;
  return sameLinePass ? 'turn' : 'transit';
}

function segmentLength(segment) {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

function assembleSegments(legs) {
  const segments = [];
  for (const [i, leg] of legs.entries()) {
    if (i > 0) segments.push({ type: connectorType(legs[i - 1], leg), start: legs[i - 1].b, end: leg.a });
    segments.push({ type: 'search', start: leg.a, end: leg.b });
  }
  return segments;
}

function numbered(segments) {
  const counters = {};
  return segments.map((segment, index) => {
    counters[segment.type] = (counters[segment.type] ?? 0) + 1;
    const leg_id = `${segment.type}-${String(counters[segment.type]).padStart(3, '0')}`;
    return { ...segment, index, leg_id, length_m: segmentLength(segment) };
  });
}

function nearRingEdge(point, rings) {
  return rings.some((ring) => ring.some((a, i) => distanceToSegment(point, a, ring[(i + 1) % ring.length]) <= PLANNER.edgeToleranceM));
}

function outsideLength(segment, rings) {
  const steps = Math.max(1, Math.ceil(segment.length_m / PLANNER.connectorSampleM));
  let outside = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const x = segment.start.x + (segment.end.x - segment.start.x) * t;
    const y = segment.start.y + (segment.end.y - segment.start.y) * t;
    const point = { x, y };
    if (!pointInRings(x, y, rings) && !nearRingEdge(point, rings)) outside += segment.length_m / steps;
  }
  return outside;
}

function toWaypoints(segments, projection, altitude) {
  const points = [segments[0].start, ...segments.map((s) => s.end)];
  return points.map((p, sequence) => {
    const owner = segments[Math.min(sequence, segments.length - 1)];
    const { latitude, longitude } = projection.toLatLon(p.x, p.y);
    return { sequence, latitude, longitude, altitude_m: altitude, segment_type: owner.type, leg_id: owner.leg_id };
  });
}

function sumLength(segments, type) {
  return segments.filter((s) => type === undefined || s.type === type).reduce((total, s) => total + s.length_m, 0);
}

function diagnosticsOf(segments, rings, spacing) {
  const connectors = segments.filter((s) => s.type !== 'search');
  const outside = connectors.map((s) => outsideLength(s, rings));
  return {
    search_legs: segments.length - connectors.length,
    connector_segments: connectors.length,
    connectors_leaving_area: outside.filter((m) => m > 1).length,
    connectors_leaving_area_m: outside.filter((m) => m > 1).reduce((total, m) => total + m, 0),
    line_spacing_m: spacing,
  };
}

export function planRoute(boundary, scenario) {
  const legs = allLegs(boundary, scenario);
  if (legs.length === 0) {
    return fail(`The boundary is too small to place any search leg at ${scenario.swath_width_m} m swath. Use a smaller swath or a larger area.`);
  }
  const segments = numbered(assembleSegments(legs));
  const diagnostics = diagnosticsOf(segments, boundary.projected.flat(), lineSpacing(scenario.swath_width_m));
  const waypoints = toWaypoints(segments, boundary.projection, scenario.altitude_m);
  return { ok: true, route: { segments, waypoints, total_length_m: sumLength(segments), search_length_m: sumLength(segments, 'search'), turn_length_m: sumLength(segments, 'turn'), transit_length_m: sumLength(segments, 'transit'), diagnostics } };
}
