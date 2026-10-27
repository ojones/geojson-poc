import { describeAttribution, mentionsOpenStreetMap, parseTrails } from './context-layer.js';
import { escapeHtml } from './results-view.js';
import { describeTerrain, parseDem } from './terrain.js';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

function trailsInfoHtml(layer) {
  const osm = mentionsOpenStreetMap(layer) ? ` <a href="${OSM_COPYRIGHT}" target="_blank" rel="noopener">OpenStreetMap copyright and license</a>` : '';
  return `${layer.demo ? 'Trail context (SYNTHETIC DEMO trails, not real trails;' : 'Trail context (real source data;'} situational display only; not obstacles or validated routes): ${escapeHtml(layer.source_name)}, ${layer.lines_in_view} line(s) near the boundary. ${escapeHtml(describeAttribution(layer))}${osm}`;
}

function setLayerControls(ui, prefix, loaded) {
  ui(`${prefix}-toggle`).disabled = !loaded;
  ui(`${prefix}-remove`).disabled = !loaded;
  ui(`${prefix}-toggle`).checked = true;
}

function trailsAcceptor({ app, ui, onChange }) {
  return (layer) => {
    app.context.trails = layer;
    app.map.context.showTrails(layer);
    ui('trails-info').innerHTML = trailsInfoHtml(layer);
    setLayerControls(ui, 'trails', true);
    onChange();
  };
}

function terrainAcceptor({ app, ui, onChange }) {
  return (dem) => {
    app.context.dem = dem;
    app.map.context.showTerrain(dem, app.boundary, true);
    ui('terrain-info').textContent = describeTerrain(dem.metadata);
    setLayerControls(ui, 'terrain', true);
    onChange();
  };
}

export function createContextControls(deps) {
  const { app, ui, report, onChange } = deps;
  const removeTrails = () => clearTrails(app, ui, onChange);
  const removeTerrain = () => clearTerrain(app, ui, onChange);
  return {
    loadTrails: (text, name) => accept(parseTrails(text, name, app.boundary, ui('trails-attribution').value), 'layer', trailsAcceptor(deps), report),
    loadTerrain: (text, name) => accept(parseDem(text, name, app.boundary), 'dem', terrainAcceptor(deps), report),
    removeTrails,
    removeTerrain,
    reset: () => [removeTrails, removeTerrain].forEach((remove) => remove()),
    setTrailsVisible: (visible) => setTrailsVisible(app, visible),
    setTerrainVisible: (visible) => app.map.context.setTerrainVisible(visible),
  };
}

function accept(result, key, onAccept, report) {
  if (!result.ok) {
    report(result.errors);
    return false;
  }
  report([]);
  onAccept(result[key]);
  return true;
}

function setTrailsVisible(app, visible) {
  if (app.context.trails) app.context.trails.enabled = visible;
  app.map.context.setTrailsVisible(visible);
}

function clearTrails(app, ui, onChange) {
  app.context.trails = null;
  app.map.context.clearTrails();
  ui('trails-info').textContent = 'No trail layer loaded.';
  setLayerControls(ui, 'trails', false);
  onChange();
}

function clearTerrain(app, ui, onChange) {
  app.context.dem = null;
  app.map.context.clearTerrain();
  ui('terrain-info').textContent = 'No terrain data loaded.';
  setLayerControls(ui, 'terrain', false);
  onChange();
}
