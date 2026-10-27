export const VERSIONS = {
  app: '0.2.0',
  spec: 'initial-spec.md v0.1 with UPGRADE-REQUIREMENTS.md v0.1 (P0)',
};

export const KINDS = { real: 'Real source data', synthetic: 'Synthetic telemetry', assumption: 'Model assumption' };

export const NO_CONTEXT = { trails: null, terrain: null, profile: null };

function contextRows(context) {
  const trails = context.trails
    ? [{ layer: 'Trail context', kind: context.trails.demo ? KINDS.assumption : KINDS.real, detail: `${context.trails.source_name}${context.trails.demo ? ' (synthetic demo trails)' : ''}; situational display only, not obstacles or validated routes` }]
    : [];
  const terrain = context.terrain
    ? [{ layer: 'Terrain', kind: context.terrain.demo ? KINDS.assumption : KINDS.real, detail: `${context.terrain.source_name}${context.terrain.demo ? ' (synthetic demo terrain)' : ''}; bare-earth elevation model only` }]
    : [];
  return [...trails, ...terrain];
}

export function provenanceRows(run, context = NO_CONTEXT) {
  const { scenario } = run;
  return [
    { layer: 'Search boundary', kind: KINDS.real, detail: `${scenario.boundary_source} (user-supplied GeoJSON)` },
    ...contextRows(context),
    { layer: 'Planned route and coverage', kind: KINDS.assumption, detail: `swath ${scenario.swath_width_m} m, ${run.analysis.coverage_method}` },
    { layer: 'Flown track and GPS-quality dip', kind: KINDS.synthetic, detail: `seed ${scenario.seed}` },
    { layer: 'Battery and reserve event', kind: KINDS.synthetic, detail: `illustrative drain model, reserve ${scenario.battery_reserve_pct}%` },
  ];
}

export function contextSummary(context) {
  const { trails, terrain, profile } = context;
  return {
    context_layers: trails ? [{ layer_id: trails.layer_id, type: trails.type, source_name: trails.source_name, source_url: trails.source_url, format: trails.format, attribution: trails.attribution || null, enabled: trails.enabled, lines_in_view: trails.lines_in_view }] : [],
    terrain: terrain ?? { loaded: false },
    terrain_profile: profile ? { available_samples: profile.available_count, unavailable_intervals: profile.unavailable, min_m: profile.min_m, max_m: profile.max_m } : null,
  };
}
