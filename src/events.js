import { findReserveCrossing } from './battery.js';

export const EVENT_TYPES = { gps_quality_degraded: 'GPS-quality dip', battery_reserve: 'Battery reserve' };

function gpsEvent(gps) {
  return {
    type: 'gps_quality_degraded',
    timestamp_s: gps.start_s,
    end_timestamp_s: gps.end_s,
    severity: 'warning',
    value: null,
    unit: null,
    summary: 'Simulated GPS-quality dip: modeled horizontal uncertainty is higher.',
  };
}

function reserveEvent(crossing, reservePct) {
  return {
    type: 'battery_reserve',
    timestamp_s: crossing.timestamp_s,
    end_timestamp_s: null,
    severity: 'notice',
    value: reservePct,
    unit: '%',
    summary: 'Simulated battery estimate reached the configured reserve threshold.',
  };
}

export function buildEvents(samples, gps, scenario) {
  const crossing = findReserveCrossing(samples, scenario.battery_reserve_pct);
  const found = [gps ? gpsEvent(gps) : null, crossing ? reserveEvent(crossing, scenario.battery_reserve_pct) : null];
  return found
    .filter(Boolean)
    .sort((a, b) => a.timestamp_s - b.timestamp_s)
    .map((event, i) => ({ event_id: `event-${String(i + 1).padStart(3, '0')}`, ...event, synthetic: true }));
}

export function isActive(event, t) {
  if (event.end_timestamp_s === null) return t >= event.timestamp_s;
  return t >= event.timestamp_s && t <= event.end_timestamp_s;
}

export function activeEvents(events, t) {
  return events.filter((event) => isActive(event, t));
}

function typesAt(events, timestampS) {
  const matching = events.filter((e) => (e.end_timestamp_s === null ? timestampS === e.timestamp_s : isActive(e, timestampS)));
  return matching.map((e) => e.type);
}

export function tagSamples(samples, events) {
  return samples.map((sample) => ({ ...sample, events: typesAt(events, sample.timestamp_s) }));
}
