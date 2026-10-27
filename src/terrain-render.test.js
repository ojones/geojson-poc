import assert from 'node:assert/strict';
import test from 'node:test';
import { cellSizeM, parseDem } from './terrain.js';
import { hillshadePixels, shadeValue } from './terrain-render.js';
import { demText, sampleBoundary } from './test-helpers.js';

test('flat ground shades at the sun altitude cosine; slopes facing the sun are brighter', () => {
  const flat = shadeValue({ dzdx: 0, dzdy: 0 });
  assert.ok(Math.abs(flat - Math.SQRT1_2) < 1e-6);
  const towardSun = shadeValue({ dzdx: 0.5, dzdy: 0.5 });
  const awayFromSun = shadeValue({ dzdx: -0.5, dzdy: -0.5 });
  assert.ok(towardSun > flat && awayFromSun < flat);
});

test('pixels are transparent outside the search area and on no-data', () => {
  const boundary = sampleBoundary();
  const wide = { west: -122.52, south: 37.81, east: -122.48, north: 37.84 };
  const values = Array.from({ length: 16 }, (_, i) => (i === 0 ? -9999 : 100 + i * 3));
  const { dem } = parseDem(demText({ bounds: wide, values }), 'd', boundary);
  const data = hillshadePixels(dem, boundary, cellSizeM({ bounds: wide, width: 4, height: 4 }));
  assert.equal(data[3], 0);
  assert.ok(Array.from({ length: 16 }, (_, i) => data[i * 4 + 3]).some((alpha) => alpha > 0));
});
