// Aether Drift — shared mutable race state (singleton G).
// Every module reads/writes this one object; nothing else holds race state.
// No three.js, no DOM, no network. Does NOT import track.js (avoids a
// cycle): G.track is set by track.js buildTrack, and resetRace only reads
// G.track.start when it exists, falling back to the origin otherwise.
//
// Heading convention: forward = (sin(heading), 0, cos(heading)), so
// heading 0 faces +Z and right = (cos(heading), 0, -sin(heading)).
import { CONFIG } from './config.js';

// Small lateral grid offsets for the three rivals on the start line.
const RIVAL_OFFSETS = [-4, 0, 4];
// Distance behind the player for each rival, in metres.
const RIVAL_GAP = 8;

export const G = {
  mode: 'menu',
  seed: 1337,
  time: 0,
  raceTime: 0,
  countdownT: 0,
  lap: 1,
  laps: 3,
  nextGate: 0,
  lapStartTime: 0,
  lastLapTime: null,
  bestLapTime: null,
  raceBest: null,
  position: 4,
  finished: false,
  finishTime: null,
  results: null,
  player: {
    x: 0,
    y: 1.6,
    z: 0,
    heading: 0,
    speed: 0,
    steer: 0,
    boost: 1,
    boosting: false,
    offTrack: false,
    progress: 0,
    lateral: 0,
  },
  rivals: [],
  track: null,
  input: {
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
  },
  camMode: 0,
  shot: null,
};

function startPose() {
  // G.track.start is { x, z, heading }; fall back to the origin.
  if (G.track && G.track.start) {
    return {
      x: G.track.start.x,
      z: G.track.start.z,
      heading: G.track.start.heading,
    };
  }
  return { x: 0, z: 0, heading: 0 };
}

function resetPlayer() {
  const start = startPose();
  const p = G.player;
  p.x = start.x;
  p.y = CONFIG.craft.hoverHeight;
  p.z = start.z;
  p.heading = start.heading;
  p.speed = 0;
  p.steer = 0;
  p.boost = CONFIG.craft.boostMax;
  p.boosting = false;
  p.offTrack = false;
  p.progress = 0;
  p.lateral = 0;
}

function resetRivals() {
  const start = startPose();
  // Forward and right unit vectors in the XZ plane for this heading.
  const fx = Math.sin(start.heading);
  const fz = Math.cos(start.heading);
  const rx = Math.cos(start.heading);
  const rz = -Math.sin(start.heading);
  G.rivals = CONFIG.rivals.map((def, i) => {
    const offset = RIVAL_OFFSETS[i % RIVAL_OFFSETS.length];
    const behind = RIVAL_GAP * (i + 1);
    return {
      name: def.name,
      color: def.color,
      x: start.x - fx * behind + rx * offset,
      y: CONFIG.craft.hoverHeight,
      z: start.z - fz * behind + rz * offset,
      heading: start.heading,
      speed: 0,
      progress: -behind,
      lateral: offset,
      lap: 1,
      nextGate: 0,
      topSpeed: def.topSpeed,
      skill: def.skill,
      offset,
    };
  });
}

/**
 * Reset for a new race. Leaves G.track untouched.
 * @param {number} [seed] - seed to use; defaults to the current G.seed
 */
export function resetRace(seed) {
  if (seed !== undefined && seed !== null) G.seed = seed;
  G.mode = 'countdown';
  G.raceTime = 0;
  G.countdownT = 3;
  G.lap = 1;
  G.laps = CONFIG.laps;
  G.nextGate = 0;
  G.lapStartTime = 0;
  G.lastLapTime = null;
  G.bestLapTime = null;
  G.finished = false;
  G.finishTime = null;
  G.results = null;
  G.position = 4;
  resetPlayer();
  resetRivals();
}

/**
 * Full reset back to the menu screen.
 * @param {number} [seed] - seed to use; defaults to the current G.seed
 */
export function resetAll(seed) {
  resetRace(seed);
  G.mode = 'menu';
}
