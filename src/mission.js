import { analyzeMission } from './analysis.js';
import { buildEvents, tagSamples } from './events.js';
import { buildScenario } from './scenario.js';
import { planRoute } from './route-planner.js';
import { hashString } from './random.js';
import { simulateTelemetry } from './telemetry.js';

export function runId(scenario) {
  return `run-${hashString(JSON.stringify(scenario))}`;
}

export function buildRun(boundary, settings) {
  const scenario = buildScenario(settings, boundary);
  const planned = planRoute(boundary, scenario);
  if (!planned.ok) return planned;
  const simulated = simulateTelemetry(planned.route, scenario, boundary.projection);
  if (!simulated.ok) return simulated;
  const events = buildEvents(simulated.samples, simulated.event, scenario);
  const samples = tagSamples(simulated.samples, events);
  const analysis = analyzeMission({ boundary, scenario, route: planned.route, samples, events });
  return { ok: true, run: { id: runId(scenario), scenario, boundary, route: planned.route, samples, event: simulated.event, events, analysis } };
}
