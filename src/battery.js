export const BATTERY = {
  model_id: 'linear_drain_v1',
  initial_pct: 100,
  drain_pct_per_min: 4.5,
};

export function batteryAt(timestampS) {
  const drained = (BATTERY.drain_pct_per_min * timestampS) / 60;
  const remaining = Math.max(0, BATTERY.initial_pct - drained);
  return Math.round(remaining * 10) / 10;
}

export function batteryDescription(reservePct) {
  return `${BATTERY.model_id}: starts at ${BATTERY.initial_pct}%, drains ${BATTERY.drain_pct_per_min} %/min regardless of speed or weather, reserve threshold ${reservePct}% (illustrative assumption, not a vehicle model)`;
}

export function findReserveCrossing(samples, reservePct) {
  const sample = samples.find((s) => s.battery_pct <= reservePct);
  return sample ? { timestamp_s: sample.timestamp_s, battery_pct: sample.battery_pct } : null;
}
