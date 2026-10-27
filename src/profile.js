import { sampleElevation } from './terrain.js';

function cumulativeDistances(samples, projection) {
  let total = 0;
  let previous = null;
  return samples.map((s) => {
    const point = projection.toXY(s.planned_latitude, s.planned_longitude);
    if (previous) total += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
    return total;
  });
}

export function unavailableIntervals(points) {
  const intervals = [];
  for (const point of points) {
    const open = intervals[intervals.length - 1];
    if (point.elevation_m !== null) continue;
    if (open && open.last_index === point.index - 1) Object.assign(open, { end_s: point.timestamp_s, last_index: point.index });
    else intervals.push({ start_s: point.timestamp_s, end_s: point.timestamp_s, last_index: point.index });
  }
  return intervals.map(({ start_s, end_s }) => ({ start_s, end_s }));
}

export function buildProfile(run, dem) {
  const distances = cumulativeDistances(run.samples, run.boundary.projection);
  const points = run.samples.map((s, index) => ({
    index,
    timestamp_s: s.timestamp_s,
    distance_m: distances[index],
    elevation_m: sampleElevation(dem, s.planned_latitude, s.planned_longitude),
  }));
  const known = points.filter((p) => p.elevation_m !== null).map((p) => p.elevation_m);
  return {
    points,
    unavailable: unavailableIntervals(points),
    available_count: known.length,
    min_m: known.length > 0 ? Math.min(...known) : null,
    max_m: known.length > 0 ? Math.max(...known) : null,
    total_distance_m: distances[distances.length - 1],
  };
}
