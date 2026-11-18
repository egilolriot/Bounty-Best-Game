// render.js — Aether Drift world visuals (worker 2)
// Three.js scene built from G.track: ribbon + glowing edges, canyon walls,
// rock spires, gate arches, boost pads, hover-craft meshes, starfield + sun.
// No network, no external textures: MeshStandardMaterial / MeshBasicMaterial
// colors only. Shadows OFF for perf; cheap enough for headless screenshots.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { G } from './state.js';
import { createRng } from './random.js';
import { trackPointAt } from './track.js';

let renderer = null;
let scene = null;
let camera = null;
let gateMeshes = [];
let gateMats = [];
let padMeshes = [];
let padMats = [];
let craftMeshes = new Map();

// Build one sleek low-poly hover craft, forward = +Z, so that
// mesh.rotation.y = heading points it along the tangent.
function makeCraftMesh(color) {
  const group = new THREE.Group();
  const accent = new THREE.Color(color);

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x222831,
    metalness: 0.7,
    roughness: 0.35,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.9,
    metalness: 0.4,
    roughness: 0.4,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x0d1117,
    metalness: 0.5,
    roughness: 0.6,
  });

  // Main hull: flattened, tapered box (nose toward +Z).
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 4.2), hullMat);
  hull.position.y = 0.55;
  group.add(hull);

  // Nose wedge.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.6, 4), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.scale.set(1, 1, 0.55);
  nose.position.set(0, 0.55, 2.8);
  group.add(nose);

  // Cockpit canopy.
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.4), accentMat);
  cockpit.position.set(0, 0.95, 0.5);
  group.add(cockpit);

  // Twin side pods.
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 2.6), darkMat);
    pod.position.set(side * 1.45, 0.45, -0.3);
    group.add(pod);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.5), accentMat);
    tip.position.set(side * 1.45, 0.45, 1.15);
    group.add(tip);
  }

  // Rear glow strip.
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.14, 0.22),
    new THREE.MeshBasicMaterial({ color }),
  );
  glow.position.set(0, 0.55, -2.15);
  group.add(glow);

  // Under-glow: flat translucent disc under the craft.
  const underGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 5.2),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  underGlow.rotation.x = -Math.PI / 2;
  underGlow.position.y = 0.06;
  group.add(underGlow);

  group.userData.accent = accent;
  return group;
}

// Flat ribbon strip following the centerline at a lateral offset.
// offset: lateral distance from centerline (left positive). width: strip width.
function makeStrip(track, offset, width, material) {
  const pts = track.points;
  const n = pts.length;
  const positions = new Float32Array((n + 1) * 2 * 3);
  const indices = [];
  for (let s = 0; s <= n; s++) {
    const i = s % n;
    const j = (i + 1) % n;
    const p = pts[i];
    const q = pts[j];
    const tx = q.x - p.x;
    const tz = q.z - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    // Left normal in (x, z): (tz, -tx) / len for forward (tx, tz).
    const nx = tz / tl;
    const nz = -tx / tl;
    const half = width / 2;
    const cx = p.x + nx * offset;
    const cz = p.z + nz * offset;
    positions.set([cx - nx * half, 0.02, cz - nz * half], s * 6);
    positions.set([cx + nx * half, 0.02, cz + nz * half], s * 6 + 3);
    if (s < n) {
      const a = s * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

export function initRender() {
  const container = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.colors.sky);
  scene.fog = new THREE.Fog(CONFIG.colors.fog, 60, 420);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);

  // Lights (no shadows).
  const hemi = new THREE.HemisphereLight(0x8fa8ff, 0x2a1a33, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4dc3ff, 0.35);
  fill.position.set(-100, 60, -120);
  scene.add(fill);

  const rng = createRng(CONFIG.seed);
  const track = G.track;
  const t = CONFIG.track;

  if (track) {
    // (a) Track ribbon + two glowing edge lines.
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.track,
      roughness: 0.85,
      metalness: 0.15,
    });
    scene.add(makeStrip(track, 0, t.width, ribbonMat));
    const edgeMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.trackEdge });
    scene.add(makeStrip(track, -t.width / 2 + 0.3, 0.6, edgeMat));
    scene.add(makeStrip(track, t.width / 2 - 0.3, 0.6, edgeMat));

    // (b) Canyon walls: rock boxes on both sides, varying height, rockTop caps.
    const rockMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.rock,
      roughness: 1.0,
      metalness: 0.0,
      flatShading: true,
    });
    const rockTopMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.rockTop,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: true,
    });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const step = 8; // every 8th sample (~20 m apart)
    for (let s = 0; s < track.points.length; s += step) {
      const i = s;
      const j = (i + 1) % track.points.length;
      const p = track.points[i];
      const q = track.points[j];
      const tx = q.x - p.x;
      const tz = q.z - p.z;
      const tl = Math.hypot(tx, tz) || 1;
      const nx = tz / tl;
      const nz = -tx / tl;
      const heading = Math.atan2(tx, tz);
      for (const side of [-1, 1]) {
        const h = t.wallHeight + (rng.next() - 0.5) * 18;
        const w = 9 + rng.next() * 9;
        const d = 7 + rng.next() * 7;
        const ox = p.x + nx * side * t.wallOffset;
        const oz = p.z + nz * side * t.wallOffset;
        const wall = new THREE.Mesh(boxGeo, rockMat);
        wall.scale.set(w, h, d);
        wall.position.set(ox, h / 2 - 1, oz);
        wall.rotation.y = heading + (rng.next() - 0.5) * 0.5;
        scene.add(wall);
        const cap = new THREE.Mesh(boxGeo, rockTopMat);
        cap.scale.set(w * 0.72, 2.2, d * 0.72);
        cap.position.set(ox, h - 1 + 1.1, oz);
        cap.rotation.y = wall.rotation.y;
        scene.add(cap);
      }
    }

    // Scattered rock spires inside the loop for depth (kept off the track).
    const spireGeo = new THREE.ConeGeometry(1, 1, 5);
    for (let k = 0; k < 60; k++) {
      const ang = rng.next() * Math.PI * 2;
      const rad = 30 + rng.next() * 130;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      // Keep spires clear of the racing line.
      let clear = true;
      for (let s = 0; s < track.points.length; s += 4) {
        const p = track.points[s];
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz < 30 * 30) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      const h = 12 + rng.next() * 34;
      const r = 4 + rng.next() * 7;
      const spire = new THREE.Mesh(spireGeo, rockMat);
      spire.scale.set(r, h, r);
      spire.position.set(x, h / 2 - 1, z);
      spire.rotation.y = rng.next() * Math.PI;
      scene.add(spire);
    }

    // (c) Gates: half-torus arches across the track. Own material each so
    // renderFrame can highlight the next gate independently.
    gateMeshes = [];
    gateMats = [];
    for (const gate of track.gates) {
      const mat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.gate,
        emissive: CONFIG.colors.gate,
        emissiveIntensity: 1.0,
        roughness: 0.4,
        metalness: 0.3,
      });
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(t.width / 2 + 1.5, 0.55, 8, 24, Math.PI),
        mat,
      );
      arch.position.set(gate.x, 0, gate.z);
      arch.rotation.y = gate.heading;
      scene.add(arch);
      // Base posts at both feet of the arch.
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), mat);
        const px = gate.x + Math.cos(gate.heading) * side * (t.width / 2 + 1.5);
        const pz = gate.z - Math.sin(gate.heading) * side * (t.width / 2 + 1.5);
        post.position.set(px, 1.1, pz);
        scene.add(post);
      }
      gateMeshes.push(arch);
      gateMats.push(mat);
    }

    // (d) Boost pads: flat emissive rectangles on the track.
    padMeshes = [];
    padMats = [];
    for (const pad of track.pads) {
      const mat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.pad,
        emissive: CONFIG.colors.pad,
        emissiveIntensity: 1.2,
        roughness: 0.5,
        metalness: 0.2,
      });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(t.width * 0.55, 4.5), mat);
      // Flat on the track, long axis aligned with the track direction.
      const padHeading = trackPointAt(track, pad.dist).heading;
      p.rotation.order = 'YXZ';
      p.rotation.y = padHeading;
      p.rotation.x = -Math.PI / 2;
      p.position.set(pad.x, 0.06, pad.z);
      scene.add(p);
      padMeshes.push(p);
      padMats.push(mat);
    }
  }

  // (e) Craft meshes: player + rivals, keyed by craft object.
  craftMeshes = new Map();
  if (G.player) {
    const mesh = makeCraftMesh(CONFIG.playerColor);
    scene.add(mesh);
    craftMeshes.set(G.player, mesh);
  }
  if (Array.isArray(G.rivals)) {
    for (const rival of G.rivals) {
      const mesh = makeCraftMesh(rival.color);
      scene.add(mesh);
      craftMeshes.set(rival, mesh);
    }
  }

  // Starfield.
  {
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const ang = rng.next() * Math.PI * 2;
      const el = rng.next() * Math.PI * 0.55 + 0.05;
      const r = 380 + rng.next() * 120;
      pos[i * 3] = Math.cos(ang) * Math.cos(el) * r;
      pos[i * 3 + 1] = Math.sin(el) * r;
      pos[i * 3 + 2] = Math.sin(ang) * Math.cos(el) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }),
    );
    scene.add(stars);
  }

  // Large low-poly sun/moon sphere in the sky.
  const skySun = new THREE.Mesh(
    new THREE.SphereGeometry(20, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  skySun.position.set(220, 130, -260);
  scene.add(skySun);

  window.addEventListener('resize', () => {
    if (!renderer || !camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

export function renderFrame(dt) {
  if (!renderer || !scene || !camera) return;
  const time = typeof G.time === 'number' ? G.time : 0;
  const player = G.player;

  if (player) {
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    if (G.shot === 'track') {
      // 3/4 aerial view: above and behind the player, looking down the track ahead,
      // so the circuit, the gates and the player's craft are all visible.
      camera.position.set(
        player.x - fx * 38,
        player.y + 26,
        player.z - fz * 38,
      );
      camera.lookAt(
        player.x + fx * 30,
        player.y,
        player.z + fz * 30,
      );
    } else if (G.camMode === 1) {
      // High camera above the track centre, looking at the player.
      camera.position.set(0, CONFIG.camera.highHeight, 0);
      camera.lookAt(player.x, player.y, player.z);
    } else {
      // Chase camera: behind the player, looking ahead.
      camera.position.set(
        player.x - fx * CONFIG.camera.chaseDist,
        player.y + CONFIG.camera.chaseHeight,
        player.z - fz * CONFIG.camera.chaseDist,
      );
      camera.lookAt(
        player.x + fx * CONFIG.camera.lookAhead,
        player.y,
        player.z + fz * CONFIG.camera.lookAhead,
      );
    }
  }

  // Boost FOV kick: widen the view while boosting so speed reads on screen.
  const targetFov = player && player.boosting ? 86 : 68;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6);
    camera.updateProjectionMatrix();
  }

  // Move each craft mesh to its state position / heading.
  for (const [craft, mesh] of craftMeshes) {
    mesh.position.set(craft.x, craft.y, craft.z);
    mesh.rotation.y = craft.heading;
  }
  // Bob the player mesh slightly.
  if (player && craftMeshes.has(player)) {
    const mesh = craftMeshes.get(player);
    mesh.position.y = player.y + Math.sin(time * 3) * 0.08;
  }

  // Pulse the next-gate mesh (gateNext color) and reset the others.
  for (let i = 0; i < gateMats.length; i++) {
    const isNext = i === G.nextGate;
    const mat = gateMats[i];
    const pulse = 1.0 + 0.7 * Math.sin(time * 4 + i);
    if (isNext) {
      mat.emissive.setHex(CONFIG.colors.gateNext);
      mat.color.setHex(CONFIG.colors.gateNext);
      mat.emissiveIntensity = 1.6 + 0.8 * Math.sin(time * 5);
    } else {
      mat.emissive.setHex(CONFIG.colors.gate);
      mat.color.setHex(CONFIG.colors.gate);
      mat.emissiveIntensity = pulse;
    }
  }

  // Pulse pad meshes.
  for (let i = 0; i < padMats.length; i++) {
    padMats[i].emissiveIntensity = 1.2 + 0.8 * Math.sin(time * 4 + i * 1.3);
  }

  renderer.render(scene, camera);
}
