import assert from 'node:assert/strict';
import test from 'node:test';
import { createReplay, locateSample, positionAt } from './replay.js';

function manualClock() {
  const clock = { time: 0, pending: null };
  clock.now = () => clock.time;
  clock.schedule = (fn) => (clock.pending = fn);
  clock.cancel = () => (clock.pending = null);
  clock.advance = (ms) => {
    clock.time += ms;
    const fn = clock.pending;
    clock.pending = null;
    if (fn) fn();
  };
  return clock;
}

function setup(duration = 100, speed = 10) {
  const clock = manualClock();
  const frames = [];
  const states = [];
  const replay = createReplay({ duration_s: duration, speed, clock, onFrame: (t) => frames.push(t), onState: (s) => states.push(s) });
  return { clock, frames, states, replay };
}

test('plays at the configured speed, pauses, and resumes', () => {
  const { clock, replay, frames } = setup();
  replay.play();
  clock.advance(1000);
  assert.equal(replay.time, 10);
  replay.pause();
  assert.equal(replay.state, 'paused');
  assert.equal(clock.pending, null);
  clock.advance(5000);
  assert.equal(replay.time, 10);
  replay.play();
  clock.advance(1000);
  assert.equal(replay.time, 20);
  assert.equal(frames.at(-1), 20);
});

test('completes at the end and replays from the start on play', () => {
  const { clock, replay, states } = setup();
  replay.play();
  clock.advance(60000);
  assert.equal(replay.state, 'completed');
  assert.equal(replay.time, 100);
  assert.equal(clock.pending, null);
  replay.play();
  assert.equal(replay.time, 0);
  assert.deepEqual(states.slice(-2), ['completed', 'replaying']);
});

test('seek works while playing, paused and completed', () => {
  const { clock, replay } = setup();
  replay.play();
  replay.seek(50);
  clock.advance(1000);
  assert.equal(replay.time, 60);
  replay.pause();
  replay.seek(5);
  assert.equal(replay.time, 5);
  assert.equal(replay.state, 'paused');
  replay.seek(500);
  assert.equal(replay.time, 100);
  assert.equal(replay.state, 'completed');
  replay.seek(-3);
  assert.equal(replay.time, 0);
  assert.equal(replay.state, 'paused');
});

test('restart rewinds and plays; dispose cancels the timer', () => {
  const { clock, replay, frames } = setup();
  replay.play();
  clock.advance(2000);
  replay.restart();
  assert.equal(frames.at(-1), 0);
  assert.equal(replay.state, 'replaying');
  clock.advance(1000);
  assert.equal(replay.time, 10);
  replay.dispose();
  assert.equal(clock.pending, null);
});

test('interpolates positions between samples', () => {
  const samples = [0, 1, 2].map((t) => ({ timestamp_s: t, latitude: t * 2, longitude: t, position_quality: t === 2 ? 'degraded' : 'good', horizontal_uncertainty_m: 1, segment_type: 'search', route_segment_index: 0 }));
  assert.deepEqual(locateSample(samples, 1.5), { index: 1, fraction: 0.5 });
  assert.equal(positionAt(samples, 0.5).latitude, 1);
  assert.equal(positionAt(samples, 99).position_quality, 'degraded');
  assert.equal(positionAt(samples, -1).index, 0);
});
