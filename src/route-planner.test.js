import assert from 'node:assert/strict';
import test from 'node:test';
import { pointInRings } from './geo.js';
import { lineSpacing, planRoute } from './route-planner.js';
import { buildScenario } from './scenario.js';
import { parseOk, polygonText, sampleBoundary, SETTINGS, squareRing, wideRing } from './test-helpers.js';

const plan = (boundary, overrides = {}) => planRoute(boundary, buildScenario({ ...SETTINGS, ...overrides }, boundary));

const squareBoundary = () => parseOk(polygonText([squareRing(-122.5, 37.8, 0.01)]));

const wideBoundary = () => parseOk(polygonText([wideRing(-122.5, 37.8)]));

function sampleAlong(segment, stepM = 2) {
  const count = Math.max(1, Math.ceil(segment.length_m / stepM));
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: segment.start.x + ((segment.end.x - segment.start.x) * i) / count,
    y: segment.start.y + ((segment.end.y - segment.start.y) * i) / count,
  }));
}

function nearEdge(point, rings, tolerance) {
  const inset = (dx, dy) => pointInRings(point.x + dx, point.y + dy, rings);
  return [[tolerance, 0], [-tolerance, 0], [0, tolerance], [0, -tolerance]].some(([dx, dy]) => inset(dx, dy));
}

test('every search-leg sample lies inside the eligible area', () => {
  for (const boundary of [sampleBoundary(), squareBoundary()]) {
    const { route } = plan(boundary);
    const rings = boundary.projected.flat();
    const searches = route.segments.filter((s) => s.type === 'search');
    for (const point of searches.flatMap((s) => sampleAlong(s))) {
      assert.ok(pointInRings(point.x, point.y, rings) || nearEdge(point, rings, 0.5), JSON.stringify(point));
    }
  }
});

test('parallel sweep alternates direction between adjacent lines', () => {
  const { route } = plan(squareBoundary());
  const searches = route.segments.filter((s) => s.type === 'search');
  const directions = searches.map((s) => Math.sign(s.end.x - s.start.x));
  directions.slice(1).forEach((d, i) => assert.equal(d, -directions[i]));
});

test('spacing follows the swath and turns link adjacent lines', () => {
  const { route } = plan(wideBoundary());
  const searches = route.segments.filter((s) => s.type === 'search');
  assert.ok(Math.abs(Math.abs(searches[1].start.y - searches[0].start.y) - lineSpacing(100)) < 1e-6);
  assert.ok(route.segments.filter((s) => s.type !== 'search').every((s) => s.type === 'turn'));
});

test('crosshatch adds a second orientation with a transit between passes', () => {
  const boundary = squareBoundary();
  const single = plan(boundary).route;
  const hatch = plan(boundary, { pattern: 'crosshatch' }).route;
  assert.ok(hatch.search_length_m > 1.8 * single.search_length_m);
  assert.equal(hatch.segments.filter((s) => s.type === 'transit').length, 1);
});

test('segments are contiguous and waypoints carry types, ids and altitude', () => {
  const { route } = plan(sampleBoundary());
  route.segments.slice(1).forEach((s, i) => assert.deepEqual(s.start, route.segments[i].end));
  assert.equal(route.waypoints.length, route.segments.length + 1);
  assert.deepEqual(route.waypoints[0], { ...route.waypoints[0], sequence: 0, altitude_m: 60, segment_type: 'search', leg_id: 'search-001' });
});

test('a hole is never searched and islands are all planned', () => {
  const holey = parseOk(polygonText([squareRing(-122.5, 37.8, 0.01), squareRing(-122.4965, 37.8035, 0.003)]));
  const rings = holey.projected.flat();
  for (const s of plan(holey).route.segments.filter((seg) => seg.type === 'search')) {
    for (const p of sampleAlong(s)) assert.ok(pointInRings(p.x, p.y, rings) || nearEdge(p, rings, 0.5));
  }
  const islands = parseOk(polygonText([[squareRing(-122.5, 37.8, 0.004)], [squareRing(-122.49, 37.8, 0.004)]], 'MultiPolygon'));
  const xs = plan(islands).route.segments.filter((s) => s.type === 'search').map((s) => s.start.x);
  assert.ok(Math.min(...xs) < -100 && Math.max(...xs) > 300);
  assert.ok(plan(islands).route.diagnostics.connectors_leaving_area >= 1);
});

test('concave areas produce several intervals per scan line', () => {
  const u = [[-122.5, 37.8], [-122.49, 37.8], [-122.49, 37.81], [-122.495, 37.81], [-122.495, 37.803], [-122.5, 37.803], [-122.5, 37.8]];
  const { route } = plan(parseOk(polygonText([u])), { swath_width_m: 40 });
  assert.ok(route.diagnostics.search_legs > route.segments.filter((s) => s.type === 'turn').length);
});

test('a boundary too thin for any search leg fails with a recoverable message', () => {
  const sliver = parseOk(polygonText([[[-122.5, 37.8], [-122.45, 37.83], [-122.44999, 37.83], [-122.49999, 37.8], [-122.5, 37.8]]]));
  const result = plan(sliver, { swath_width_m: 500 });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /too small/);
});

test('a small area still gets a centered line when the swath is wider than it', () => {
  const tiny = parseOk(polygonText([squareRing(-122.5, 37.8, 0.0006)]));
  assert.equal(plan(tiny, { swath_width_m: 500 }).route.diagnostics.search_legs, 1);
});

test('lengths are reported per segment type and transit never counts as search', () => {
  const concave = plan(sampleBoundary(), { swath_width_m: 50 }).route;
  const sum = (type) => concave.segments.filter((s) => s.type === type).reduce((total, s) => total + s.length_m, 0);
  assert.equal(concave.search_length_m, sum('search'));
  assert.equal(concave.turn_length_m, sum('turn'));
  assert.equal(concave.transit_length_m, sum('transit'));
  assert.ok(Math.abs(concave.total_length_m - (sum('search') + sum('turn') + sum('transit'))) < 1e-6);
  assert.ok(concave.transit_length_m > 0);
});
