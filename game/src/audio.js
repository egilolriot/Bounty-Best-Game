// audio.js — WebAudio synth only, no audio files. Aether Drift.
// Everything is guarded: no audio in headless must never throw.
import { CONFIG } from './config.js';
import { G } from './state.js';

// CONFIG is part of this module's import contract (audio has no
// config-driven parameters yet); master gain is fixed at 0.5 per spec.
void CONFIG;

let audioCtx = null;
let masterGain = null;
let engineOsc = null;
let engineFilter = null;
let engineGain = null;
let muted = false;

export function initAudio() {
  try {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(audioCtx.destination);

    // Persistent engine hum: sawtooth osc -> lowpass -> gain -> master.
    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineFilter.Q.value = 1;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    engineOsc = audioCtx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start();
  } catch (e) {
    audioCtx = null;
    masterGain = null;
    engineOsc = null;
    engineFilter = null;
    engineGain = null;
  }
}

export function resumeAudio() {
  try {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    // Ignore: audio is non-essential.
  }
}

function clamp01(v) {
  if (typeof v !== 'number' || !isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function setEngine(speedNorm, boosting) {
  try {
    if (!audioCtx || !engineOsc || !engineFilter || !engineGain) return;
    const norm = clamp01(speedNorm);
    const silent = muted || (G && G.mode === 'menu');
    const freq = 60 + norm * 140 + (boosting ? 40 : 0);
    const gain = silent ? 0 : 0.03 + norm * 0.06;
    const t = audioCtx.currentTime;
    engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    engineFilter.frequency.setTargetAtTime(300 + norm * 900, t, 0.05);
    engineGain.gain.setTargetAtTime(gain, t, 0.08);
  } catch (e) {
    // Ignore: audio is non-essential.
  }
}

function tone(freq, dur, type, delay, vol) {
  try {
    if (!audioCtx || !masterGain || muted) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol !== undefined ? vol : 0.2, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch (e) {
    // Ignore: audio is non-essential.
  }
}

export function beep(final) {
  tone(final ? 990 : 660, 0.15, 'square', 0, 0.15);
}

export function chime() {
  tone(880, 0.12, 'sine', 0, 0.2);
  tone(1320, 0.18, 'sine', 0.12, 0.2);
}

export function fanfare() {
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.16, 0.2));
}

export function toggleMute() {
  muted = !muted;
  try {
    if (muted && audioCtx && engineGain) {
      engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
    }
  } catch (e) {
    // Ignore.
  }
  return muted;
}

export function isMuted() {
  return muted;
}
