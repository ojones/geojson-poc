import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBoundary } from './boundary.js';
import { polygonText, sampleBoundary, squareRing } from './test-helpers.js';

const rejects = (text, pattern) => {
  const result = parseBoundary(text, 'bad.geojson');
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), pattern);
};

test('the bundled sample is a valid Polygon', () => {
  const boundary = sampleBoundary();
  assert.equal(boundary.geometry, 'Polygon');
  assert.ok(boundary.area_m2 > 500000);
});

test('accepts Feature, FeatureCollection and bare geometry', () => {
  const geometry = { type: 'Polygon', coordinates: [squareRing(-122.5, 37.8, 0.005)] };
  const forms = [geometry, { type: 'Feature', properties: {}, geometry }, { type: 'FeatureCollection', features: [{ type: 'Feature', geometry }] }];
  for (const form of forms) assert.equal(parseBoundary(JSON.stringify(form), 'x').ok, true);
});

test('rejects malformed JSON, unsupported geometry and empty collections', () => {
  rejects('{not json', /not valid JSON/);
  rejects(JSON.stringify({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }), /Unsupported geometry \(LineString\)/);
  rejects(JSON.stringify({ type: 'FeatureCollection', features: [] }), /empty/);
  rejects(JSON.stringify({ type: 'GeometryCollection', geometries: [] }), /Unsupported/);
});

test('a collection mixing a polygon with a point is rejected, not partly analyzed', () => {
  const polygon = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [squareRing(-122.5, 37.8, 0.005)] } };
  const point = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } };
  rejects(JSON.stringify({ type: 'FeatureCollection', features: [polygon, point] }), /Unsupported geometry \(Point\)/);
});

test('rejects out-of-range, swapped, non-finite and unclosed coordinates', () => {
  rejects(polygonText([[[200, 0], [201, 0], [201, 1], [200, 1], [200, 0]]]), /longitude 200/);
  rejects(polygonText([[[37.8, 122.5], [37.9, 122.5], [37.9, 122.6], [37.8, 122.6], [37.8, 122.5]]]), /latitude 122/);
  rejects(polygonText([[[0, 0], [1, 0], [1, null], [0, 1], [0, 0]]]), /finite/);
  rejects(polygonText([[[-122.5, 37.8], [-122.49, 37.8], [-122.49, 37.81], [-122.5, 37.81]]]), /not closed/);
});

test('rejects degenerate rings and zero area', () => {
  rejects(polygonText([[[-122.5, 37.8], [-122.5, 37.8], [-122.49, 37.8], [-122.5, 37.8]]]), /three distinct vertices/);
  rejects(polygonText([[[-122.5, 37.8], [-122.49, 37.8], [-122.48, 37.8], [-122.5, 37.8]]]), /zero area/);
});

test('rejects self-intersecting, tiny and oversized boundaries', () => {
  rejects(polygonText([[[0, 0], [0.01, 0.01], [0.01, 0], [0, 0.01], [0, 0]]]), /crosses itself/);
  rejects(polygonText([squareRing(-122.5, 37.8, 0.0001)]), /at least/);
  rejects(polygonText([squareRing(-122.5, 37.8, 0.5)]), /limit is 10 km/);
});

test('MultiPolygon with islands and holes is kept whole', () => {
  const islandA = [squareRing(-122.5, 37.8, 0.01), squareRing(-122.497, 37.803, 0.003)];
  const islandB = [squareRing(-122.48, 37.8, 0.005)];
  const boundary = parseBoundary(polygonText([islandA, islandB], 'MultiPolygon'), 'multi').boundary;
  assert.equal(boundary.geometry, 'MultiPolygon');
  assert.equal(boundary.polygons.length, 2);
  assert.equal(boundary.polygons[0].length, 2);
});
