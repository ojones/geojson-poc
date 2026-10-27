import { cellSizeM } from './terrain.js';
import { hillshadePixels } from './terrain-render.js';

const TRAIL_STYLE = { color: '#8a6d3b', weight: 1.5, opacity: 0.7, dashArray: '1 4', lineCap: 'round' };

const TERRAIN_PANE = 'terrain';

function hillshadeUrl(dem, boundary) {
  const canvas = document.createElement('canvas');
  canvas.width = dem.width;
  canvas.height = dem.height;
  const cell = cellSizeM({ bounds: dem, width: dem.width, height: dem.height });
  const image = new ImageData(hillshadePixels(dem, boundary, cell), dem.width, dem.height);
  canvas.getContext('2d').putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function showTrails(L, state, layer) {
  clearTrails(state);
  state.trails = L.featureGroup(layer.lines.map((line) => L.polyline(line.latlngs, TRAIL_STYLE).bindTooltip(line.name ?? 'Trail context (not an obstacle or route)')));
  if (layer.enabled) state.trails.addTo(state.map).bringToBack();
}

function clearTrails(state) {
  state.trails?.remove();
  state.trails = null;
}

function setVisible(state, key, visible) {
  const layer = state[key];
  if (!layer) return;
  if (visible) layer.addTo(state.map);
  else layer.remove();
  if (visible && key === 'trails') layer.bringToBack();
}

function showTerrain(L, state, dem, boundary, visible) {
  clearTerrain(state);
  if (!state.map.getPane(TERRAIN_PANE)) state.map.createPane(TERRAIN_PANE).style.zIndex = 250;
  const bounds = [[dem.south, dem.west], [dem.north, dem.east]];
  state.terrain = L.imageOverlay(hillshadeUrl(dem, boundary), bounds, { pane: TERRAIN_PANE, interactive: false, alt: 'Terrain relief shading, elevation model only' });
  if (visible) state.terrain.addTo(state.map);
}

function clearTerrain(state) {
  state.terrain?.remove();
  state.terrain = null;
}

export function createContextMap(L, map) {
  const state = { map, trails: null, terrain: null };
  return {
    showTrails: (layer) => showTrails(L, state, layer),
    clearTrails: () => clearTrails(state),
    setTrailsVisible: (visible) => setVisible(state, 'trails', visible),
    showTerrain: (dem, boundary, visible) => showTerrain(L, state, dem, boundary, visible),
    clearTerrain: () => clearTerrain(state),
    setTerrainVisible: (visible) => setVisible(state, 'terrain', visible),
  };
}

export function unavailableContextMap() {
  const noop = () => {};
  return { showTrails: noop, clearTrails: noop, setTrailsVisible: noop, showTerrain: noop, clearTerrain: noop, setTerrainVisible: noop };
}
