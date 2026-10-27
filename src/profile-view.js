import { layoutProfile, PROFILE_SIZE } from './profile-layout.js';

const NS = 'http://www.w3.org/2000/svg';

function node(name, attributes, text) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function axes(layout, size) {
  const bottom = size.height - size.bottom;
  return [
    node('line', { x1: size.left, x2: size.width - size.right, y1: bottom, y2: bottom, class: 'axis' }),
    node('line', { x1: size.left, x2: size.left, y1: size.top, y2: bottom, class: 'axis' }),
    ...layout.xTicks.map((t) => node('text', { x: t.x, y: bottom + 16, 'text-anchor': 'middle', class: 'tick' }, t.label)),
    ...layout.yTicks.map((t) => node('text', { x: size.left - 6, y: t.y + 4, 'text-anchor': 'end', class: 'tick' }, t.label)),
    node('text', { x: size.left + (size.width - size.left - size.right) / 2, y: size.height - 4, 'text-anchor': 'middle', class: 'axis-title' }, 'Distance along planned route (km)'),
    node('text', { x: 12, y: size.top + 70, transform: `rotate(-90 12 ${size.top + 70})`, 'text-anchor': 'middle', class: 'axis-title' }, 'Elevation (m)'),
  ];
}

function drawing(layout, size) {
  return [
    ...layout.gaps.map((g) => node('rect', { ...g, class: 'gap' })),
    ...axes(layout, size),
    ...layout.paths.map((d) => node('path', { d, class: 'line' })),
  ];
}

const NO_TERRAIN = 'No terrain data loaded. Load an elevation file to see a profile along the planned route.';

export function createProfileView(root) {
  const svg = root.querySelector('svg');
  const message = root.querySelector('.profile-message');
  const state = { layout: null, playhead: null };
  const clear = (text) => {
    svg.replaceChildren();
    state.layout = null;
    svg.hidden = true;
    message.textContent = text;
  };
  return {
    clear: (text = NO_TERRAIN) => clear(text),
    show: (profile) => showProfile(svg, message, state, profile, clear),
    update: (t, profile) => movePlayhead(state, profile, t),
  };
}

function showProfile(svg, message, state, profile, clear) {
  const layout = layoutProfile(profile);
  if (layout === null) return clear('The planned route is entirely outside the elevation data (or on no-data cells), so no profile is available.');
  svg.setAttribute('viewBox', `0 0 ${PROFILE_SIZE.width} ${PROFILE_SIZE.height}`);
  svg.replaceChildren(...drawing(layout, PROFILE_SIZE));
  state.playhead = node('line', { y1: PROFILE_SIZE.top, y2: PROFILE_SIZE.height - PROFILE_SIZE.bottom, class: 'playhead' });
  svg.append(state.playhead);
  state.layout = layout;
  svg.hidden = false;
  message.textContent = profileNote(profile);
}

function profileNote(profile) {
  const gaps = profile.unavailable.length;
  const base = `Elevation along the planned route, ${Math.round(profile.min_m)}–${Math.round(profile.max_m)} m (bare-earth elevation model; not tree, building, or wire height).`;
  return gaps === 0 ? base : `${base} Shaded bands (${gaps}) mark route intervals outside the data or on no-data cells; they are not interpolated.`;
}

function movePlayhead(state, profile, t) {
  if (!state.layout || !profile) return;
  const x = state.layout.playheadX(t);
  state.playhead.setAttribute('x1', x);
  state.playhead.setAttribute('x2', x);
}
