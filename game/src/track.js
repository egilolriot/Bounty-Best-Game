// track.js — Aether Drift world visuals (worker 2)
// Closed-loop centerline built from seeded control points, sampled with a
// closed Catmull-Rom spline. Pure geometry: no rendering, no network.
// Heading convention: heading = atan2(dx, dz), so the forward vector in
// (x, z) is (sin(heading), cos(heading)). A mesh with rotation.y = heading
// and forward +Z therefore travels along the tangent. Positive lateral is
// to the LEFT of travel: left normal in (x, z) is (cos(h), -sin(h)).
import { CONFIG } from './config.js';
import { createRng } from './random.js';

const TWO_PI = Math.PI * 2;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function segIndexForDist(track, dist) {
  // Binary search: largest i with cum[i] <= dist. cum has `samples` entries.
  const cum = track.cum;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= dist) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function buildTrack(seed) {
  const rng = createRng(seed !== undefined ? seed : CONFIG.seed);
  const t = CONFIG.track;

  // Control points: ring of radius radius +/- radiusVar (deterministic).
  const ctrl = [];
  for (let i = 0; i < t.controlPoints; i++) {
    const angle = (i / t.controlPoints) * TWO_PI;
    const radius = t.radius + (rng.next() - 0.5) * 2 * t.radiusVar;
    ctrl.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  }

  // Sample the closed Catmull-Rom spline into `samples` points.
  const n = ctrl.length;
  const samples = t.samples;
  const points = [];
  for (let s = 0; s < samples; s++) {
    const u = (s / samples) * n;
    const i = Math.floor(u) % n;
    const f = u - Math.floor(u);
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    points.push({
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, f),
      z: catmullRom(p0.z, p1.z, p2.z, p3.z, f),
    });
  }

  // Cumulative distance per sample; length closes the loop.
  const cum = new Array(samples);
  cum[0] = 0;
  for (let i = 1; i < samples; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    cum[i] = cum[i - 1] + Math.hypot(dx, dz);
  }
  const dx0 = points[0].x - points[samples - 1].x;
  const dz0 = points[0].z - points[samples - 1].z;
  const length = cum[samples - 1] + Math.hypot(dx0, dz0);

  const track = { points, cum, length, width: t.width, gates: [], pads: [], start: null, bounds: null };

  // Start = points[0], heading toward points[1].
  const startHeading = Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z);
  track.start = { x: points[0].x, z: points[0].z, heading: startHeading, dist: 0 };

  // Gates: equally spaced by distance around the loop.
  for (let i = 0; i < CONFIG.gates; i++) {
    const dist = (i * length) / CONFIG.gates;
    const p = trackPointAt(track, dist);
    track.gates.push({
      index: segIndexForDist(track, dist),
      dist,
      x: p.x,
      z: p.z,
      heading: p.heading,
    });
  }

  // Boost pads: spread along the loop on the centerline, never on the start line.
  const padFractions = [0.18, 0.34, 0.52, 0.68, 0.84, 0.95];
  for (let i = 0; i < t.padCount; i++) {
    const frac = padFractions[i % padFractions.length];
    const dist = frac * length;
    const p = trackPointAt(track, dist);
    track.pads.push({ dist, x: p.x, z: p.z });
  }

  // Bounds of the centerline.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  track.bounds = { minX, maxX, minZ, maxZ };

  return track;
}

export function trackPointAt(track, dist) {
  const len = track.length;
  let d = dist % len;
  if (d < 0) d += len;
  const i = segIndexForDist(track, d);
  const j = (i + 1) % track.points.length;
  const p0 = track.points[i];
  const p1 = track.points[j];
  const segLen = (j === 0 ? len : track.cum[j]) - track.cum[i];
  const f = segLen > 0 ? (d - track.cum[i]) / segLen : 0;
  const x = p0.x + (p1.x - p0.x) * f;
  const z = p0.z + (p1.z - p0.z) * f;
  const heading = Math.atan2(p1.x - p0.x, p1.z - p0.z);
  return { x, z, heading };
}

export function closestOnTrack(track, x, z) {
  const pts = track.points;
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = x - pts[i].x;
    const dz = z - pts[i].z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  const p = pts[best];
  const q = pts[(best + 1) % pts.length];
  // Tangent at the nearest sample, for the signed lateral offset.
  const tx = q.x - p.x;
  const tz = q.z - p.z;
  const tl = Math.hypot(tx, tz) || 1;
  const hx = tx / tl;
  const hz = tz / tl;
  // Left normal in (x, z) is (cos(h), -sin(h)) = (hz, -hx) for
  // forward (hx, hz) = (sin(h), cos(h)).
  const ox = x - p.x;
  const oz = z - p.z;
  const lateral = ox * hz - oz * hx;
  return { dist: track.cum[best], lateral, px: p.x, pz: p.z, index: best };
}

export function gateAt(track, i) {
  const n = track.gates.length;
  return track.gates[((i % n) + n) % n];
}
