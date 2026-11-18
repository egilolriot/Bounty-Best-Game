// Aether Drift — best-time persistence (localStorage only).
// Stores the better (smaller) total race time and best lap time.
// All access is wrapped in try/catch: localStorage may be unavailable
// (private mode, disabled storage, non-browser harness).
// No imports, no network, no other DOM access.

export const SAVE_KEY = 'aether-drift-best-v1';

/**
 * Load the stored best times.
 * @returns {{ total: number|null, lap: number|null }}
 */
export function loadBest() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { total: null, lap: null };
    const data = JSON.parse(raw);
    const total = typeof data.total === 'number' && Number.isFinite(data.total)
      ? data.total
      : null;
    const lap = typeof data.lap === 'number' && Number.isFinite(data.lap)
      ? data.lap
      : null;
    return { total, lap };
  } catch (_err) {
    return { total: null, lap: null };
  }
}

/**
 * Store the better of the stored and given times (smaller wins).
 * Null / non-finite arguments leave that slot unchanged.
 * @param {number|null} total - total race time in seconds
 * @param {number|null} lap - best lap time in seconds
 */
export function saveBest(total, lap) {
  try {
    const best = loadBest();
    if (typeof total === 'number' && Number.isFinite(total)) {
      if (best.total === null || total < best.total) best.total = total;
    }
    if (typeof lap === 'number' && Number.isFinite(lap)) {
      if (best.lap === null || lap < best.lap) best.lap = lap;
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(best));
  } catch (_err) {
    // Storage unavailable — best times are simply not persisted.
  }
}
