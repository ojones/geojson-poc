import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjection, distanceToSegment, pointInRings, ringArea, ringSelfIntersects } from './geo.js';

test('projection round-trips and keeps meters', () => {
  const projection = createProjection(37.8, -122.5);
  const { x, y } = projection.toXY(37.801, -122.499);
  const back = projection.toLatLon(x, y);
  assert.ok(Math.abs(back.latitude - 37.801) < 1e-9);
  assert.ok(Math.abs(y - 111.2e3 * 0.001) < 1);
});

test('even-odd containment honors holes', () => {
  const outer = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const hole = [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }];
  assert.equal(pointInRings(2, 2, [outer, hole]), true);
  assert.equal(pointInRings(5, 5, [outer, hole]), false);
  assert.equal(ringArea(outer), 100);
});

test('distance to segment clamps at the ends', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  assert.equal(distanceToSegment({ x: 5, y: 3 }, a, b), 3);
  assert.equal(distanceToSegment({ x: 13, y: 4 }, a, b), 5);
});

test('bow-tie rings are detected as self-intersecting', () => {
  const bowTie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(ringSelfIntersects(bowTie), true);
  assert.equal(ringSelfIntersects(square), false);
});
