// Aether Drift — deterministic random helpers.
// mulberry32 PRNG plus a string-to-uint32 hash, so track generation and
// rival behaviour are reproducible from CONFIG.seed (1337).
// No imports, no DOM, no network.

/**
 * Create a deterministic PRNG from a uint32 seed.
 * @param {number} seed - integer seed
 * @returns {{ next: () => number, range: (a: number, b: number) => number,
 *   int: (a: number, b: number) => number, pick: <T>(arr: T[]) => T }}
 */
export function createRng(seed) {
  let a = seed >>> 0;
  function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function range(min, max) {
    return min + next() * (max - min);
  }
  function int(min, max) {
    // Inclusive on both ends, matching the usual int(a, b) helper.
    return Math.floor(next() * (max - min + 1)) + min;
  }
  function pick(arr) {
    return arr[Math.floor(next() * arr.length)];
  }
  return { next, range, int, pick };
}

/**
 * Hash a string to a uint32 (FNV-1a). Stable across runs and platforms.
 * @param {string} str
 * @returns {number} unsigned 32-bit integer
 */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
