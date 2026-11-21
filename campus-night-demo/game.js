import { createScene, fieldDirection } from './scene.js';
import { accessStage, COLS, entrances, point, ROWS, SIZE } from './field-map.js';
import { fieldThreats, planThreat, standThreats, WARNING_SECONDS } from './raids.js';

const byId = (id) => document.getElementById(id);
const canvas = byId('board');
const field = canvas.parentElement;
const dialog = byId('modal');
const WIDTH = COLS * SIZE;
const HEIGHT = ROWS * SIZE;
const HOLD_SECONDS = 15;
const FOOTSTEP_GROWTH_DELAY = 3;
const TIME_LIMIT = 720;
const MAX_HEALTH = 5;
const generator = point(3, 8);
const lamps = [point(11, 8), point(19, 4), point(24, 12)];
const lampNames = ['操场灯', '看台灯', '球场灯'];
const fixtures = new Set([generator.index, ...lamps.map((lamp) => lamp.index)]);
const stageNames = ['点亮操场', '给看台接电', '守住全场'];
const enemies = [];
const particles = [];
const keys = new Set();
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const joystick = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
const tiles = Array.from({ length: COLS * ROWS }, (_, index) => {
  const tile = point(index % COLS, Math.floor(index / COLS));
  tile.opens = accessStage(tile.col, tile.row);
  tile.seed = ((index * 9461 + 91) % 7919) / 7919;
  tile.neighbors = [];
  if (tile.col > 0) tile.neighbors.push(index - 1);
  if (tile.col < COLS - 1) tile.neighbors.push(index + 1);
  if (tile.row > 0) tile.neighbors.push(index - COLS);
  if (tile.row < ROWS - 1) tile.neighbors.push(index + COLS);
  return tile;
});
const chaseSteps = new Int16Array(tiles.length);

let player;
let run;
let view;
let audio;
let soundOn = false;
let lastFrame = performance.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function reset(showIntro = false) {
  player = { x: generator.x, y: generator.y, health: MAX_HEALTH, speed: 154, cutter: 26,
    attackDelay: .58, nextAttack: 0, grace: 0, heading: Math.PI / 2, moving: false, trailProtection: 0 };
  run = { mode: showIntro ? 'intro' : 'play', time: 0, stage: 0, lit: [false, false, false],
    everLit: [false, false, false], outage: false, hold: 0, breaks: [null, null, null],
    phase: 'connect', raid: null, standRaids: 0, finishedWaves: 0, stageStarted: 0, stageTimes: [], beacons: [],
    scout: null, scoutDue: 0, chaseFrom: -1, chaseStage: -1, spawnAt: 8, spawnCount: 0,
    cutCount: 0, kills: 0, regrow: null, footsteps: new Map(), sparks: null, noticeUntil: 0, hud: '', terrainVersion: 0 };
  enemies.length = 0;
  particles.length = 0;
  clearInput();
  for (const tile of tiles) {
    tile.cut = fixtures.has(tile.index);
    tile.live = false;
    tile.lockedUntil = 0;
    tile.protectedUntil = 0;
  }
  if (showIntro) {
    for (let col = 3; col <= 19; col++) tiles[8 * COLS + col].cut = true;
    for (let row = 4; row <= 8; row++) tiles[row * COLS + 19].cut = true;
    for (let col = 19; col < 24; col++) tiles[5 * COLS + col].cut = true;
  }
  calculatePower(false);
  byId('intro').hidden = !showIntro;
  byId('notice').hidden = true;
  byId('pause').disabled = showIntro;
  updateHud();
}

function liveNetwork(omit = -1) {
  const seen = new Set([generator.index]);
  const queue = [generator.index];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const from = tiles[queue[cursor]];
    for (const index of from.neighbors) {
      if (index === omit || seen.has(index) || !open(index) || !tiles[index].cut) continue;
      seen.add(index);
      queue.push(index);
      if (omit < 0) tiles[index].hops = from.hops + 1;
    }
  }
  return seen;
}

function calculatePower(announce = true, changedCells = []) {
  run.terrainVersion++;
  tiles[generator.index].hops = 0;
  const powered = liveNetwork();
  for (const tile of tiles) tile.live = powered.has(tile.index);
  lamps.forEach((lamp, i) => {
    const live = (run.mode === 'intro' || i <= run.stage) && tiles[lamp.index].live;
    if (live && !run.lit[i] && announce) {
      scatter(lamp.x, lamp.y, '#ffe19b', 28);
      beep([440, 660, 880]);
      notice(run.everLit[i] ? `${lampNames[i]}恢复供电` : `${lampNames[i]}亮了`);
      run.everLit[i] = true;
    }
    if (!live && run.lit[i] && announce) {
      if (i === 0) run.outage = true;
      run.breaks[i] = changedCells.reduce((closest, index) =>
        closest === null || distance(tiles[index], lamp) < distance(tiles[closest], lamp) ? index : closest, null);
      beep([220, 147]);
      notice('断电了，沿断口补路或绕行');
    }
    if (live) run.breaks[i] = null;
    run.lit[i] = live;
  });
}

function cutGrass() {
  const { x, y, cutter } = player;
  const left = Math.max(0, Math.floor((x - cutter) / SIZE));
  const right = Math.min(COLS - 1, Math.floor((x + cutter) / SIZE));
  const top = Math.max(0, Math.floor((y - cutter) / SIZE));
  const bottom = Math.min(ROWS - 1, Math.floor((y + cutter) / SIZE));
  let changed = false;
  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const tile = tiles[row * COLS + col];
      if (!open(tile.index) || distance(player, tile) > cutter || run.time < tile.lockedUntil ||
        !lineOpen(player, tile)) continue;
      tile.protectedUntil = run.time + player.trailProtection;
      if (player.moving) run.footsteps.delete(tile.index);
      if (tile.cut) continue;
      tile.cut = true;
      changed = true;
      run.cutCount++;
      scatter(tile.x, tile.y, '#73ce81', 5);
    }
  }
  if (changed) calculatePower();
}

function notice(message, seconds = 2.5) {
  const node = byId('notice');
  node.textContent = message;
  node.hidden = false;
  run.noticeUntil = run.time + seconds;
}

function warnRegrow(targets, delay, tutorial = false, source = null) {
  if (targets.length) run.regrow = { targets, time: run.time + delay, tutorial, source };
}

function regrowTile(index, tutorial = false, lock = .85) {
  const tile = tiles[index];
  if (!tile.cut || fixtures.has(index) || (!tutorial && tile.protectedUntil > run.time)) return false;
  tile.cut = false;
  tile.lockedUntil = run.time + lock;
  run.footsteps.delete(index);
  scatter(tile.x, tile.y, tutorial ? '#ffac87' : '#9bc866', 9);
  return true;
}

function updateRegrow() {
  const changed = [];
  for (const [index, time] of run.footsteps) {
    if (time > run.time) continue;
    run.footsteps.delete(index);
    if (regrowTile(index, false, .36)) changed.push(index);
  }
  const warning = run.regrow;
  if (warning && run.time >= warning.time) {
    run.regrow = null;
    for (const index of warning.targets) {
      if (regrowTile(index, warning.tutorial)) changed.push(index);
    }
  }
  if (changed.length) calculatePower(true, changed);
}

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return -1;
  return Math.floor(y / SIZE) * COLS + Math.floor(x / SIZE);
}

function open(index) {
  return tiles[index]?.opens <= (run.mode === 'intro' ? 2 : run.stage);
}

function lineOpen(a, b) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 8));
  for (let i = 1; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps;
    const y = a.y + (b.y - a.y) * i / steps;
    if (!open(tileAt(x, y))) return false;
  }
  return true;
}

function positionOpen(x, y, inset) {
  return open(tileAt(x - inset, y - inset)) && open(tileAt(x + inset, y - inset)) &&
    open(tileAt(x - inset, y + inset)) && open(tileAt(x + inset, y + inset));
}

function walk(actor, dx, dy, inset) {
  const x = clamp(actor.x + dx, 17, WIDTH - 17);
  const y = clamp(actor.y + dy, 17, HEIGHT - 17);
  if (positionOpen(x, actor.y, inset)) actor.x = x;
  if (positionOpen(actor.x, y, inset)) actor.y = y;
}

function refreshChase() {
  const at = tileAt(player.x, player.y);
  if (run.chaseFrom === at && run.chaseStage === run.stage) return;
  run.chaseFrom = at;
  run.chaseStage = run.stage;
  chaseSteps.fill(-1);
  chaseSteps[at] = 0;
  const queue = [at];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    for (const neighbor of tiles[index].neighbors) {
      if (!open(neighbor) || chaseSteps[neighbor] >= 0) continue;
      chaseSteps[neighbor] = chaseSteps[index] + 1;
      queue.push(neighbor);
    }
  }
}

function chaseTarget(enemy) {
  const at = tileAt(enemy.x, enemy.y);
  if ((at === run.chaseFrom || distance(enemy, player) < 95) && lineOpen(enemy, player)) return player;
  const next = tiles[at].neighbors.find((index) => chaseSteps[index] >= 0 && chaseSteps[index] < chaseSteps[at]);
  return next === undefined ? tiles[at] : tiles[next];
}

function plantFootstep(enemy) {
  const index = tileAt(enemy.x, enemy.y);
  if (index === enemy.lastTile) return;
  enemy.lastTile = index;
  const tile = tiles[index];
  if (!open(index) || !tile.cut || fixtures.has(index) || tile.protectedUntil > run.time || run.footsteps.has(index)) return;
  const due = run.time + FOOTSTEP_GROWTH_DELAY;
  run.footsteps.set(index, due);
  enemy.threat?.pending.set(index, due);
}

function chooseRegrow(enemy) {
  const available = tiles.filter((tile) => tile.live && !fixtures.has(tile.index) &&
    tile.protectedUntil <= run.time && distance(tile, player) > 85 && distance(tile, generator) > 75);
  available.sort((a, b) => distance(a, enemy) - distance(b, enemy));
  if (!available.length) return;
  const center = available[0];
  const targets = enemy.kind === 'boss' ? available.filter((tile) => distance(center, tile) <= SIZE).map((tile) => tile.index) : [center.index];
  warnRegrow(targets, 1.65, false, enemy);
}

function spawn(kind, entry) {
  const a = Math.random() * Math.PI * 2;
  const radius = kind === 'boss' ? 355 : 285;
  const ideal = { x: clamp(player.x + Math.cos(a) * radius, 23, WIDTH - 23),
    y: clamp(player.y + Math.sin(a) * radius, 23, HEIGHT - 23) };
  const origin = entry ?? tiles.reduce((best, tile) => open(tile.index) && distance(tile, player) > 140 &&
    (!best || distance(tile, ideal) < distance(best, ideal)) ? tile : best, null);
  if (!origin) return null;
  const { x, y } = origin;
  const enemy = { x, y, kind, hp: 1, size: 13, speed: 55 + Math.random() * 15, glow: 0,
    nextCut: run.time + 3, phase: a, lastTile: tileAt(x, y) };
  if (kind === 'weed') Object.assign(enemy, { hp: 3, size: 17, speed: 46 });
  if (kind === 'boss') Object.assign(enemy, { hp: 14, size: 26, speed: 37 });
  enemies.push(enemy);
  scatter(x, y, '#c698cc', 11);
  return enemy;
}

function sendScout() {
  const candidates = tiles.filter((tile) => tile.live && !fixtures.has(tile.index) &&
    distance(tile, player) >= 58);
  candidates.sort((a, b) => distance(a, lamps[0]) - distance(b, lamps[0]));
  const crossing = candidates.find((tile) => !liveNetwork(tile.index).has(lamps[0].index)) ??
    candidates[0] ?? tiles.find((tile) => tile.live && !fixtures.has(tile.index));
  if (!crossing) return;
  const neighbors = crossing.neighbors.filter(open);
  neighbors.sort((a, b) => distance(tiles[b], player) - distance(tiles[a], player));
  const scout = spawn('normal', tiles[neighbors[0]]);
  scout.scoutTarget = crossing.index;
  run.scout = scout;
  notice('留意靠近草径的怪物，它会留下嫩芽。', 4);
}

function attack() {
  if (run.time < player.nextAttack) return;
  let target = null;
  let closest = 124;
  for (const enemy of enemies) {
    const d = distance(player, enemy);
    if (d < closest && enemy.scoutTarget == null && lineOpen(player, enemy)) {
      target = enemy;
      closest = d;
    }
  }
  if (!target) return;
  player.nextAttack = run.time + player.attackDelay;
  run.sparks = { x: target.x, y: target.y, time: run.time + .12 };
  target.hp--;
  target.glow = run.time + .14;
  scatter(target.x, target.y, '#fff3b3', 7);
  if (target.hp <= 0) {
    enemies.splice(enemies.indexOf(target), 1);
    run.kills++;
    scatter(target.x, target.y, '#d199db', 13);
  }
}

function spawnDueEnemies() {
  if (run.phase !== 'connect' || run.time < run.spawnAt || enemies.length >= [2, 4, 5][run.stage]) return;
  const special = run.spawnCount % 4 === 3 && (run.stage > 0);
  spawn(special ? 'weed' : 'normal');
  run.spawnCount++;
  run.spawnAt = run.time + 8;
}

function moveEnemy(enemy, target, dt) {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const d = Math.hypot(dx, dy);
  if (d < .01) return;
  enemy.heading = Math.atan2(dx, dy);
  const step = Math.min(d, enemy.speed * dt);
  walk(enemy, dx / d * step, dy / d * step, enemy.kind === 'boss' ? 12 : 7);
  plantFootstep(enemy);
}

function march(enemy, dt) {
  const path = enemy.threat.path;
  const waypoint = tiles[path[enemy.waypoint]];
  moveEnemy(enemy, waypoint, dt);
  if (distance(enemy, waypoint) > .08) return;
  if (enemy.waypoint === path.length - 1) enemy.returning = true;
  if (enemy.returning && enemy.waypoint === 0) {
    enemy.withdrawn = true;
    return;
  }
  enemy.waypoint += enemy.returning ? -1 : 1;
}

function stepEnemies(dt) {
  spawnDueEnemies();
  refreshChase();
  attack();
  for (const enemy of enemies) {
    const guided = enemy.scoutTarget != null;
    if (enemy.threat) march(enemy, dt);
    else moveEnemy(enemy, guided ? tiles[enemy.scoutTarget] : chaseTarget(enemy), dt);
    if (enemy.withdrawn) continue;
    if (guided && enemy.lastTile === enemy.scoutTarget) {
      run.scoutDue = run.time + FOOTSTEP_GROWTH_DELAY + .08;
      enemy.scoutTarget = null;
    }
    if (!guided && enemy.kind !== 'normal' && (!enemy.threat || enemy.kind === 'boss') &&
      !run.regrow && run.time >= enemy.nextCut) {
      chooseRegrow(enemy);
      enemy.nextCut = run.time + (enemy.kind === 'boss' ? 9 : 14);
    }
    if (!guided && distance(player, enemy) < enemy.size + 11 && run.time > player.grace && lineOpen(enemy, player)) {
      player.health--;
      player.grace = run.time + 1.9;
      scatter(player.x, player.y, '#ff9989', 16);
      beep([126]);
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].withdrawn) enemies.splice(i, 1);
  }
}

function setPhase(phase) {
  run.phase = phase;
  run.spawnAt = run.time + 2;
  run.spawnCount = 0;
  run.beacons = [];
}

function requiredLampsLit() {
  return run.lit.slice(0, run.stage + 1).every(Boolean);
}

function queueRaid(specs) {
  setPhase('raid');
  run.raid = { specs, plans: [], state: 'waiting', launchAt: 0 };
}

function raidFinished(threat) {
  if (enemies.includes(threat.actor)) return false;
  if (run.regrow?.source === threat.actor) return false;
  for (const [index, due] of threat.pending) {
    if (run.footsteps.get(index) === due) return false;
  }
  return true;
}

function releaseEscort(threat) {
  const tile = tiles[threat.entry.index];
  const openings = tile.neighbors.filter(open);
  const forward = threat.path[1];
  const side = openings.filter((index) => index !== forward);
  const slots = [threat.entry.index, ...side, forward];
  const index = slots[threat.escortCount % slots.length];
  spawn('normal', tiles[index]);
  threat.escortCount++;
  threat.nextEscortAt = run.time + 1.8;
}

function playRaid() {
  const raid = run.raid;
  if (raid.state === 'waiting') {
    if (!requiredLampsLit()) return;
    const excluded = new Set();
    const plans = [];
    for (const spec of raid.specs) {
      const plan = planThreat(spec, { tiles, lamps, generator, fixtures, open, liveNetwork, excluded });
      if (!plan) return;
      plans.push(plan);
      excluded.add(plan.target);
    }
    raid.plans = plans;
    raid.launchAt = run.time + WARNING_SECONDS;
    raid.state = 'warning';
    run.beacons = plans.map(({ entry }) => entry);
    beep([294, 220]);
    return;
  }
  if (raid.state === 'warning') {
    if (run.time < raid.launchAt) return;
    if (!requiredLampsLit()) {
      raid.state = 'waiting';
      raid.plans = [];
      run.beacons = [];
      return;
    }
    for (const threat of raid.plans) {
      for (let i = 0; i < Math.min(2, threat.escorts); i++) releaseEscort(threat);
      const actor = spawn(threat.kind, threat.entry);
      actor.threat = threat;
      actor.waypoint = 1;
      actor.returning = false;
      threat.actor = actor;
    }
    raid.state = 'active';
    return;
  }
  if (raid.state === 'active') {
    for (const threat of raid.plans) {
      if (enemies.includes(threat.actor) && threat.escortCount < threat.escorts && run.time >= threat.nextEscortAt) {
        releaseEscort(threat);
      }
    }
    for (const threat of raid.plans) threat.done = raidFinished(threat);
    run.beacons = raid.plans.filter((threat) => !threat.done).map(({ entry }) => entry);
    if (!raid.plans.every((threat) => threat.done)) return;
    raid.state = 'repairing';
    run.beacons = [];
  }
  if (!requiredLampsLit()) return;
  run.raid = null;
  if (run.stage === 1) {
    run.standRaids++;
    if (run.standRaids === standThreats.length) stageUpgrade();
    else queueRaid(standThreats[run.standRaids]);
    return;
  }
  run.finishedWaves++;
  if (run.finishedWaves === 1) setPhase('ready');
  else {
    setPhase('hold');
    notice('两波袭线已处理，守住三盏灯 15 秒。', 4);
  }
}

function advanceShift(dt) {
  if (run.stage === 0) {
    if (run.phase === 'connect' && (run.lit[0] || run.everLit[0])) setPhase('scout');
    if (run.phase === 'scout') {
      if (!run.outage && !run.scout) sendScout();
      if (run.lit[0] && (run.outage || (run.scoutDue && run.time >= run.scoutDue))) stageUpgrade();
    }
    return;
  }
  if (run.phase === 'connect' && run.lit[run.stage]) queueRaid(run.stage === 1 ? standThreats[0] : fieldThreats[0]);
  if (run.phase === 'raid') playRaid();
  if (run.phase === 'hold') {
    run.hold = requiredLampsLit() ? run.hold + dt : 0;
    if (run.hold >= HOLD_SECONDS) finish(true, '校园重新亮了');
  }
}

function stageUpgrade() {
  run.stageTimes.push(run.time - run.stageStarted);
  run.mode = 'upgrade';
  clearInput();
  player.health = Math.min(MAX_HEALTH, player.health + 1);
  const options = [
    ['加宽刀盘', '扩大割草范围，沿途更容易清出多条并行路线。', () => { player.cutter += 10; }],
    ['加装压草轮', '经过的草径 10 秒内不会重新长草。可叠加。', () => { player.trailProtection += 10; }],
    ['强化自动攻击', '缩短攻击间隔，方便在怪群里抢修。', () => { player.attackDelay *= .7; }],
  ];
  showDialog('装备升级', run.stage === 0 ? '操场恢复供电' : '看台灯接通', '恢复 1 格体力，选择一项装备继续夜班。', options.map(([label, hint, apply]) => ({
    label, hint, action: () => {
      apply();
      run.stage++;
      run.stageStarted = run.time;
      run.hold = 0;
      run.regrow = null;
      setPhase('connect');
      notice(run.stage === 2 ? '球场入口已打开，先接通第 3 盏灯。' : '看台两道门已打开。选窄路或沿外侧绕行。', 4);
      run.mode = 'play';
      calculatePower();
      dialog.close();
      updateHud();
    },
  })));
}

function update(dt) {
  run.time += dt;
  const key = (...list) => list.some((code) => keys.has(code));
  const dx = Number(key('KeyD', 'ArrowRight')) - Number(key('KeyA', 'ArrowLeft')) + joystick.dx;
  const dy = Number(key('KeyS', 'ArrowDown')) - Number(key('KeyW', 'ArrowUp')) + joystick.dy;
  const magnitude = Math.hypot(dx, dy);
  player.moving = magnitude > .07;
  if (player.moving) {
    const speed = player.speed * dt / Math.max(1, magnitude);
    const steering = fieldDirection(dx, dy);
    walk(player, steering.x * speed, steering.y * speed, 9);
    player.heading = Math.atan2(steering.x, steering.y);
  }
  cutGrass();
  updateRegrow();
  stepEnemies(dt);
  stepParticles(dt);
  if (run.time > run.noticeUntil) byId('notice').hidden = true;
  if (player.health <= 0) return finish(false, '体力耗尽');
  if (run.time >= TIME_LIMIT) return finish(false, '夜班时间到了');

  advanceShift(dt);
}

function finish(win, title) {
  run.mode = 'end';
  run.stageTimes.push(run.time - run.stageStarted);
  clearInput();
  byId('pause').disabled = true;
  if (win) beep([440, 554, 659, 880]);
  showDialog(win ? '夜班完成' : '夜班结束', title,
    `用时 ${formatClock(run.time)} · 点亮 ${run.lit.filter(Boolean).length} / 3 盏灯 · 击退 ${run.kills} 只怪物\n${run.stageTimes.map((time, i) => `${['操场', '看台', '球场'][i]} ${formatClock(time)}`).join(' · ')}`,
    [{ label: '再玩一局', action: begin }, { label: '回到封面', action: () => { dialog.close(); reset(true); } }]);
}

function formatClock(seconds) {
  const time = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
}

function updateHud() {
  const clock = formatClock(TIME_LIMIT - run.time);
  const hold = Math.min(HOLD_SECONDS, Math.floor(run.hold));
  const raid = run.raid;
  const warning = raid?.state === 'warning' ? Math.max(0, Math.ceil(raid.launchAt - run.time)) : 0;
  const unresolved = raid?.state === 'active' ? raid.plans.filter((threat) => !raidFinished(threat)).length : 0;
  const key = [clock, run.mode, run.stage, run.phase, raid?.state, run.standRaids, run.finishedWaves,
    run.outage, run.lit.join(), warning, unresolved, hold, player.health].join('|');
  if (key === run.hud) return;
  run.hud = key;
  byId('clock').textContent = clock;
  byId('health').setAttribute('aria-label', `体力 ${player.health} / ${MAX_HEALTH}`);
  [...byId('health').children].forEach((node, i) => node.classList.toggle('empty', i >= player.health));
  let title = stageNames[run.stage];
  const lost = lampNames.filter((_, i) => run.everLit[i] && !run.lit[i]).join('、');
  const off = lost ? `${lost}断电，沿橙色断点抢修。` : '';
  const raidName = run.stage === 1 ? `袭线 ${run.standRaids + 1} / 2` : `第 ${run.finishedWaves + 1} 波攻势`;
  let raidHint = off || '先为本区路灯恢复供电。';
  if (raid?.state === 'warning') {
    const gates = [...new Set(raid.plans.map(({ entry }) => entry.label))].join('、');
    const threatened = raid.plans.map(({ lamp }) => lampNames[lamp]).join('、');
    raidHint = `${gates}将在 ${warning} 秒后进场，目标是${threatened}。`;
  } else if (raid?.state === 'active') {
    const active = raid.plans.filter(({ actor }) => enemies.includes(actor));
    if (!active.length) raidHint = off || '袭线怪已退，沿橙线清掉尚未长成的嫩芽。';
    else if (active.some(({ actor }) => !actor.returning)) {
      raidHint = off || (active.length > 1 ? '两侧同时进攻。截击袭线怪，或铺线保灯。' : '沿橙线截住袭线怪，或用备用线保住路灯。');
    } else raidHint = off || '袭线怪正在撤离。可以追击，或掉头处理嫩芽。';
  } else if (raid?.state === 'repairing') raidHint = off || '恢复本区所有路灯即可继续。';
  if (run.phase === 'raid') title = raid?.state === 'repairing' ? '赶往断点' : raidName;
  if (run.phase === 'ready') title = '检查线路';
  if (run.phase === 'hold') title = '最后验收';
  byId('mission-title').textContent = title;
  const missions = {
    connect: ['从绿色配电箱出发，割出一条通往操场灯的路。',
      '穿过库房窄门或看台外侧门，割出通往看台灯的草径。',
      '穿过球场入口，割出通往球场灯的草径。'][run.stage],
    scout: off || '跟着草径观察怪物。它留下的嫩芽约 3 秒后会长成杂草。',
    raid: raidHint,
    ready: off || '下一波从东北和南侧同时进攻。检查完线路后，由你决定何时开战。',
    hold: off || '继续移动巡线，保持三盏灯同时亮满 15 秒。',
  };
  byId('mission-text').textContent = missions[run.phase] || '沿草径巡线，检查路灯。';
  byId('launch-wave').hidden = run.mode !== 'play' || run.phase !== 'ready';
  byId('hold').hidden = run.phase !== 'hold';
  byId('hold-bar').max = HOLD_SECONDS;
  byId('hold-bar').value = hold;
  byId('hold-text').textContent = `${hold} / ${HOLD_SECONDS} 秒`;
  lamps.forEach((_, i) => {
    const row = byId(`lamp-${i}`);
    const lit = run.mode !== 'intro' && run.lit[i];
    row.classList.toggle('lit', lit);
    row.classList.toggle('current', i === run.stage);
    row.lastElementChild.textContent = lit ? '已点亮' : i > run.stage ? '未开放' : run.everLit[i] ? '断电' : '待供电';
  });
}

function showDialog(label, title, description, options) {
  byId('modal-label').textContent = label;
  byId('modal-title').textContent = title;
  byId('modal-description').textContent = description;
  byId('modal-actions').replaceChildren(...options.map(({ label, hint, action }, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = hint ? 'upgrade' : index === 0 ? 'primary' : 'quiet';
    const text = document.createElement('strong');
    text.textContent = label;
    button.append(text);
    if (hint) {
      const detail = document.createElement('span');
      detail.textContent = hint;
      button.append(detail);
    }
    button.addEventListener('click', action);
    return button;
  }));
  if (!dialog.open) dialog.showModal();
  byId('modal-actions').firstElementChild.focus();
}

function begin() {
  if (dialog.open) dialog.close();
  byId('start').blur();
  reset();
  notice('移动割草，沿绿光接通第一盏灯', 4);
  beep([294, 392, 523]);
}

function pause() {
  if (run.mode !== 'play') return;
  run.mode = 'paused';
  clearInput();
  showDialog('夜班暂停', '休息一下', '继续后计时恢复。', [
    { label: '继续夜班', action: resume }, { label: '重新开始', action: begin },
    { label: '回到封面', action: () => { dialog.close(); reset(true); } },
  ]);
}

function resume() {
  dialog.close();
  run.mode = 'play';
  byId('pause').blur();
}

function beep(notes) {
  if (!soundOn || !audio || audio.state !== 'running') return;
  notes.forEach((frequency, i) => {
    const start = audio.currentTime + i * .075;
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(.0001, start);
    volume.gain.exponentialRampToValueAtTime(.11, start + .016);
    volume.gain.exponentialRampToValueAtTime(.0001, start + .12);
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + .13);
  });
}

function clearInput() {
  keys.clear();
  joystick.id = null;
  joystick.dx = joystick.dy = 0;
  byId('joystick').hidden = true;
}

function scatter(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    if (particles.length >= 220) break;
    const theta = Math.random() * Math.PI * 2;
    const speed = 25 + Math.random() * 108;
    const duration = .18 + Math.random() * .43;
    particles.push({ x, y, dx: Math.cos(theta) * speed, dy: Math.sin(theta) * speed,
      color, size: 2 + Math.random() * 3, life: duration, duration });
  }
}

function stepParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.life -= dt;
    if (particle.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    particle.x += particle.dx * dt;
    particle.y += particle.dy * dt;
  }
}

function frame(timestamp) {
  const dt = clamp((timestamp - lastFrame) / 1000, 0, .07);
  lastFrame = timestamp;
  if (run.mode === 'play') update(dt);
  view.draw({ run, player, enemies, particles }, timestamp, dt);
  updateHud();
  requestAnimationFrame(frame);
}

byId('start').addEventListener('click', begin);
byId('pause').addEventListener('click', pause);
byId('launch-wave').addEventListener('click', () => {
  if (run.mode !== 'play' || run.phase !== 'ready') return;
  byId('launch-wave').blur();
  queueRaid(fieldThreats[1]);
  updateHud();
});
byId('sound').addEventListener('click', async () => {
  try {
    audio ??= new AudioContext();
    if (!soundOn) await audio.resume();
    soundOn = !soundOn;
    byId('sound').textContent = soundOn ? '声音开' : '声音关';
    byId('sound').setAttribute('aria-pressed', String(soundOn));
    if (soundOn) beep([440]);
  } catch {
    byId('sound').textContent = '声音不可用';
    byId('sound').disabled = true;
  }
});
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (run.mode === 'paused') resume();
});
window.addEventListener('keydown', (event) => {
  if (run.mode !== 'play') return;
  if (movementKeys.has(event.code)) {
    event.preventDefault();
    keys.add(event.code);
  }
  if (event.code === 'Escape' && !event.repeat) {
    event.preventDefault();
    pause();
  }
});
window.addEventListener('keyup', ({ code }) => keys.delete(code));
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
canvas.addEventListener('pointerdown', (event) => {
  if (run.mode !== 'play' || joystick.id !== null) return;
  joystick.id = event.pointerId;
  joystick.x = event.clientX;
  joystick.y = event.clientY;
  const rect = field.getBoundingClientRect();
  const node = byId('joystick');
  node.style.left = `${event.clientX - rect.left}px`;
  node.style.top = `${event.clientY - rect.top}px`;
  node.firstElementChild.style.translate = '0px 0px';
  node.hidden = false;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== joystick.id) return;
  const dx = event.clientX - joystick.x;
  const dy = event.clientY - joystick.y;
  const extent = Math.max(27, Math.hypot(dx, dy));
  joystick.dx = dx / extent;
  joystick.dy = dy / extent;
  byId('joystick').firstElementChild.style.translate = `${joystick.dx * 23}px ${joystick.dy * 23}px`;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, (event) => { if (event.pointerId === joystick.id) clearInput(); });
}

reset(true);
try {
  view = createScene({ canvas, labels: byId('map-labels'), target: byId('map-target'),
    tiles, generator, lamps, cols: COLS, rows: ROWS, size: SIZE, footstepDelay: FOOTSTEP_GROWTH_DELAY });
  requestAnimationFrame(frame);
} catch (error) {
  console.error('无法初始化 3D 场景', error);
  byId('start').disabled = true;
  notice('3D 场景无法启动。请尝试启用硬件加速后重新加载页面。');
}
