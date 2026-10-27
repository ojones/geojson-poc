import { batteryAt } from './battery.js';
import { lerp } from './geo.js';
import { createRandom } from './random.js';

export const TELEMETRY = {
  speed_mps: 12,
  sample_interval_s: 1,
  max_samples: 6000,
  good_uncertainty_m: 2.5,
  degraded_uncertainty_m: 15,
  noise_correlation: 0.8,
};

const fail = (message) => ({ ok: false, errors: [message] });

function cumulativeLengths(segments) {
  let total = 0;
  return segments.map((s) => (total += s.length_m));
}

function segmentIndexAt(ends, distance, from) {
  let index = from;
  while (index < ends.length - 1 && distance > ends[index]) index++;
  return index;
}

function plannedPoint(segment, ends, distance) {
  const startDistance = ends[segment.index] - segment.length_m;
  const t = segment.length_m === 0 ? 1 : Math.min(1, Math.max(0, (distance - startDistance) / segment.length_m));
  return lerp(segment.start, segment.end, t);
}

export function planGpsDip(durationS, seed) {
  const rng = createRandom((seed ^ 0x9e3779b9) >>> 0);
  const length = Math.max(1, Math.round(durationS * 0.1));
  const earliest = Math.round(durationS * 0.25);
  const latest = Math.max(earliest, Math.round(durationS * 0.75) - length);
  const start = earliest + Math.round(rng.next() * (latest - earliest));
  return { start_s: start, end_s: Math.min(durationS, start + length) };
}

function qualityAt(t, event) {
  const degraded = event !== null && t >= event.start_s && t <= event.end_s;
  return degraded
    ? { position_quality: 'degraded', horizontal_uncertainty_m: TELEMETRY.degraded_uncertainty_m }
    : { position_quality: 'good', horizontal_uncertainty_m: TELEMETRY.good_uncertainty_m };
}

function createNoise(seed, scale) {
  const rng = createRandom(seed);
  const phi = TELEMETRY.noise_correlation;
  const state = { x: 0, y: 0 };
  return (uncertaintyM) => {
    const sigma = (uncertaintyM / Math.SQRT2) * scale;
    const innovation = Math.sqrt(1 - phi * phi) * sigma;
    state.x = phi * state.x + innovation * rng.gaussian();
    state.y = phi * state.y + innovation * rng.gaussian();
    return { x: state.x, y: state.y };
  };
}

function observedAt(context, planned, quality) {
  const offset = context.noise(quality.horizontal_uncertainty_m);
  return context.projection.toLatLon(planned.x + offset.x, planned.y + offset.y);
}

function toSample(context, k, segment, planned, quality) {
  const observed = observedAt(context, planned, quality);
  const plannedLatLon = context.projection.toLatLon(planned.x, planned.y);
  return {
    timestamp_s: k * TELEMETRY.sample_interval_s,
    planned_latitude: plannedLatLon.latitude,
    planned_longitude: plannedLatLon.longitude,
    latitude: observed.latitude,
    longitude: observed.longitude,
    altitude_m: context.scenario.altitude_m,
    ...quality,
    battery_pct: batteryAt(k * TELEMETRY.sample_interval_s),
    segment_type: segment.type,
    synthetic: true,
    route_segment_index: segment.index,
  };
}

function buildSample(context, k) {
  const { route, ends, event } = context;
  const distance = Math.min(k * TELEMETRY.speed_mps * TELEMETRY.sample_interval_s, ends[ends.length - 1]);
  context.cursor = segmentIndexAt(ends, distance, context.cursor);
  const segment = route.segments[context.cursor];
  const quality = qualityAt(k * TELEMETRY.sample_interval_s, event);
  return toSample(context, k, segment, plannedPoint(segment, ends, distance), quality);
}

export function simulateTelemetry(route, scenario, projection, options = {}) {
  const ends = cumulativeLengths(route.segments);
  const steps = Math.ceil(ends[ends.length - 1] / (TELEMETRY.speed_mps * TELEMETRY.sample_interval_s));
  if (steps + 1 > TELEMETRY.max_samples) {
    return fail(`This mission would need ${steps + 1} telemetry samples; the limit is ${TELEMETRY.max_samples}. Use a wider swath or a smaller area.`);
  }
  const duration = steps * TELEMETRY.sample_interval_s;
  const event = scenario.simulate_gps_quality_dip ? planGpsDip(duration, scenario.seed) : null;
  const noise = createNoise(scenario.seed, options.noiseScale ?? 1);
  const context = { route, scenario, projection, ends, event, noise, cursor: 0 };
  const samples = Array.from({ length: steps + 1 }, (_, k) => buildSample(context, k));
  return { ok: true, samples, event };
}
