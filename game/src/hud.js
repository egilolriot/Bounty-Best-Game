// hud.js — HUD, screens, minimap and results for Aether Drift.
// No three.js here: only DOM + canvas 2D. Deterministic seed 1337.
import { CONFIG } from './config.js';
import { G } from './state.js';

function $(id) {
  return document.getElementById(id);
}

export function formatTime(s) {
  if (typeof s !== 'number' || !isFinite(s) || s < 0) return '0:00.0';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m + ':' + sec.toFixed(1).padStart(4, '0');
}

function ordinal(n) {
  const v = Math.round(n);
  if (v === 1) return '1st';
  if (v === 2) return '2nd';
  if (v === 3) return '3rd';
  return v + 'th';
}

const SCREENS = {
  menu: 'menu',
  countdown: 'countdown',
  race: 'hud',
  results: 'results',
};

const STATUS_TEXT = {
  menu: 'Menu',
  countdown: 'Countdown',
  race: 'Racing',
  results: 'Results',
};

export function initHud() {
  const startBtn = $('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('aether-start'));
    });
  }
  const restartBtn = $('restartBtn');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('aether-restart'));
    });
  }
  const muteBtn = $('muteBtn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('aether-mute'));
    });
  }
  // Best-time line on the menu, when a best race time is known.
  const menuBest = $('menu-best');
  if (menuBest && G && isFinite(G.raceBest) && G.raceBest > 0) {
    menuBest.textContent = 'Best: ' + formatTime(G.raceBest);
  }
}

export function showScreen(name) {
  // Hide all four screens, then show exactly one by ADDING the 'on' class.
  // CSS hides #hud until it has class 'on', so inline display alone is not
  // enough (shot presets bypass the start flow).
  for (const key of Object.keys(SCREENS)) {
    const el = $(SCREENS[key]);
    if (el) el.classList.remove('on');
  }
  const target = SCREENS[name];
  if (target) {
    const el = $(target);
    if (el) el.classList.add('on');
  }
  const status = $('status');
  if (status) status.textContent = STATUS_TEXT[name] || name || '';
}

export function updateHud() {
  const hud = $('hud');
  if (!hud || !hud.classList.contains('on')) return;
  try {
    const speedEl = $('hud-speed');
    if (speedEl) {
      speedEl.textContent = Math.round(Math.abs(G.player.speed) * 3.6) + ' km/h';
    }
    const lapEl = $('hud-lap');
    if (lapEl) {
      lapEl.textContent = 'LAP ' + G.lap + '/' + (G.laps || CONFIG.laps);
    }
    const timeEl = $('hud-time');
    if (timeEl) {
      timeEl.textContent = formatTime(G.raceTime);
    }
    const cpEl = $('hud-checkpoint');
    if (cpEl) {
      cpEl.textContent = 'GATE ' + (G.nextGate + 1) + '/' + CONFIG.gates;
    }
    const posEl = $('hud-position');
    if (posEl) {
      posEl.textContent = ordinal(G.position);
    }
    const boostEl = $('hud-boost-fill');
    if (boostEl) {
      const b = Math.max(0, Math.min(1, G.player.boost || 0));
      boostEl.style.width = b * 100 + '%';
    }
    const lapInfoEl = $('hud-lapinfo');
    if (lapInfoEl) {
      const parts = [];
      if (G.lastLapTime) parts.push('Last ' + formatTime(G.lastLapTime));
      if (G.bestLapTime) parts.push('Best ' + formatTime(G.bestLapTime));
      lapInfoEl.textContent = parts.join('   ');
    }
  } catch (e) {
    // HUD refresh must never break the game loop.
  }
}

function pointX(p) {
  return p.x !== undefined ? p.x : p[0];
}

function pointZ(p) {
  if (p.z !== undefined) return p.z;
  return p.length > 2 ? p[2] : p[1];
}

export function drawMinimap() {
  const canvas = $('minimap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width || 180;
  const H = canvas.height || 180;
  ctx.clearRect(0, 0, W, H);
  const track = G.track;
  if (!track || !track.points || track.points.length === 0) return;

  // NORMALIZE the bounds keys: accept minX/maxX/minZ/maxZ or x0/x1/z0/z1.
  // Reading minX when the object used x0 once left a minimap blank.
  const b = track.bounds || {};
  const minX = b.minX !== undefined ? b.minX : b.x0;
  const maxX = b.maxX !== undefined ? b.maxX : b.x1;
  const minZ = b.minZ !== undefined ? b.minZ : b.z0;
  const maxZ = b.maxZ !== undefined ? b.maxZ : b.z1;
  if (minX === undefined || maxX === undefined || minZ === undefined || maxZ === undefined) return;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX <= 0 || spanZ <= 0) return;

  const pad = 10;
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanZ);
  const offX = pad + ((W - pad * 2) - spanX * scale) / 2;
  const offY = pad + ((H - pad * 2) - spanZ * scale) / 2;
  const sx = (x) => offX + (x - minX) * scale;
  const sy = (z) => offY + (z - minZ) * scale;

  // Track loop.
  ctx.beginPath();
  track.points.forEach((p, i) => {
    const x = sx(pointX(p));
    const y = sy(pointZ(p));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = '#2de2ff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gates as small ticks (next gate highlighted amber).
  if (track.gates) {
    track.gates.forEach((g, i) => {
      ctx.fillStyle = i === G.nextGate ? '#ffc247' : '#2de2ff';
      ctx.fillRect(sx(g.x) - 2, sy(g.z) - 2, 4, 4);
    });
  }

  // Boost pads as green dots.
  if (track.pads) {
    ctx.fillStyle = '#37e0a0';
    track.pads.forEach((p) => {
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Rivals as coloured dots.
  if (G.rivals) {
    G.rivals.forEach((r) => {
      const c = typeof r.color === 'number'
        ? '#' + r.color.toString(16).padStart(6, '0')
        : (r.color || '#ff5555');
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(sx(r.x), sy(r.z), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Player as a white dot with a ring.
  if (G.player) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx(G.player.x), sy(G.player.z), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx(G.player.x), sy(G.player.z), 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function showCountdown(n) {
  const el = $('countText');
  if (el) el.textContent = n === 0 ? 'GO!' : String(n);
}

export function showResults(results) {
  const rows = Array.isArray(results) ? results : (G.results || []);
  const table = $('results-table');
  if (table) {
    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }
    tbody.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (r.isPlayer) tr.classList.add('player', 'player-row');
      const pos = document.createElement('td');
      pos.textContent = ordinal(i + 1);
      const name = document.createElement('td');
      name.textContent = r.name;
      const time = document.createElement('td');
      time.textContent = formatTime(r.time);
      tr.appendChild(pos);
      tr.appendChild(name);
      tr.appendChild(time);
      tbody.appendChild(tr);
    });
  }
  const title = $('results-title');
  if (title) {
    title.textContent = rows.length > 0 && rows[0].isPlayer ? 'FINISH!' : 'RACE COMPLETE';
  }
  const timeEl = $('results-time');
  if (timeEl) {
    let text = 'Total ' + formatTime(G.finishTime);
    if (G.bestLapTime) text += '   Best lap ' + formatTime(G.bestLapTime);
    timeEl.textContent = text;
  }
}
