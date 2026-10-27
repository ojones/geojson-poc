export const PROFILE_SIZE = { width: 640, height: 190, left: 52, right: 12, top: 12, bottom: 38 };

function scaleFor(profile, size) {
  const span = Math.max(1, profile.max_m - profile.min_m);
  const low = profile.min_m - span * 0.1;
  const high = profile.max_m + span * 0.1;
  const plotW = size.width - size.left - size.right;
  const plotH = size.height - size.top - size.bottom;
  return {
    x: (distance) => size.left + (distance / Math.max(1, profile.total_distance_m)) * plotW,
    y: (elevation) => size.top + (1 - (elevation - low) / (high - low)) * plotH,
    low,
    high,
  };
}

function runsOf(points) {
  const runs = [];
  let current = [];
  for (const point of points) {
    if (point.elevation_m === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else current.push(point);
  }
  return current.length > 0 ? [...runs, current] : runs;
}

function pathOf(run, scale) {
  return run.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.x(p.distance_m).toFixed(1)},${scale.y(p.elevation_m).toFixed(1)}`).join('');
}

function gapRect(interval, profile, scale, size) {
  const at = (t) => profile.points.find((p) => p.timestamp_s === t).distance_m;
  const x0 = scale.x(at(interval.start_s));
  const x1 = scale.x(at(interval.end_s));
  return { x: x0, width: Math.max(2, x1 - x0), y: size.top, height: size.height - size.top - size.bottom };
}

function ticks(from, to, count) {
  return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);
}

export function layoutProfile(profile, size = PROFILE_SIZE) {
  if (profile.available_count === 0) return null;
  const scale = scaleFor(profile, size);
  return {
    paths: runsOf(profile.points).map((run) => pathOf(run, scale)),
    gaps: profile.unavailable.map((interval) => gapRect(interval, profile, scale, size)),
    xTicks: ticks(0, profile.total_distance_m, 4).map((d) => ({ x: scale.x(d), label: (d / 1000).toFixed(1) })),
    yTicks: ticks(scale.low, scale.high, 3).map((e) => ({ y: scale.y(e), label: Math.round(e) })),
    playheadX: (t) => scale.x(distanceAt(profile, t)),
  };
}

export function distanceAt(profile, t) {
  const last = profile.points.length - 1;
  const index = Math.min(last, Math.max(0, Math.floor(t)));
  const a = profile.points[index];
  const b = profile.points[Math.min(last, index + 1)];
  const span = b.timestamp_s - a.timestamp_s;
  return span === 0 ? a.distance_m : a.distance_m + (b.distance_m - a.distance_m) * Math.min(1, (t - a.timestamp_s) / span);
}
