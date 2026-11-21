import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const shapes = new Map();
const materials = new Map();
const sphere = new THREE.SphereGeometry(1, 12, 8);
const cube = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const cone = new THREE.ConeGeometry(1, 1, 7);
const creatureDetails = new Map();
const detailMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });

export function matte(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  return materials.get(color);
}

function part(parent, geometry, color, x, y, z, sx, sy, sz) {
  const object = new THREE.Mesh(geometry, matte(color));
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  parent.add(object);
  return object;
}

export function block(parent, x, y, z, w, h, d, color) {
  return part(parent, cube, color, x, y, z, w, h, d);
}

export function roundBox(parent, x, y, z, w, h, d, rounding, color) {
  const key = [w, h, d, rounding].join('/');
  if (!shapes.has(key)) shapes.set(key, new RoundedBoxGeometry(w, h, d, 2, rounding));
  return part(parent, shapes.get(key), color, x, y, z, 1, 1, 1);
}

export function oval(parent, x, y, z, sx, sy, sz, color) {
  return part(parent, sphere, color, x, y, z, sx, sy, sz);
}

export function column(parent, x, y, z, radius, h, color) {
  return part(parent, cylinder, color, x, y, z, radius, h, radius);
}

function branch(parent, from, to, radius, color) {
  const start = new THREE.Vector3(...from);
  const delta = new THREE.Vector3(...to).sub(start);
  const center = start.addScaledVector(delta, .5);
  const object = column(parent, center.x, center.y, center.z, radius, delta.length(), color);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return object;
}

export function gardener() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const mower = new THREE.Group();
  root.add(body, mower);
  for (const x of [-.14, .14]) {
    roundBox(body, x, .13, -.035, .22, .22, .34, .065, '#233b4c');
    roundBox(body, x, .31, -.015, .19, .24, .19, .055, '#38627d');
    const arm = oval(body, x * 2.11, .56, .095, .095, .16, .105, '#48b89e');
    arm.rotation.x = -.55;
    oval(body, x * 2.2, .49, .22, .079, .079, .08, '#f5bb90');
  }
  roundBox(body, 0, .49, 0, .46, .39, .33, .12, '#3f9d8e');
  roundBox(body, 0, .51, .171, .26, .22, .043, .018, '#75d9a8');
  block(body, 0, .45, .20, .125, .022, .02, '#d3ec8d');
  for (const side of [-1, 1]) {
    block(body, side * .135, .565, .17, .054, .198, .042, '#47656a');
    block(body, side * .135, .507, .2, .051, .065, .033, '#c4b28b');
    roundBox(body, side * .218, .406, .022, .114, .12, .174, .03, '#365e62');
  }
  oval(body, 0, .83, .024, .305, .282, .269, '#f8bc91');
  for (const x of [-.277, .277]) oval(body, x, .81, .062, .056, .076, .046, '#f4a97e');
  oval(body, 0, .982, .009, .327, .214, .30, '#ffd368');
  oval(body, 0, .897, .18, .337, .071, .255, '#ffea94');
  roundBox(body, 0, .92, .316, .166, .12, .104, .037, '#515262');
  roundBox(body, 0, .927, .376, .12, .07, .019, .015, '#f7e4a8');
  roundBox(body, 0, .82, .263, .306, .094, .058, .027, '#374656');
  for (const x of [-.085, .085]) {
    roundBox(body, x, .82, .3, .115, .067, .024, .018, '#657783');
    block(body, x - .025, .84, .314, .036, .012, .008, '#a6b2b5');
  }
  oval(body, 0, .748, .28, .071, .018, .023, '#a85c58');
  roundBox(body, 0, .52, -.203, .26, .26, .14, .045, '#e6b85d');
  roundBox(body, 0, .49, -.279, .21, .117, .072, .025, '#a16d4b');
  block(body, 0, .533, -.319, .062, .019, .015, '#d9be79');

  roundBox(mower, 0, .186, .61, .68, .25, .58, .073, '#934e3d');
  roundBox(mower, 0, .289, .593, .597, .13, .46, .047, '#c66d4d');
  roundBox(mower, 0, .365, .55, .36, .13, .28, .045, '#dbac5d');
  block(mower, 0, .432, .519, .205, .027, .172, '#585365');
  for (let i = 0; i < 4; i++) block(mower, -.069 + i * .046, .449, .519, .015, .009, .145, '#8e8990');
  roundBox(mower, 0, .191, .915, .64, .13, .116, .041, '#47515d');
  for (const x of [-.22, .22]) {
    block(mower, x, .224, .978, .091, .043, .019, '#c2a970');
    column(mower, x, .366, .747, .029, .029, '#8d8170');
  }
  for (const x of [-.291, .291]) {
    for (const z of [.43, .76]) {
      const wheel = column(mower, x * 1.16, .136, z, .123, .121, '#2c303b');
      wheel.rotation.z = Math.PI / 2;
      const hub = column(mower, x * 1.39, .136, z, .065, .025, '#8f9bab');
      hub.rotation.z = Math.PI / 2;
      for (let j = 0; j < 8; j++) {
        const angle = j * Math.PI / 4;
        const tread = block(mower, x * 1.16, .136 + Math.sin(angle) * .121,
          z + Math.cos(angle) * .121, .113, .038, .019, '#3b3f4a');
        tread.rotation.x = -angle;
      }
    }
    branch(mower, [x * .79, .25, .44], [x * .96, .52, .207], .026, '#394c53');
  }
  branch(mower, [-.286, .52, .208], [.286, .52, .208], .032, '#415763');
  return { root, body, mower };
}

export function littleMonster(kind) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const podMaterial = new THREE.MeshStandardMaterial({ color: '#a2da72', emissive: '#84ce42', emissiveIntensity: .45, roughness: .85 });
  const boss = kind === 'boss';
  const weed = kind === 'weed';
  root.add(body);
  root.scale.setScalar(boss ? 1.96 : weed ? 1.27 : 1.06);
  const petals = boss ? '#e5909d' : weed ? '#b78bdb' : '#af8cda';
  const main = oval(body, 0, .33, 0, .42, .33, .40, boss ? '#a95080' : '#815fc1');
  const skin = matte(boss ? '#a95080' : '#815fc1').clone();
  main.material = skin;
  for (const side of [-1, 1]) {
    oval(body, side * .28, .12, .065, .17, .10, .20, petals);
    const ear = part(body, cone, petals, side * .26, .56, -.07, .14, .39, .12);
    ear.rotation.z = side * -.37;
    oval(body, side * .136, .392, .357, .077, .092, .045, '#fff1d7');
    oval(body, side * .132, .389, .392, .032, .047, .019, '#2a2450');
  }
  roundBox(body, 0, .246, .375, .106, .055, .037, .018, '#4f3166');
  if (weed || boss) {
    for (const side of [-1, 0, 1]) {
      const pod = oval(body, side * .156, .56 + (1 - Math.abs(side)) * .10, -.235, .101, .17, .129, '#a2da72');
      pod.material = podMaterial;
      pod.rotation.z = side * -.29;
      column(body, side * .16, .45, -.23, .063, .115, '#4f6a4d');
    }
  }
  if (boss) {
    for (const side of [-1, 1]) {
      branch(body, [side * .19, .47, -.06], [side * .39, .92, -.045], .05, '#69485c');
      branch(body, [side * .31, .75, -.053], [side * .51, .91, -.081], .035, '#865c69');
      const leaf = oval(body, side * .49, .94, -.075, .145, .061, .109, '#ecb579');
      leaf.rotation.z = side * .38;
      branch(body, [side * .35, .23, .12], [side * .57, .097, .30], .069, '#754a65');
      oval(body, side * .52, .095, .31, .137, .067, .118, '#9e6275');
      oval(body, side * .24, .575, .17, .138, .056, .161, '#d3929b');
    }
    oval(body, 0, .69, .035, .22, .102, .17, '#d17b9c');
  }
  const details = body.children.filter((mesh) => mesh !== main && mesh.material !== podMaterial);
  if (!creatureDetails.has(kind)) {
    const geometries = details.map((mesh) => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      mesh.updateMatrix();
      geometry.applyMatrix4(mesh.matrix);
      const count = geometry.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) mesh.material.color.toArray(colors, i * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
    creatureDetails.set(kind, mergeGeometries(geometries));
    geometries.forEach((geometry) => geometry.dispose());
  }
  body.remove(...details);
  body.add(new THREE.Mesh(creatureDetails.get(kind), detailMaterial));
  return { root, body, podMaterial, skin };
}

export function powerBox() {
  const root = new THREE.Group();
  roundBox(root, 0, .07, 0, .89, .14, .75, .065, '#49646c');
  roundBox(root, 0, .39, 0, .66, .69, .56, .085, '#419879');
  roundBox(root, 0, .74, 0, .69, .11, .60, .044, '#79bc9b');
  roundBox(root, 0, .49, .289, .43, .29, .08, .039, '#234955');
  block(root, -.069, .53, .338, .18, .062, .014, '#b7f58a');
  oval(root, .129, .527, .35, .035, .035, .015, '#fed171');
  for (const x of [-.15, 0, .15]) block(root, x, .31, .303, .094, .022, .013, '#7ac6a0');
  for (const x of [-.29, .29]) column(root, x, .779, .19, .025, .023, '#a4b89e');
  for (let i = 0; i < 4; i++) block(root, .338, .4 + i * .066, -.008, .024, .025, .25, '#38665d');
  return root;
}

export function lampPost() {
  const root = new THREE.Group();
  roundBox(root, 0, .075, 0, .53, .15, .56, .055, '#647786');
  column(root, 0, .69, 0, .069, 1.29, '#426078');
  column(root, 0, .22, 0, .104, .34, '#557588');
  branch(root, [0, 1.31, 0], [0, 1.51, .255], .07, '#547489');
  roundBox(root, 0, 1.51, .31, .44, .19, .40, .056, '#718d9d');
  roundBox(root, 0, 1.59, .31, .374, .10, .338, .036, '#546979');
  for (const x of [-.18, .18]) block(root, x, 1.482, .516, .035, .046, .018, '#98a2a1');
  const bulb = roundBox(root, 0, 1.414, .31, .33, .078, .29, .027, '#8e9d94');
  bulb.material = new THREE.MeshStandardMaterial({ color: '#8e9d94', emissive: '#ffc176', emissiveIntensity: 0 });
  return { root, bulb };
}

export function tree(parent, x, z, scale, color) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.scale.setScalar(scale);
  parent.add(root);
  column(root, 0, .45, 0, .14, .90, '#594763');
  oval(root, 0, 1.20, 0, .58, .72, .54, color);
  oval(root, -.31, .97, .18, .39, .49, .36, color);
  oval(root, .32, 1.06, -.13, .38, .49, .35, color);
  return root;
}
