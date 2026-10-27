import { parseBoundary } from './boundary.js';
import { createContextControls } from './context-controls.js';
import { downloadCsv, downloadMetadata } from './export.js';
import { highlightEvents, renderTimeline } from './timeline-view.js';
import { buildProfile } from './profile.js';
import { createProfileView } from './profile-view.js';
import { createMapView } from './map-view.js';
import { buildRun } from './mission.js';
import { createReplay, positionAt } from './replay.js';
import { clearResults, refreshProvenance, renderLiveReadout, renderResults } from './results-view.js';
import { formatDuration } from './narrative.js';
import { DEFAULT_SAMPLE, SAMPLES } from './samples.js';
import { DEFAULTS, parseSettings } from './scenario.js';
import { setStatus, showErrors } from './status-view.js';

const $ = (id) => document.getElementById(id);

const app = { boundary: null, run: null, replay: null, map: null, context: { trails: null, dem: null, profile: null }, profileView: null, controls: null };

function readSettings() {
  return parseSettings({
    pattern: $('pattern').value,
    sensor_assumption: $('sensor').value,
    altitude_m: $('altitude').value,
    swath_width_m: $('swath').value,
    seed: $('seed').value,
    simulate_gps_quality_dip: $('gps-dip').checked,
    battery_reserve_pct: $('reserve').value,
  });
}

function status(state, detail) {
  setStatus($('status'), state, detail);
}

function reportErrors(messages) {
  showErrors($('errors'), messages);
  if (messages.length > 0) status('error', 'see the message above');
}

function setPlaybackEnabled(enabled) {
  for (const id of ['restart', 'play-pause', 'timeline']) $(id).disabled = !enabled;
  $('export-csv').disabled = !enabled;
  $('export-metadata').disabled = !enabled;
}

function exportContext() {
  const { trails, dem, profile } = app.context;
  return { trails, terrain: dem?.metadata ?? null, profile };
}

function refreshProfile() {
  const { dem } = app.context;
  app.context.profile = dem && app.run ? buildProfile(app.run, dem) : null;
  if (app.context.profile) app.profileView.show(app.context.profile);
  else app.profileView.clear(dem ? 'Generate a mission to see the terrain profile.' : undefined);
}

function onContextChanged() {
  refreshProfile();
  if (app.run) refreshProvenance($('results'), app.run, exportContext());
  if (app.run && app.replay) app.profileView.update(app.replay.time, app.context.profile);
}

function stopReplay() {
  app.replay?.dispose();
  app.replay = null;
}

function discardRun() {
  stopReplay();
  app.run = null;
  app.map.clearRun();
  clearResults($('results'));
  renderTimeline($('event-timeline'), [], () => {});
  refreshProfile();
  setPlaybackEnabled(false);
  $('event-flag').hidden = true;
  $('live-readout').textContent = '';
  $('time-readout').textContent = '0:00 / 0:00';
}

function describeBoundary(boundary) {
  const km2 = (boundary.area_m2 / 1e6).toFixed(2);
  return `${boundary.name} — ${boundary.geometry}, ${km2} km²`;
}

function acceptBoundary(boundary) {
  discardRun();
  app.controls.reset();
  app.boundary = boundary;
  app.map.showBoundary(boundary);
  $('boundary-label').textContent = `Active boundary: ${describeBoundary(boundary)}`;
  reportErrors([]);
  status('ready', 'boundary loaded; choose settings and generate');
}

function handleParse(result) {
  if (!result.ok) {
    reportErrors(result.errors);
    return false;
  }
  acceptBoundary(result.boundary);
  return true;
}

async function loadSample(file = $('sample-select').value) {
  const url = `data/${file}`;
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) {
    reportErrors([`Could not load ${url}. Serve this folder over HTTP (for example "python3 -m http.server") instead of opening index.html directly.`]);
    return false;
  }
  return handleParse(parseBoundary(await response.text(), file));
}

function fillSampleChoices() {
  $('sample-select').replaceChildren(...SAMPLES.map(({ file, label }) => new Option(label, file)));
  $('sample-select').value = DEFAULT_SAMPLE.file;
}

async function onFileChosen(event) {
  const file = event.target.files[0];
  if (!file) return;
  handleParse(parseBoundary(await file.text(), file.name));
  event.target.value = '';
}

function onFrame(t) {
  const { samples } = app.run;
  const position = positionAt(samples, t);
  app.map.update(t);
  $('timeline').value = String(t);
  $('time-readout').textContent = `${formatDuration(t)} / ${formatDuration(samples[samples.length - 1].timestamp_s)}`;
  $('event-flag').hidden = position.position_quality !== 'degraded';
  highlightEvents($('event-timeline'), app.run.events, t);
  app.profileView.update(t, app.context.profile);
  renderLiveReadout($('live-readout'), t, position);
}

function onReplayState(state) {
  const playing = state === 'replaying';
  $('play-pause').textContent = playing ? '❚❚ Pause' : '▶ Play';
  $('play-pause').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  status(state);
}

function adoptRun(run) {
  discardRun();
  app.run = run;
  app.map.showRun(run);
  renderResults($('results'), run, exportContext());
  renderTimeline($('event-timeline'), run.events, (t) => app.replay?.seek(t));
  refreshProfile();
  const duration = run.analysis.duration_s;
  $('timeline').max = String(duration);
  app.replay = createReplay({ duration_s: duration, speed: Number($('speed').value), onFrame, onState: onReplayState });
  setPlaybackEnabled(true);
  status('generated', `run ${run.id}`);
  app.replay.restart();
}

async function generate() {
  const settings = readSettings();
  if (!settings.ok) return reportErrors(settings.errors);
  if (!app.boundary) return reportErrors(['Load a boundary first (choose a GeoJSON file or load the sample area).']);
  reportErrors([]);
  status('generating');
  $('generate').disabled = true;
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = buildRun(app.boundary, settings.settings);
  $('generate').disabled = false;
  if (!result.ok) {
    discardRun();
    return reportErrors(result.errors);
  }
  adoptRun(result.run);
}

function togglePlay() {
  if (app.replay.state === 'replaying') app.replay.pause();
  else app.replay.play();
}

function setDefaults() {
  $('pattern').value = DEFAULTS.pattern;
  $('sensor').value = DEFAULTS.sensor_assumption;
  $('altitude').value = DEFAULTS.altitude_m;
  $('swath').value = DEFAULTS.swath_width_m;
  $('seed').value = DEFAULTS.seed;
  $('gps-dip').checked = DEFAULTS.simulate_gps_quality_dip;
  $('reserve').value = DEFAULTS.battery_reserve_pct;
}

async function fetchText(path) {
  const response = await fetch(path).catch(() => null);
  if (response?.ok) return response.text();
  reportErrors([`Could not load ${path}. Serve this folder over HTTP instead of opening index.html directly.`]);
  return null;
}

async function loadDemo(path, load) {
  const text = await fetchText(path);
  if (text !== null) load(text, path.split('/').pop());
}

async function onContextFile(event, load) {
  const file = event.target.files[0];
  if (!file) return;
  load(await file.text(), file.name);
  event.target.value = '';
}

function bindContextEvents() {
  const { controls } = app;
  $('trails-file').addEventListener('change', (event) => onContextFile(event, controls.loadTrails));
  $('terrain-file').addEventListener('change', (event) => onContextFile(event, controls.loadTerrain));
  $('load-demo-trails').addEventListener('click', () => loadDemo('data/context/sample_trails_synthetic.geojson', controls.loadTrails));
  $('load-demo-terrain').addEventListener('click', () => loadDemo('data/context/sample_terrain_synthetic.dem.json', controls.loadTerrain));
  $('trails-toggle').addEventListener('change', (event) => controls.setTrailsVisible(event.target.checked));
  $('terrain-toggle').addEventListener('change', (event) => controls.setTerrainVisible(event.target.checked));
  $('trails-remove').addEventListener('click', controls.removeTrails);
  $('terrain-remove').addEventListener('click', controls.removeTerrain);
}

function bindEvents() {
  $('setup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    generate();
  });
  $('boundary-file').addEventListener('change', onFileChosen);
  $('load-sample').addEventListener('click', () => loadSample());
  $('export-csv').addEventListener('click', () => app.run && downloadCsv(app.run, exportContext()));
  $('export-metadata').addEventListener('click', () => app.run && downloadMetadata(app.run, exportContext()));
  bindContextEvents();
  $('restart').addEventListener('click', () => app.replay?.restart());
  $('play-pause').addEventListener('click', () => app.replay && togglePlay());
  $('timeline').addEventListener('input', (event) => app.replay?.seek(Number(event.target.value)));
  $('speed').addEventListener('change', (event) => app.replay?.setSpeed(Number(event.target.value)));
}

function createMap() {
  return createMapView($('map'), window.L, {
    onTilesUnavailable: () => ($('map-notice').hidden = false),
    onTilesRecovered: () => ($('map-notice').hidden = true),
  });
}

async function start() {
  app.map = createMap();
  app.profileView = createProfileView($('terrain-profile'));
  app.controls = createContextControls({ app, ui: $, report: reportErrors, onChange: onContextChanged });
  setDefaults();
  fillSampleChoices();
  bindEvents();
  if (await loadSample(DEFAULT_SAMPLE.file)) await generate();
}

start();
