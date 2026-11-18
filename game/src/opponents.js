// opponents.js — AI rival drivers for "Aether Drift".
// Rivals follow the track centre line with a lookahead, rubber-band
// against the player (faster when behind, slower when ahead), and keep
// continuous lap / gate progress from accumulated distance.
// No three.js, no DOM. Pure state updates on G.

import { CONFIG } from './config.js';
import { G } from './state.js';
import { trackPointAt, closestOnTrack } from './track.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Wrap an angle difference into [-PI, PI] so turns always take the
// shortest direction.
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function resetRivals() {
  const craft = CONFIG.craft;
  for (let i = 0; i < G.rivals.length; i++) {
    const r = G.rivals[i];
    if (G.track) {
      // Staggered behind the start line: -10 m, -18 m, -26 m.
      const dist = -10 - i * 8;
      const progress =
        (((G.track.length + dist) % G.track.length) + G.track.length) %
        G.track.length;
      const pt = trackPointAt(G.track, progress);
      // Lateral offset, perpendicular to the track heading:
      // forward = (sin h, 0, cos h), so perp = (cos h, 0, -sin h).
      const offset = r.offset ?? 0;
      r.x = pt.x + Math.cos(pt.heading) * offset;
      r.z = pt.z - Math.sin(pt.heading) * offset;
      r.heading = pt.heading;
      r.progress = progress;
      r.lateral = offset;
    } else {
      r.x = 0;
      r.z = 0;
      r.heading = 0;
      r.progress = 0;
      r.lateral = 0;
    }
    r.y = craft.hoverHeight;
    r.speed = 0;
    r.lap = 1;
    r.nextGate = 0;
    // Accumulated distance from the reset point. Lap 1 runs until a
    // full track length has been covered after the start line.
    r.totalDist = 0;
  }
}

export function updateRivals(dt) {
  if (G.mode !== 'race') return;
  dt = clamp(dt, 0, 0.05);
  if (!G.track) return;

  const track = G.track;
  const craft = CONFIG.craft;
  const L = track.length;
  const gateSpan = L / CONFIG.gates;

  for (let i = 0; i < G.rivals.length; i++) {
    const r = G.rivals[i];
    if (r.totalDist === undefined) r.totalDist = 0;

    // --- Rubber-banding ---
    // Difference to the player, wrapped into [-L/2, L/2]: positive
    // means the player is ahead of this rival.
    let diff = G.player.progress - r.progress;
    diff = ((((diff % L) + L * 1.5) % L) - L / 2);
    const band = diff > 25 ? 1.12 : diff < -25 ? 0.88 : 1.0;
    const targetSpeed = r.topSpeed * r.skill * band;

    // --- Steering toward a lookahead point on the track ---
    const look = trackPointAt(track, r.progress + 18);
    const wobble = Math.sin(G.time * 0.7 + i * 2.1) * 0.05;
    const desired = Math.atan2(look.x - r.x, look.z - r.z) + wobble;
    const turn = wrapAngle(desired - r.heading);
    const maxTurn = 1.6 * dt;
    r.heading += clamp(turn, -maxTurn, maxTurn);

    // --- Speed toward target (accelerate 22, decelerate 30) ---
    if (r.speed < targetSpeed) {
      r.speed = Math.min(targetSpeed, r.speed + 22 * dt);
    } else {
      r.speed = Math.max(targetSpeed, r.speed - 30 * dt);
    }

    // --- Move ---
    // Forward = (sin(heading), 0, cos(heading)); mesh rotation.y = heading.
    r.x += Math.sin(r.heading) * r.speed * dt;
    r.z += Math.cos(r.heading) * r.speed * dt;
    r.y = craft.hoverHeight + Math.sin(G.time * 2.0 + i * 1.3) * 0.1;

    // --- Progress: continuous accumulation, never a raw jump ---
    r.progress = (r.progress + r.speed * dt) % L;
    if (r.progress < 0) r.progress += L;
    const rel = closestOnTrack(track, r.x, r.z);
    r.lateral = rel.lateral;

    // --- Lap / gate from accumulated distance ---
    r.totalDist += r.speed * dt;
    r.lap = Math.floor(r.totalDist / L) + 1;
    r.nextGate = Math.floor((r.totalDist % L) / gateSpan);
  }
}
