export function locateSample(samples, t) {
  const last = samples.length - 1;
  if (t <= samples[0].timestamp_s) return { index: 0, fraction: 0 };
  if (t >= samples[last].timestamp_s) return { index: last, fraction: 0 };
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].timestamp_s <= t) lo = mid;
    else hi = mid;
  }
  const span = samples[hi].timestamp_s - samples[lo].timestamp_s;
  return { index: lo, fraction: (t - samples[lo].timestamp_s) / span };
}

export function positionAt(samples, t) {
  const { index, fraction } = locateSample(samples, t);
  const a = samples[index];
  const b = samples[Math.min(index + 1, samples.length - 1)];
  return {
    index,
    latitude: a.latitude + (b.latitude - a.latitude) * fraction,
    longitude: a.longitude + (b.longitude - a.longitude) * fraction,
    position_quality: a.position_quality,
    horizontal_uncertainty_m: a.horizontal_uncertainty_m,
    segment_type: a.segment_type,
    battery_pct: a.battery_pct,
    route_segment_index: a.route_segment_index,
  };
}

const browserClock = {
  now: () => performance.now(),
  schedule: (fn) => requestAnimationFrame(fn),
  cancel: (handle) => cancelAnimationFrame(handle),
};

class Replay {
  constructor({ duration_s, speed, onFrame, onState, clock }) {
    Object.assign(this, { duration_s, speed, onFrame, onState, clock });
    this.time = 0;
    this.state = 'generated';
    this.handle = null;
    this.last = 0;
    this.tick = this.tick.bind(this);
  }

  setState(state) {
    this.state = state;
    this.onState(state);
  }

  stopTimer() {
    if (this.handle !== null) this.clock.cancel(this.handle);
    this.handle = null;
  }

  tick() {
    const now = this.clock.now();
    this.time = Math.min(this.duration_s, this.time + ((now - this.last) / 1000) * this.speed);
    this.last = now;
    this.onFrame(this.time);
    if (this.time >= this.duration_s) this.finish();
    else this.handle = this.clock.schedule(this.tick);
  }

  finish() {
    this.stopTimer();
    this.setState('completed');
  }

  play() {
    if (this.state === 'replaying') return;
    if (this.state === 'completed') this.time = 0;
    this.last = this.clock.now();
    this.setState('replaying');
    this.handle = this.clock.schedule(this.tick);
  }

  pause() {
    if (this.state !== 'replaying') return;
    this.stopTimer();
    this.setState('paused');
  }

  seek(t) {
    this.time = Math.min(this.duration_s, Math.max(0, t));
    this.last = this.clock.now();
    this.onFrame(this.time);
    const atEnd = this.time >= this.duration_s;
    if (this.state !== 'replaying') this.setState(atEnd ? 'completed' : 'paused');
    else if (atEnd) this.finish();
  }

  restart() {
    this.stopTimer();
    this.time = 0;
    this.state = 'generated';
    this.onFrame(0);
    this.play();
  }

  setSpeed(value) {
    this.speed = value;
  }

  dispose() {
    this.stopTimer();
  }
}

export function createReplay({ duration_s, speed = 60, onFrame, onState, clock = browserClock }) {
  return new Replay({ duration_s, speed, onFrame, onState, clock });
}
