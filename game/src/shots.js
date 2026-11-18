// shots.js — deterministic shot presets for Aether Drift (seed 1337).
// Sets G only; touches no DOM. Call AFTER the track is built and
// resetRace has run. main.js calls showScreen after applyShot.
import { CONFIG } from './config.js';
import { G } from './state.js';
import { createRng, hashSeed } from './random.js';
import { trackPointAt } from './track.js';

export const SHOT_NAMES = ['race', 'track', 'boost', 'results'];

export function currentShot() {
  try {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('shot');
    return SHOT_NAMES.includes(name) ? name : null;
  } catch (e) {
    return null;
  }
}

// Fresh deterministic rng for a shot: createRng(hashSeed('aether-<name>')),
// using the shared helpers from random.js.
function shotRng(name) {
  return createRng(hashSeed('aether-' + name));
}

function gateAfter(progress) {
  const t = G.track;
  if (!t || !t.gates || t.gates.length === 0) return 0;
  for (let i = 0; i < t.gates.length; i++) {
    if (t.gates[i].dist > progress) return i;
  }
  return 0;
}

function placeCraft(craft, dist, speed, opts) {
  const o = opts || {};
  const p = trackPointAt(G.track, dist);
  const len = (G.track && G.track.length) || 0;
  const progress = len > 0 ? ((dist % len) + len) % len : dist;
  craft.progress = progress;
  if (p) {
    craft.x = p.x;
    craft.z = p.z;
    craft.heading = p.heading;
  }
  craft.y = CONFIG.craft.hoverHeight;
  craft.speed = speed;
  craft.lateral = o.lateral !== undefined ? o.lateral : 0;
  if ('steer' in craft) craft.steer = 0;
  if ('boost' in craft) craft.boost = o.boost !== undefined ? o.boost : craft.boost;
  if ('boosting' in craft) craft.boosting = !!o.boosting;
  if ('offTrack' in craft) craft.offTrack = false;
  return progress;
}

function placeRivals(rng, specs) {
  if (!G.rivals) return;
  G.rivals.forEach((r, i) => {
    const s = specs[i % specs.length];
    const progress = placeCraft(r, s.dist, s.speed, { lateral: s.lateral });
    r.lap = s.lap !== undefined ? s.lap : G.lap;
    r.nextGate = gateAfter(progress);
    if (r.offset === undefined) r.offset = s.lateral;
  });
}

export function applyShot(name) {
  if (!SHOT_NAMES.includes(name)) return false;
  const rng = shotRng(name);
  const t = G.track;
  const L = (t && t.length) || 0;
  if (!t || L <= 0) return false;

  if (name === 'race') {
    G.mode = 'race';
    G.shot = 'race';
    G.time = 12.0;
    G.raceTime = 47.3;
    G.lap = 1;
    G.lapStartTime = 0;
    G.nextGate = 3;
    G.position = 2;
    G.finished = false;
    G.finishTime = 0;
    G.results = null;
    G.lastLapTime = null;
    G.bestLapTime = null;
    G.countdownT = 0;
    G.camMode = 0;
    placeCraft(G.player, 0.35 * L, 52, { boost: 0.8, boosting: false, lateral: 0 });
    placeRivals(rng, [
      { dist: 0.33 * L, speed: 48 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 1 },
      { dist: 0.36 * L, speed: 48 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 1 },
      { dist: 0.30 * L, speed: 48 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 1 },
    ]);
    return true;
  }

  if (name === 'track') {
    G.mode = 'race';
    G.shot = 'track';
    G.time = 12.0;
    G.raceTime = 18.9;
    G.lap = 1;
    G.lapStartTime = 0;
    G.nextGate = 1;
    G.position = 3;
    G.finished = false;
    G.finishTime = 0;
    G.results = null;
    G.lastLapTime = null;
    G.bestLapTime = null;
    G.countdownT = 0;
    G.camMode = 1;
    placeCraft(G.player, 0.12 * L, 40, { boost: 0.6, boosting: false, lateral: 0 });
    placeRivals(rng, [
      { dist: 0.10 * L, speed: 38 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 1 },
      { dist: 0.14 * L, speed: 38 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 1 },
      { dist: 0.08 * L, speed: 38 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 1 },
    ]);
    return true;
  }

  if (name === 'boost') {
    const padDist = t.pads && t.pads.length > 0 ? t.pads[0].dist : 0.5 * L;
    G.mode = 'race';
    G.shot = 'boost';
    G.time = 12.0;
    G.raceTime = 61.2;
    G.lap = 2;
    G.lapStartTime = 30.0;
    G.nextGate = 5;
    G.position = 1;
    G.finished = false;
    G.finishTime = 0;
    G.results = null;
    G.lastLapTime = null;
    G.bestLapTime = null;
    G.countdownT = 0;
    G.camMode = 0;
    placeCraft(G.player, padDist, 68, { boost: 0.9, boosting: true, lateral: 0 });
    placeRivals(rng, [
      { dist: padDist - 0.02 * L, speed: 66 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 2 },
      { dist: padDist + 0.02 * L, speed: 66 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 2 },
      { dist: padDist - 0.04 * L, speed: 66 + rng.next() * 4, lateral: (rng.next() - 0.5) * 6, lap: 2 },
    ]);
    return true;
  }

  if (name === 'results') {
    G.mode = 'results';
    G.shot = 'results';
    G.time = 178.4;
    G.raceTime = 178.4;
    G.lap = 3;
    G.finished = true;
    G.finishTime = 178.4;
    G.results = [
      { name: 'YOU', time: 178.4, isPlayer: true },
      { name: 'VEX', time: 181.2, isPlayer: false },
      { name: 'ION', time: 186.7, isPlayer: false },
      { name: 'NOVA', time: 192.3, isPlayer: false },
    ];
    G.position = 1;
    G.countdownT = 0;
    G.camMode = 0;
    return true;
  }

  return false;
}
