export const SCENARIO = { id: 'night_sar', label: 'Nighttime search and rescue' };

export const PATTERNS = { parallel_sweep: 'Parallel sweep', crosshatch: 'Crosshatch' };

export const SENSORS = { thermal: 'Thermal', visible_light: 'Visible light' };

export const DEFAULTS = {
  pattern: 'parallel_sweep',
  sensor_assumption: 'thermal',
  altitude_m: 60,
  swath_width_m: 100,
  seed: 42,
  simulate_gps_quality_dip: true,
  battery_reserve_pct: 25,
};

export const SETTING_LIMITS = {
  altitude_m: { min: 10, max: 500, label: 'Altitude', unit: 'm' },
  swath_width_m: { min: 10, max: 500, label: 'Swath width', unit: 'm' },
  seed: { min: 0, max: 4294967295, label: 'Seed', unit: '' },
  battery_reserve_pct: { min: 5, max: 95, label: 'Battery reserve threshold', unit: '%' },
};

function numberProblem(key, raw) {
  const { min, max, label, unit } = SETTING_LIMITS[key];
  const value = typeof raw === 'string' ? (raw.trim() === '' ? NaN : Number(raw)) : raw;
  const range = `${min} to ${max}${unit ? ` ${unit}` : ''}`;
  if (!Number.isFinite(value) || value < min || value > max) return { error: `${label} must be a number from ${range}.` };
  if (key === 'seed' && !Number.isInteger(value)) return { error: `${label} must be a whole number from ${range}.` };
  return { value };
}

function choiceProblem(raw, choices, label) {
  if (!Object.hasOwn(choices, raw)) return { error: `${label} must be one of: ${Object.keys(choices).join(', ')}.` };
  return { value: raw };
}

export function parseSettings(raw) {
  const checks = {
    pattern: choiceProblem(raw.pattern, PATTERNS, 'Pattern'),
    sensor_assumption: choiceProblem(raw.sensor_assumption, SENSORS, 'Sensor assumption'),
    altitude_m: numberProblem('altitude_m', raw.altitude_m),
    swath_width_m: numberProblem('swath_width_m', raw.swath_width_m),
    seed: numberProblem('seed', raw.seed),
    battery_reserve_pct: numberProblem('battery_reserve_pct', raw.battery_reserve_pct ?? DEFAULTS.battery_reserve_pct),
  };
  const errors = Object.values(checks).filter((c) => c.error).map((c) => c.error);
  if (errors.length > 0) return { ok: false, errors };
  const values = Object.fromEntries(Object.entries(checks).map(([key, c]) => [key, c.value]));
  return { ok: true, settings: { ...values, simulate_gps_quality_dip: raw.simulate_gps_quality_dip === true } };
}

export function buildScenario(settings, boundary) {
  return {
    scenario_id: SCENARIO.id,
    scenario_label: SCENARIO.label,
    boundary_source: boundary.name,
    boundary_geometry: boundary.geometry,
    boundary_hash: boundary.hash,
    ...settings,
    synthetic: true,
  };
}
