# Aether Drift

An original 3D anti-gravity racing game for the make.fun best-game-01 bounty.

Pilot a hover-craft through a neon canyon circuit. 3 laps, 8 gates per lap, boost pads,
3 AI rival pilots (VEX, ION, NOVA) with rubber-band pacing, live position, lap timer and
best-lap tracking. Win by finishing first.

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network — every
file is served from `game/` (three.js is vendored under `game/vendor/`).

## Controls

- W / Up — accelerate
- S / Down — brake / reverse
- A / D or Left / Right — steer
- Shift — boost (drains the boost meter; refill it on the green boost pads)
- C — camera (chase / high)
- M — mute
- R — restart
- Enter — start

## Shots

`shots.json` lists the 4 screenshots (`?shot=race|track|boost|results&seed=1337`):
1-race.jpg (cover), 2-track.jpg, 3-boost.jpg, 4-results.jpg.

## Entry

- Owner: egilolriot — repo Bounty-Best-Game
- Referral: https://make.fun/r/zegsd6t5
- Built with three.js 0.170.0 (vendored) and WebAudio synthesis (no audio files).
