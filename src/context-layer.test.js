import assert from 'node:assert/strict';
import test from 'node:test';
import { describeAttribution, mentionsOpenStreetMap, parseTrails } from './context-layer.js';
import { sampleBoundary, trailsText } from './test-helpers.js';

const inside = [[-122.505, 37.825], [-122.495, 37.826]];

test('a LineString trail near the boundary loads as [lat, lon] lines', () => {
  const result = parseTrails(trailsText(inside), 'trails.geojson', sampleBoundary(), 'Test credit');
  assert.equal(result.ok, true);
  assert.deepEqual(result.layer.lines[0].latlngs[0], [37.825, -122.505]);
  assert.equal(result.layer.type, 'trail_context');
  assert.equal(result.layer.enabled, true);
});

test('MultiLineString is accepted', () => {
  assert.equal(parseTrails(trailsText([inside], 'MultiLineString'), 't', sampleBoundary()).ok, true);
});

test('unsupported geometry, bad JSON, empty and far-away layers give actionable errors', () => {
  const boundary = sampleBoundary();
  assert.match(parseTrails(trailsText([-122.5, 37.8], 'Point'), 't', boundary).errors[0], /LineString or MultiLineString/);
  assert.match(parseTrails('{nope', 't', boundary).errors[0], /not valid JSON/);
  assert.match(parseTrails('{"type":"FeatureCollection","features":[]}', 't', boundary).errors[0], /at least one/);
  assert.match(parseTrails(trailsText([[10, 10], [10.1, 10.1]]), 't', boundary).errors[0], /No trail lines/);
  assert.match(parseTrails(trailsText([[200, 10], [10, 10]]), 't', boundary).errors[0], /longitude, latitude/);
  assert.match(parseTrails(trailsText(inside), 't', null).errors[0], /boundary/);
});

test('attribution is shown, with an explicit notice when absent, and OSM is detected', () => {
  const boundary = sampleBoundary();
  const credited = parseTrails(trailsText(inside), 't', boundary, '© OpenStreetMap contributors').layer;
  const bare = parseTrails(trailsText(inside), 't', boundary).layer;
  assert.equal(describeAttribution(credited), '© OpenStreetMap contributors');
  assert.match(describeAttribution(bare), /No attribution was supplied/);
  assert.equal(mentionsOpenStreetMap(credited), true);
  assert.equal(mentionsOpenStreetMap(bare), false);
});

test('a file marked synthetic is flagged as demo data', () => {
  const text = JSON.stringify({ type: 'FeatureCollection', properties: { synthetic: true }, features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: inside } }] });
  assert.equal(parseTrails(text, 'demo', sampleBoundary()).layer.demo, true);
  assert.equal(parseTrails(trailsText(inside), 't', sampleBoundary()).layer.demo, false);
});
