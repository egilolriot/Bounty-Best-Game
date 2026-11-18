// Aether Drift — entry point, game loop and state machine.
// Wires the modules together: menu -> countdown -> race -> results -> restart.
// Lap/gate/position/finish logic lives here; physics lives in craft.js, AI in opponents.js.

import { CONFIG } from './config.js';
import { G, resetRace, resetAll } from './state.js';
import { loadBest, saveBest } from './save.js';
import { buildTrack, trackPointAt, closestOnTrack, gateAt } from './track.js';
import { resetPlayer, updatePlayer } from './craft.js';
import { resetRivals, updateRivals } from './opponents.js';
import { initRender, renderFrame } from './render.js';
import { initHud, showScreen, updateHud, drawMinimap, showCountdown, showResults, formatTime } from './hud.js';
import { initAudio, resumeAudio, setEngine, beep, chime, fanfare, toggleMute, isMuted } from './audio.js';
import { currentShot, applyShot } from './shots.js';

const track = buildTrack(CONFIG.seed);
G.track = track;
G.raceBest = loadBest();
resetAll(CONFIG.seed);
resetPlayer();
resetRivals();

initRender();
initHud();
initAudio();
updateMenuBest();
showScreen('menu');

// ---- shot presets (deterministic, for the screenshot run) ----
const shot = currentShot();
if (shot) {
  applyShot(shot);
  if (G.mode === 'results') {
    showResults(G.results || []);
    showScreen('results');
  } else {
    showScreen('race');
    updateHud();
    drawMinimap();
  }
  renderFrame(0);
}

function updateMenuBest() {
  const el = document.getElementById('menu-best');
  if (!el) return;
  const best = G.raceBest;
  if (best && best.total != null) {
    el.textContent = 'Best total: ' + formatTime(best.total) +
      (best.lap != null ? '  ·  Best lap: ' + formatTime(best.lap) : '');
  } else {
    el.textContent = 'No best time yet — set one!';
  }
}

function updateMuteButton() {
  const el = document.getElementById('muteBtn');
  if (el) el.textContent = isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
}

// ---- race flow ----
let lastCountShown = -1;
let prevProgress = 0;

function startRace() {
  resetRace(CONFIG.seed);
  resetPlayer();
  resetRivals();
  prevProgress = 0;
  lastCountShown = -1;
  G.mode = 'countdown';
  G.countdownT = 3;
  showScreen('countdown');
  showCountdown(3);
  resumeAudio();
}

function finishRace() {
  G.finished = true;
  G.finishTime = G.raceTime;
  if (G.bestLapTime == null || (G.lastLapTime != null && G.lastLapTime < G.bestLapTime)) {
    G.bestLapTime = G.lastLapTime;
  }
  // Standings: player finished; rivals get a projected finish time from their remaining distance.
  const entries = [];
  entries.push({ name: 'YOU', time: G.finishTime, isPlayer: true });
  for (const r of G.rivals) {
    const total = (r.lap - 1) * track.length + r.progress;
    const remaining = Math.max(0, CONFIG.laps * track.length - total);
    const projected = G.raceTime + remaining / Math.max(20, r.topSpeed);
    entries.push({ name: r.name, time: projected, isPlayer: false });
  }
  entries.sort((a, b) => a.time - b.time);
  G.results = entries;
  G.position = entries.findIndex(e => e.isPlayer) + 1;
  saveBest(G.finishTime, G.bestLapTime);
  G.raceBest = loadBest();
  G.mode = 'results';
  fanfare();
  setEngine(0, false);
  showResults(entries);
  showScreen('results');
  updateMenuBest();
}

function playerTotalDist() {
  return (G.lap - 1) * track.length + G.player.progress;
}

function updateRace(dt) {
  G.raceTime += dt;
  updatePlayer(dt);
  updateRivals(dt);

  // Gates: progress-based (generous arcade rule — driving the line passes the gates).
  const p = G.player.progress;
  if (p < prevProgress - track.length / 2) {
    // Wrapped past the start line: a lap is complete.
    const lapTime = G.raceTime - G.lapStartTime;
    G.lastLapTime = lapTime;
    if (G.bestLapTime == null || lapTime < G.bestLapTime) G.bestLapTime = lapTime;
    G.lap += 1;
    G.lapStartTime = G.raceTime;
    G.nextGate = 1;
    if (G.lap > CONFIG.laps) {
      finishRace();
      prevProgress = p;
      return;
    }
    chime();
  } else if (G.nextGate < CONFIG.gates && p >= gateAt(track, G.nextGate).dist - 1) {
    G.nextGate += 1;
    chime();
  }
  prevProgress = p;

  // Position by total distance covered.
  const myTotal = playerTotalDist();
  let pos = 1;
  for (const r of G.rivals) {
    const rTotal = (r.lap - 1) * track.length + r.progress;
    if (rTotal > myTotal) pos += 1;
  }
  G.position = pos;

  setEngine(Math.min(1, Math.abs(G.player.speed) / CONFIG.craft.boostSpeed), G.player.boosting);
  updateHud();
  drawMinimap();
}

function updateCountdown(dt) {
  G.countdownT -= dt;
  const n = Math.ceil(G.countdownT);
  if (n !== lastCountShown && n >= 0) {
    lastCountShown = n;
    if (n > 0) {
      showCountdown(n);
      beep(false);
    }
  }
  if (G.countdownT <= 0) {
    G.mode = 'race';
    G.raceTime = 0;
    G.lapStartTime = 0;
    prevProgress = 0;
    showCountdown(0);
    beep(true);
    showScreen('race');
    updateHud();
    drawMinimap();
  }
}

// ---- input ----
function isKey(code, list) { return list.indexOf(code) !== -1; }

window.addEventListener('keydown', (e) => {
  resumeAudio();
  const c = e.code;
  if (isKey(c, CONFIG.keys.up)) G.input.up = true;
  if (isKey(c, CONFIG.keys.down)) G.input.down = true;
  if (isKey(c, CONFIG.keys.left)) G.input.left = true;
  if (isKey(c, CONFIG.keys.right)) G.input.right = true;
  if (isKey(c, CONFIG.keys.boost)) G.input.boost = true;
  if (isKey(c, CONFIG.keys.camera) && !e.repeat) {
    G.camMode = G.camMode === 0 ? 1 : 0;
  }
  if (isKey(c, CONFIG.keys.mute) && !e.repeat) {
    toggleMute();
    updateMuteButton();
  }
  if (isKey(c, CONFIG.keys.restart) && !e.repeat) {
    if (G.mode === 'race' || G.mode === 'results' || G.mode === 'countdown') startRace();
  }
  if (isKey(c, CONFIG.keys.start) && !e.repeat) {
    if (G.mode === 'menu' || G.mode === 'results') startRace();
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(c) !== -1) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  const c = e.code;
  if (isKey(c, CONFIG.keys.up)) G.input.up = false;
  if (isKey(c, CONFIG.keys.down)) G.input.down = false;
  if (isKey(c, CONFIG.keys.left)) G.input.left = false;
  if (isKey(c, CONFIG.keys.right)) G.input.right = false;
  if (isKey(c, CONFIG.keys.boost)) G.input.boost = false;
});

window.addEventListener('aether-start', () => { if (G.mode === 'menu' || G.mode === 'results') startRace(); });
window.addEventListener('aether-restart', () => { startRace(); });
window.addEventListener('aether-mute', () => { toggleMute(); updateMuteButton(); });
window.addEventListener('click', () => resumeAudio(), { once: true });

// ---- main loop ----
let lastT = performance.now();
function step(dt) {
  G.time += dt;
  if (G.mode === 'countdown') updateCountdown(dt);
  else if (G.mode === 'race') updateRace(dt);
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  step(dt);
  renderFrame(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for the smoke test / screenshot harness.
window.__game = { G, CONFIG, track, startRace, finishRace, formatTime, step };
