// craft.js — player hover-craft physics for "Aether Drift".
// Arcade anti-gravity racing: acceleration, steering, boost, boost pads,
// off-track drag, and track relation (progress / lateral).
// No three.js, no DOM. Pure state updates on G.

import { CONFIG } from './config.js';
import { G } from './state.js';
import { closestOnTrack } from './track.js';

// Global cooldown shared by all boost pads: a pad grant can only fire
// once per 1.5 s of race time, so sitting on a pad cannot farm boost.
let lastPadTime = -Infinity;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function resetPlayer() {
  const p = G.player;
  const craft = CONFIG.craft;
  if (G.track) {
    p.x = G.track.start.x;
    p.z = G.track.start.z;
    p.heading = G.track.start.heading;
  } else {
    p.x = 0;
    p.z = 0;
    p.heading = 0;
  }
  p.y = craft.hoverHeight;
  p.speed = 0;
  p.steer = 0;
  p.boost = craft.boostMax;
  p.boosting = false;
  p.offTrack = false;
  p.progress = 0;
  p.lateral = 0;
  lastPadTime = -Infinity;
}

export function updatePlayer(dt) {
  if (G.mode !== 'race' && G.mode !== 'countdown') return;
  dt = clamp(dt, 0, 0.05);

  const p = G.player;
  const craft = CONFIG.craft;
  const input = G.input;

  // Countdown: hold still on the grid (bob only).
  if (G.mode === 'countdown') {
    p.speed = 0;
    p.boosting = false;
    p.y = craft.hoverHeight + Math.sin(G.time * 2.2 + p.x * 0.05) * 0.12;
    return;
  }

  // --- Boost ---
  // Boost only engages while moving; it drains while active and
  // recharges otherwise.
  const wantBoost = !!(input.boost && p.boost > 0.05 && p.speed > 5);
  p.boosting = wantBoost;
  const topSpeed = wantBoost ? craft.boostSpeed : craft.maxSpeed;
  if (wantBoost) {
    p.boost = Math.max(0, p.boost - craft.boostDrain * dt);
  } else {
    p.boost = Math.min(craft.boostMax, p.boost + craft.boostRecharge * dt);
  }

  // --- Longitudinal: accel / brake / drag ---
  if (input.up) {
    p.speed += craft.accel * dt;
  } else if (input.down) {
    p.speed -= craft.brake * dt;
  } else {
    p.speed -= p.speed * craft.drag * dt;
    if (p.offTrack) p.speed -= p.speed * craft.offTrackDrag * dt;
  }
  p.speed = clamp(p.speed, -8, topSpeed);

  // --- Steering ---
  // Left is positive steer. Steering only bites while moving, and
  // reverses when reversing.
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  p.steer += (steerTarget - p.steer) * Math.min(1, dt * 8);
  const speedFactor = clamp(p.speed / 12, -1, 1) * (p.speed >= 0 ? 1 : -1);
  p.heading += p.steer * craft.steerRate * dt * speedFactor;

  // --- Position ---
  // Forward = (sin(heading), 0, cos(heading)); mesh rotation.y = heading.
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  p.x += fx * p.speed * dt;
  p.z += fz * p.speed * dt;
  p.y = craft.hoverHeight + Math.sin(G.time * 2.2 + p.x * 0.05) * 0.12;

  // --- Track relation ---
  if (G.track) {
    const rel = closestOnTrack(G.track, p.x, p.z);
    p.progress = rel.dist;
    p.lateral = rel.lateral;
    p.offTrack = Math.abs(rel.lateral) > G.track.width / 2 + 1.5;

    // --- Boost pads ---
    // Within 4 m of a pad, at most once per 1.5 s: refill boost and
    // add a small speed kick (capped at boost speed).
    if (G.time - lastPadTime >= 1.5) {
      for (const pad of G.track.pads) {
        const dx = p.x - pad.x;
        const dz = p.z - pad.z;
        if (dx * dx + dz * dz < 16) {
          p.boost = Math.min(craft.boostMax, p.boost + craft.padBoost);
          p.speed = Math.min(p.speed + 8, craft.boostSpeed);
          lastPadTime = G.time;
          break;
        }
      }
    }
  }
}
