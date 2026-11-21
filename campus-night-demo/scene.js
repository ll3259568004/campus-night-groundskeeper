import * as THREE from 'three';
import { gardener, lampPost, littleMonster, powerBox } from './models.js';
import { addCampus, paverTexture } from './campus.js';
import { entrances, routeSigns } from './field-map.js';

const YAW = .53;
const SIN = Math.sin(YAW);
const COS = Math.cos(YAW);
const CAMERA_DISTANCE = 35;
const PITCH = Math.PI * .292;
const MAX_PARTICLES = 220;
const PALETTE = ['#656e69', '#6b7470', '#68736f', '#6d746d', '#626e69'];
const CUT_COLOR = new THREE.Color('#777e80');
const LIVE_COLOR = new THREE.Color('#838969');
const GOLD = new THREE.Color('#ffce88');
const DULL = new THREE.Color('#8e9d94');
const ATTACK = new THREE.Color('#ffdc8e');
const DARK = new THREE.Color('#070e1e');
const NO_THREATS = [];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function fieldDirection(x, y) {
  return { x: x * COS + y * SIN, y: y * COS - x * SIN };
}

function makeGrass() {
  const positions = [];
  const colors = [];
  const shades = ['#496744', '#608554', '#86a260', '#9cac67', '#547c4f'].map((hex) => new THREE.Color(hex));
  const tuft = (x, z, phase) => {
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.39 + phase;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const width = .048 + (i % 4) * .013;
      const height = .30 + (i % 5) * .046;
      const px = x + dx * .043 * (i % 3);
      const pz = z + dz * .043 * (i % 3);
      const a = [px - dz * width, 0, pz + dx * width];
      const b = [px + dz * width, .012, pz - dx * width];
      const c = [px + dx * .076, height * .63, pz + dz * .076];
      const d = [px + dx * (.14 + i % 3 * .026), height, pz + dz * (.14 + i % 3 * .026)];
      const ridge = [c[0] - dz * width * .55, c[1] * .88, c[2] + dx * width * .55];
      positions.push(...a, ...b, ...c, ...a, ...c, ...ridge, ...ridge, ...c, ...d);
      for (const shade of [i, i + 1, i + 2, i + 1, i + 2, i + 2, i + 3, i + 2, i + 3]) {
        colors.push(...shades[shade % shades.length].toArray());
      }
    }
  };
  tuft(-.19, -.14, 0);
  tuft(.17, .13, 1.6);
  tuft(-.21, .22, 2.1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function glowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - 31.5, y - 31.5) / 31.5;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function floorSpot(texture, color, size, opacity, light = false) {
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
    color, opacity, blending: light ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = light ? .018 : .04;
  return mesh;
}

function statusText(host, className, text) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  host.append(element);
  return element;
}

export function createScene({ canvas, labels, target, tiles, generator, lamps, cols, rows, size, footstepDelay }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(DARK, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-19, 19, 11, -11, .1, 135);
  const ambient = new THREE.HemisphereLight('#c3d2e2', '#525162', 1.46);
  const moon = new THREE.DirectionalLight('#dcdfe8', 2.55);
  moon.position.set(-10, 18, 12);
  moon.castShadow = true;
  Object.assign(moon.shadow.camera, { left: -22, right: 22, top: 17, bottom: -17, near: 1, far: 59 });
  const shadowSize = matchMedia('(max-width: 600px)').matches ? 768 : 1536;
  moon.shadow.mapSize.set(shadowSize, shadowSize);
  moon.shadow.normalBias = .022;
  moon.shadow.bias = -.00015;
  moon.shadow.radius = 2.4;
  scene.add(ambient, moon);
  const paving = paverTexture();
  addCampus(scene, cols, rows, paving);

  const matrix = new THREE.Object3D();
  const tint = new THREE.Color();
  const projected = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const center = new THREE.Vector3();
  const tileX = (tile) => tile.x / size - cols / 2;
  const tileZ = (tile) => tile.y / size - rows / 2;
  const partitions = tiles.filter((tile) => tile.col === 14 || tile.col === 22);
  const fenceParts = [
    { mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(.96, .063, 1),
      new THREE.MeshStandardMaterial({ color: '#3a4b55', roughness: .9 }), partitions.length), y: .035 },
    { mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(.12, 1.02, .12),
      new THREE.MeshStandardMaterial({ color: '#303e51', roughness: .82 }), partitions.length), y: .53 },
    ...[.27, .49, .74, .91].map((y) => ({ mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(.075, .065, 1),
      new THREE.MeshStandardMaterial({ color: y === .91 ? '#a3a683' : '#526673', roughness: .8 }), partitions.length), y })),
  ];
  for (const { mesh } of fenceParts) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    scene.add(mesh);
  }
  function ring(color, inner, outer) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .83, depthWrite: false }));
    scene.add(mesh);
    return mesh;
  }
  const signs = routeSigns.map((route) => {
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(.85, .11).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#abc8cb', transparent: true, opacity: .65, depthWrite: false }));
    mark.position.set(tileX(route), .037, tileZ(route));
    scene.add(mark);
    return { route, mark, tag: statusText(labels, 'map-tag route-tag', route.label) };
  });
  const beaconViews = Object.values(entrances).map((entry) => {
    const mark = ring('#ffa882', .63, .70);
    mark.position.set(tileX(entry), .063, tileZ(entry));
    return { entry, mark, tag: statusText(labels, 'map-tag warning-tag', entry.label) };
  });
  const breakRing = ring('#ffb082', .49, .57);
  const breakTag = statusText(labels, 'map-tag warning-tag', '断点');
  const traceMaterial = new THREE.MeshBasicMaterial({ color: '#ff9c60', toneMapped: false,
    transparent: true, opacity: .94, depthWrite: false });
  const raidTrace = new THREE.InstancedMesh(new THREE.BoxGeometry(.27, .018, .075), traceMaterial, tiles.length * 8);
  raidTrace.count = 0;
  raidTrace.frustumCulled = false;
  raidTrace.renderOrder = 2;
  scene.add(raidTrace);
  const raidMarkers = Array.from({ length: 2 }, () => ({
    ring: ring('#ff9b62', .5, .61),
    tag: statusText(labels, 'map-tag warning-tag', '袭线点'),
  }));
  const edgeWarnings = Array.from({ length: 2 }, () => {
    const guide = target.cloneNode(true);
    guide.removeAttribute('id');
    guide.classList.add('is-warning');
    labels.append(guide);
    return guide;
  });
  const footprint = new THREE.BoxGeometry(.999, .036, .999);
  const turf = new THREE.InstancedMesh(footprint, new THREE.MeshStandardMaterial({ map: paving, roughness: .94 }), tiles.length);
  turf.receiveShadow = true;
  scene.add(turf);
  const grass = new THREE.InstancedMesh(makeGrass(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), tiles.length);
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.castShadow = true;
  scene.add(grass);

  const wires = [];
  for (const tile of tiles) {
    for (const i of tile.neighbors) {
      if (i <= tile.index) continue;
      const neighbor = tiles[i];
      wires.push({ a: tile, b: neighbor, angle: neighbor.row === tile.row ? 0 : Math.PI / 2 });
    }
  }
  const channelMat = new THREE.MeshBasicMaterial({ color: '#d9eb8a', toneMapped: false });
  const channelMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .016, .045), channelMat, wires.length);
  channelMesh.count = 0;
  channelMesh.frustumCulled = false;
  const terminalMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.064, .064, .019, 8), channelMat, tiles.length);
  terminalMesh.count = 0;
  terminalMesh.frustumCulled = false;
  scene.add(channelMesh, terminalMesh);

  const warningGeometry = new THREE.BufferGeometry();
  warningGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 4 * 3 * 2 * 3), 3));
  const warning = new THREE.LineSegments(warningGeometry, new THREE.LineBasicMaterial({ color: '#ffad6c', transparent: true }));
  warning.frustumCulled = false;
  warning.visible = false;
  scene.add(warning);
  const warningTiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(.915, .915).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#fa9850', transparent: true, opacity: .30, depthWrite: false }), 5);
  warningTiles.frustumCulled = false;
  warningTiles.count = 0;
  scene.add(warningTiles);

  const sproutLeaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5),
    new THREE.MeshStandardMaterial({ color: '#b5d95d', emissive: '#7d9b36', emissiveIntensity: .32, roughness: .83 }), tiles.length * 2);
  const sproutRings = new THREE.InstancedMesh(new THREE.RingGeometry(.19, .218, 14).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#c4da70', transparent: true, opacity: .84, depthWrite: false }), tiles.length);
  sproutLeaves.frustumCulled = sproutRings.frustumCulled = false;
  sproutLeaves.count = sproutRings.count = 0;
  scene.add(sproutLeaves, sproutRings);

  const glow = glowTexture();
  const source = powerBox();
  source.position.set(tileX(generator), 0, tileZ(generator));
  source.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = true; });
  scene.add(source);
  const sourceGlow = floorSpot(glow, '#8dfaaf', 3.8, .8, true);
  sourceGlow.position.x = source.position.x;
  sourceGlow.position.y = .048;
  sourceGlow.position.z = source.position.z;
  scene.add(sourceGlow);
  const sourceTag = statusText(labels, 'map-tag source-tag', '配电箱');

  const posts = lamps.map((lamp, i) => {
    const post = lampPost();
    post.root.position.set(tileX(lamp), 0, tileZ(lamp));
    post.root.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = true; });
    const pool = floorSpot(glow, '#ffad53', 6.7, .77, true);
    pool.position.set(post.root.position.x, .052, post.root.position.z + .25);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffbd68', transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: .68 }));
    halo.position.set(post.root.position.x, 1.46, post.root.position.z + .29);
    halo.scale.set(2.1, 2.1, 1);
    const light = new THREE.PointLight('#ffb974', 0, 6, 1.8);
    light.position.set(post.root.position.x, 1.37, post.root.position.z + .27);
    const marker = new THREE.Mesh(new THREE.RingGeometry(.58, .65, 32), new THREE.MeshBasicMaterial({ color: '#d6efa9',
      transparent: true, opacity: .8, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(post.root.position.x, .04, post.root.position.z);
    const tag = statusText(labels, 'map-tag', '0' + (i + 1));
    scene.add(post.root, halo, pool, light, marker);
    return { ...post, pool, halo, light, marker, tag };
  });

  const hero = gardener();
  hero.root.traverse((mesh) => { if (mesh.isMesh) mesh.castShadow = true; });
  scene.add(hero.root);
  const heroShadow = floorSpot(glow, '#071123', 1.6, .9);
  scene.add(heroShadow);

  const monsterViews = new Map();
  const free = { normal: [], weed: [], boss: [] };
  const motes = new THREE.InstancedMesh(new THREE.BoxGeometry(.05, .05, .066), new THREE.MeshBasicMaterial(), MAX_PARTICLES);
  motes.frustumCulled = false;
  motes.count = 0;
  scene.add(motes);
  const shot = new THREE.Mesh(new THREE.CylinderGeometry(.041, .016, 1, 6), new THREE.MeshBasicMaterial({ color: ATTACK }));
  shot.visible = false;
  scene.add(shot);
  const shotAxis = new THREE.Vector3(0, 1, 0);
  const shotDelta = new THREE.Vector3();

  const surfaces = tiles.map((tile) => ({ cut: null, live: false, size: 1, start: 0, showAt: 0, turf: -1, seed: tile.seed }));
  let runIdentity;
  let revision;
  let lastWarning;
  let frameW = 0;
  let frameH = 0;
  let cameraWidth = 0;
  let partitionsAt = -1;
  let lastRaidPaths;
  let lastRaidMask = '';

  function positionLabel(element, x, y, z, visible) {
    projected.set(x, y, z).project(camera);
    const within = Math.abs(projected.x) <= .94 && Math.abs(projected.y) <= .89;
    element.hidden = !within || !visible;
    if (!element.hidden) {
      element.style.transform = `translate3d(${(projected.x * .5 + .5) * frameW}px,${(.5 - projected.y * .5) * frameH}px,0) translate(-50%, -50%)`;
    }
    return within;
  }

  function moveCamera(state, dt) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;
    const layoutChanged = width !== frameW || height !== frameH;
    if (layoutChanged) {
      frameW = width;
      frameH = height;
      renderer.setPixelRatio(Math.min(devicePixelRatio, width < 680 ? 1.45 : 1.7));
      renderer.setSize(width, height, false);
    }
    const aspect = width / height;
    const compact = width < 600;
    const intro = state.run.mode === 'intro';
    const nextWidth = intro ? (compact ? 15 : 19.9) : compact ? 12.3 : 17.4;
    if (layoutChanged || nextWidth !== cameraWidth) {
      cameraWidth = nextWidth;
      camera.left = -cameraWidth / 2;
      camera.right = cameraWidth / 2;
      camera.top = cameraWidth / aspect / 2;
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix();
    }
    desired.set(intro ? 1.55 : tileX(state.player), 0, intro ? -6.2 : tileZ(state.player));
    center.lerp(desired, runIdentity !== state.run ? 1 : 1 - Math.exp(-dt * 7));
    camera.position.set(center.x + SIN * Math.cos(PITCH) * CAMERA_DISTANCE,
      Math.sin(PITCH) * CAMERA_DISTANCE, center.z + COS * Math.cos(PITCH) * CAMERA_DISTANCE);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    return true;
  }

  function syncBoard(run, now) {
    const fresh = run !== runIdentity;
    const access = run.mode === 'intro' ? 2 : run.stage;
    if (access !== partitionsAt) {
      let count = 0;
      for (const tile of partitions) {
        if (tile.opens <= access) continue;
        for (const { mesh, y } of fenceParts) {
          matrix.position.set(tileX(tile), y, tileZ(tile));
          matrix.rotation.set(0, 0, 0);
          matrix.scale.setScalar(1);
          matrix.updateMatrix();
          mesh.setMatrixAt(count, matrix.matrix);
        }
        count++;
      }
      for (const { mesh } of fenceParts) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
      }
      partitionsAt = access;
    }
    if (fresh || run.terrainVersion !== revision) {
      for (const tile of tiles) {
        const surface = surfaces[tile.index];
        if (fresh || tile.cut !== surface.cut) {
          surface.cut = tile.cut;
          surface.start = fresh ? now - 1 : now;
        }
        if (fresh || tile.live !== surface.live) {
          surface.live = tile.live;
          surface.showAt = tile.live && !fresh ? now + Math.min(.48, tile.hops * .015) : now;
        }
      }
      runIdentity = run;
      revision = run.terrainVersion;
    }
    let grassMoved = false;
    let turfChanged = false;
    let visibleNodes = 0;
    for (const tile of tiles) {
      const surface = surfaces[tile.index];
      const tileScale = surface.cut || (partitions.includes(tile) && tile.opens > access) ? 0 :
        .18 + .82 * clamp((now - surface.start) / .43, 0, 1);
      if (fresh || tileScale !== surface.size) {
        surface.size = tileScale;
        matrix.position.set(tileX(tile), .023, tileZ(tile));
        matrix.rotation.set(0, surface.seed * Math.PI * 2, 0);
        const spread = .82 + surface.seed * .28;
        matrix.scale.set(tileScale ? spread : .0001, tileScale ? tileScale * (.78 + surface.seed * .63) : .0001, tileScale ? spread : .0001);
        matrix.updateMatrix();
        grass.setMatrixAt(tile.index, matrix.matrix);
        grassMoved = true;
      }
      surface.displayedPower = surface.live && surface.showAt <= now;
      const appearance = surface.displayedPower ? 2 : surface.cut ? 1 : 0;
      if (appearance !== surface.turf) {
        matrix.position.set(tileX(tile), .004, tileZ(tile));
        matrix.rotation.set(0, 0, 0);
        matrix.scale.setScalar(1);
        matrix.updateMatrix();
        turf.setMatrixAt(tile.index, matrix.matrix);
        tint.set(PALETTE[Math.floor(tile.seed * PALETTE.length)]);
        if (appearance > 0) tint.lerp(appearance === 2 ? LIVE_COLOR : CUT_COLOR, appearance === 2 ? .79 : .73);
        turf.setColorAt(tile.index, tint);
        surface.turf = appearance;
        turfChanged = true;
      }
      if (surface.displayedPower) {
        matrix.position.set(tileX(tile), .035, tileZ(tile));
        matrix.rotation.set(0, 0, 0);
        matrix.scale.setScalar(1);
        matrix.updateMatrix();
        terminalMesh.setMatrixAt(visibleNodes++, matrix.matrix);
      }
    }
    if (grassMoved) grass.instanceMatrix.needsUpdate = true;
    if (turfChanged) {
      turf.instanceMatrix.needsUpdate = true;
      turf.instanceColor.needsUpdate = true;
    }
    if (!turfChanged && !fresh) return;
    terminalMesh.count = visibleNodes;
    terminalMesh.instanceMatrix.needsUpdate = true;
    let visibleLinks = 0;
    for (const { a, b, angle } of wires) {
      if (!surfaces[a.index].displayedPower || !surfaces[b.index].displayedPower) continue;
      matrix.position.set((tileX(a) + tileX(b)) * .5, .035, (tileZ(a) + tileZ(b)) * .5);
      matrix.rotation.set(0, angle, 0);
      matrix.scale.setScalar(1);
      matrix.updateMatrix();
      channelMesh.setMatrixAt(visibleLinks++, matrix.matrix);
    }
    channelMesh.count = visibleLinks;
    channelMesh.instanceMatrix.needsUpdate = true;
  }

  function showWarning(regrow, time) {
    warning.visible = Boolean(regrow);
    if (regrow !== lastWarning) {
      const positions = warningGeometry.attributes.position.array;
      let cursor = 0;
      const indices = regrow?.targets ?? [];
      indices.forEach((index, slot) => {
        const tile = tiles[index];
        const x = tileX(tile);
        const z = tileZ(tile);
        matrix.position.set(x, .058, z);
        matrix.rotation.set(0, 0, 0);
        matrix.scale.setScalar(1);
        matrix.updateMatrix();
        warningTiles.setMatrixAt(slot, matrix.matrix);
        const corners = [[x - .46, z - .46], [x + .46, z - .46], [x + .46, z + .46], [x - .46, z + .46]];
        corners.forEach(([x1, z1], side) => {
          const [x2, z2] = corners[(side + 1) % 4];
          for (const phase of [0, 1 / 3, 2 / 3]) {
            const end = phase + .19;
            positions.set([THREE.MathUtils.lerp(x1, x2, phase), .081, THREE.MathUtils.lerp(z1, z2, phase),
              THREE.MathUtils.lerp(x1, x2, end), .081, THREE.MathUtils.lerp(z1, z2, end)], cursor);
            cursor += 6;
          }
        });
      });
      warningGeometry.setDrawRange(0, cursor / 3);
      warningGeometry.attributes.position.needsUpdate = true;
      warningTiles.count = indices.length;
      warningTiles.instanceMatrix.needsUpdate = true;
      lastWarning = regrow;
    }
    const pulse = .5 + Math.sin(time * 16) * .5;
    warning.material.opacity = .65 + pulse * .35;
    warningTiles.material.opacity = .15 + pulse * .29;
  }

  function showFootsteps(run) {
    let count = 0;
    for (const [index, due] of run.footsteps) {
      const tile = tiles[index];
      const x = tileX(tile);
      const z = tileZ(tile);
      const size = .62 + .38 * clamp(1 - (due - run.time) / footstepDelay, 0, 1);
      matrix.position.set(x, .042, z);
      matrix.rotation.set(0, 0, 0);
      matrix.scale.setScalar(1);
      matrix.updateMatrix();
      sproutRings.setMatrixAt(count, matrix.matrix);
      for (const side of [-1, 1]) {
        matrix.position.set(x + side * .052 * size, .058 + size * .112, z);
        matrix.rotation.set(.09, tile.seed, side * -.61);
        matrix.scale.set(.056 * size, .148 * size, .038 * size);
        matrix.updateMatrix();
        sproutLeaves.setMatrixAt(count * 2 + Number(side === 1), matrix.matrix);
      }
      count++;
    }
    sproutRings.count = count;
    sproutLeaves.count = count * 2;
    if (count) {
      sproutRings.instanceMatrix.needsUpdate = true;
      sproutLeaves.instanceMatrix.needsUpdate = true;
    }
  }

  function edgeGuide(element, objective, label) {
    if (objective) projected.set(tileX(objective), .9, tileZ(objective)).project(camera);
    element.hidden = !objective || (Math.abs(projected.x) <= .94 && Math.abs(projected.y) <= .89);
    if (element.hidden) return;
    const angle = Math.atan2(projected.x * frameW, projected.y * frameH);
    const fit = .84 / Math.max(.84, Math.abs(projected.x), Math.abs(projected.y));
    const left = clamp((projected.x * fit * .5 + .5) * frameW, 67, frameW - 67);
    const top = clamp((.5 - projected.y * fit * .5) * frameH, 59, frameH - 39);
    element.style.transform = `translate3d(${left}px,${top}px,0) translate(-50%, -50%)`;
    element.firstElementChild.style.transform = `rotate(${angle}rad)`;
    element.lastElementChild.textContent = label;
  }

  function visibleThreats(run) {
    return run.raid?.state === 'warning' || run.raid?.state === 'active' ? run.raid.plans : NO_THREATS;
  }

  function showRaid(run) {
    const paths = visibleThreats(run);
    const mask = paths.map((plan) => plan.done ? '0' : '1').join('');
    if (paths !== lastRaidPaths || mask !== lastRaidMask) {
      let count = 0;
      for (const { path, done } of paths) {
        if (done) continue;
        for (let i = 1; i < path.length; i++) {
          const a = tiles[path[i - 1]];
          const b = tiles[path[i]];
          for (const ratio of [.26, .74]) {
            matrix.position.set(tileX(a) + (tileX(b) - tileX(a)) * ratio, .17, tileZ(a) + (tileZ(b) - tileZ(a)) * ratio);
            matrix.rotation.set(0, a.col === b.col ? Math.PI / 2 : 0, 0);
            matrix.scale.setScalar(1);
            matrix.updateMatrix();
            raidTrace.setMatrixAt(count++, matrix.matrix);
          }
        }
      }
      raidTrace.count = count;
      raidTrace.instanceMatrix.needsUpdate = true;
      lastRaidPaths = paths;
      lastRaidMask = mask;
    }
    traceMaterial.opacity = .73 + Math.sin(run.time * 5) * .17;
    raidMarkers.forEach((marker, i) => {
      const plan = paths[i];
      marker.ring.visible = Boolean(plan && !plan.done);
      if (marker.ring.visible) {
        const tile = tiles[plan.target];
        marker.ring.position.set(tileX(tile), .053, tileZ(tile));
        marker.tag.textContent = `0${plan.lamp + 1} 号袭线点`;
        positionLabel(marker.tag, tileX(tile), .62, tileZ(tile), true);
        const forecasting = run.raid.state === 'warning';
        const destination = forecasting ? plan.entry : plan.actor?.withdrawn ? tile : plan.actor ?? tile;
        const repeatedEntry = forecasting && paths.slice(0, i).some((other) => !other.done && other.entry === plan.entry);
        edgeGuide(edgeWarnings[i], repeatedEntry ? null : destination,
          forecasting ? plan.entry.label : `0${plan.lamp + 1} 号袭线点`);
      } else {
        marker.tag.hidden = true;
        edgeWarnings[i].hidden = true;
      }
    });
  }

  function showLamps(run, player, now) {
    const active = run.lit[run.stage] ? run.lit.findIndex((lit, i) => !lit && i <= run.stage) : run.stage;
    const playing = run.mode !== 'intro';
    const broken = active >= 0 && run.breaks[active] != null ? tiles[run.breaks[active]] : null;
    const location = broken ?? lamps[active];
    const fence = location && [14, 22].find((col) =>
      (player.x / size < col && location.col > col) || (player.x / size > col + 1 && location.col < col));
    const gate = fence && routeSigns.filter((sign) => sign.col === fence && sign.opens <= run.stage)
      .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
    const objective = gate || location;
    const threats = visibleThreats(run);
    posts.forEach((post, i) => {
      const lit = run.lit[i];
      const goal = i === active && !broken && !gate;
      const visible = run.mode === 'intro' || i <= run.stage;
      const powered = lit && surfaces[lamps[i].index].displayedPower;
      post.pool.visible = powered;
      post.halo.visible = powered;
      post.light.intensity = powered ? 2.8 : 0;
      post.bulb.material.emissiveIntensity = powered ? 2.8 : 0;
      post.bulb.material.color.copy(powered ? GOLD : DULL);
      post.marker.visible = goal && run.mode !== 'intro';
      post.marker.material.opacity = .68 + Math.sin(now * 4) * .19;
      post.tag.classList.toggle('is-lit', powered);
      post.tag.classList.toggle('is-goal', goal);
      post.tag.classList.toggle('is-threatened', threats.some((plan) => !plan.done && plan.lamp === i));
      positionLabel(post.tag, post.root.position.x, 1.98, post.root.position.z, visible && playing);
    });
    for (const { route, mark, tag } of signs) {
      mark.visible = playing && route.opens <= run.stage;
      positionLabel(tag, tileX(route), .89, tileZ(route), mark.visible);
      tag.classList.toggle('is-goal', route === gate);
    }
    for (const { entry, mark, tag } of beaconViews) {
      mark.visible = playing && run.beacons.includes(entry);
      mark.material.opacity = .66 + Math.sin(run.time * 6) * .26;
      positionLabel(tag, tileX(entry), .63, tileZ(entry), mark.visible);
    }
    breakRing.visible = Boolean(playing && broken);
    if (broken) {
      breakRing.position.set(tileX(broken), .056, tileZ(broken));
      breakRing.material.opacity = .73 + Math.sin(run.time * 6) * .2;
    }
    positionLabel(breakTag, breakRing.position.x, .80, breakRing.position.z, breakRing.visible);
    edgeGuide(target, playing ? objective : null, gate ? gate.label : broken ? '供电断点' : '0' + (active + 1) + '号灯');
    positionLabel(sourceTag, source.position.x, 1.22, source.position.z, run.mode !== 'intro');
  }

  function showActors({ run, player, enemies }, now) {
    const intro = run.mode === 'intro';
    const actor = intro ? { x: size * 19.7, y: size * 4.88 } : player;
    hero.root.position.set(tileX(actor), 0, tileZ(actor));
    hero.root.scale.setScalar(intro ? 1.55 : 1.19);
    hero.root.rotation.y = intro ? .76 : player.heading;
    const step = intro ? Math.sin(now * 2) * .43 : player.moving ? Math.sin(run.time * 18) : 0;
    hero.body.position.y = .04 * Math.abs(step);
    hero.body.rotation.z = .035 * step;
    hero.mower.rotation.x = .018 * step;
    hero.root.visible = intro || !(run.time < player.grace && Math.floor(run.time * 16) % 2);
    heroShadow.position.x = hero.root.position.x;
    heroShadow.position.z = hero.root.position.z;

    for (const [enemy, view] of monsterViews) {
      if (enemies.includes(enemy)) continue;
      view.root.visible = view.shadow.visible = false;
      free[enemy.kind].push(view);
      monsterViews.delete(enemy);
    }
    for (const enemy of enemies) {
      let view = monsterViews.get(enemy);
      const boss = enemy.kind === 'boss';
      if (!view) {
        view = free[enemy.kind].pop();
        if (!view) {
          view = littleMonster(enemy.kind);
          view.shadow = floorSpot(glow, '#101026', boss ? 2.1 : 1.3, .86);
          scene.add(view.root, view.shadow);
        }
        view.root.visible = view.shadow.visible = true;
        monsterViews.set(enemy, view);
      }
      view.root.position.set(tileX(enemy), 0, tileZ(enemy));
      view.root.rotation.y = enemy.heading ?? Math.atan2(player.x - enemy.x, player.y - enemy.y);
      const bounce = Math.abs(Math.sin(run.time * (boss ? 4.8 : 9.5) + enemy.phase));
      view.body.position.y = bounce * (boss ? .065 : .16);
      view.body.scale.set(1 + (1 - bounce) * .07, 1 - (1 - bounce) * .065, 1 + (1 - bounce) * .07);
      view.skin.emissive.copy(ATTACK);
      view.skin.emissiveIntensity = run.time < enemy.glow ? .75 : 0;
      const charging = run.regrow?.source === enemy;
      view.podMaterial.emissiveIntensity = charging ? 1.8 + Math.sin(now * 15) * .58 : enemy.threat ? 1.05 : .42;
      view.shadow.position.x = view.root.position.x;
      view.shadow.position.z = view.root.position.z;
    }
  }

  function showEffects({ run, player, particles }) {
    const n = Math.min(particles.length, MAX_PARTICLES);
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      const progress = 1 - p.life / p.duration;
      matrix.position.set(tileX(p), .1 + Math.sin(progress * Math.PI) * .55, tileZ(p));
      matrix.rotation.set(progress * 7, i * 1.7, progress * 3);
      matrix.scale.setScalar((p.size / 2) * Math.min(1, p.life * 6));
      matrix.updateMatrix();
      motes.setMatrixAt(i, matrix.matrix);
      motes.setColorAt(i, tint.set(p.color));
    }
    motes.count = n;
    if (n) {
      motes.instanceColor.needsUpdate = true;
      motes.instanceMatrix.needsUpdate = true;
    }
    shot.visible = Boolean(run.sparks && run.sparks.time > run.time);
    if (shot.visible) {
      shotDelta.set((run.sparks.x - player.x) / size, -.19, (run.sparks.y - player.y) / size);
      shot.position.set(tileX(player) + shotDelta.x / 2, .54, tileZ(player) + shotDelta.z / 2);
      shot.scale.y = shotDelta.length();
      shot.quaternion.setFromUnitVectors(shotAxis, shotDelta.normalize());
    }
  }

  function draw(state, milliseconds, dt) {
    if (!moveCamera(state, dt)) return;
    const now = milliseconds / 1000;
    syncBoard(state.run, now);
    showWarning(state.run.regrow, state.run.time);
    showFootsteps(state.run);
    showRaid(state.run);
    showLamps(state.run, state.player, now);
    showActors(state, now);
    showEffects(state);
    renderer.render(scene, camera);
  }

  return { draw };
}
