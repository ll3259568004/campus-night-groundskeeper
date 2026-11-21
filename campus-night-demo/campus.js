import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { block, column, matte, oval, roundBox, tree } from './models.js';

const steel = '#435365';
const edge = '#8092a0';
const rubber = '#292b35';
const wood = '#94663d';
const lightWood = '#c79456';
const dirtyWhite = '#d4d5bd';
const tileTextureSize = 64;

export function paverTexture() {
  const data = new Uint8Array(tileTextureSize * tileTextureSize * 4);
  for (let y = 0; y < tileTextureSize; y++) {
    for (let x = 0; x < tileTextureSize; x++) {
      const u = x % 32;
      const v = y % 32;
      const noise = ((x * 211 + y * 151 + x * y * 47) % 23) / 23;
      const seam = Math.min(u, v, 32 - u, 32 - v);
      const slab = (x < 32) === (y < 32) ? 221 : 230;
      const value = seam < 1 ? 140 : seam < 2 ? 179 : slab + noise * 12 + (v < 4 ? 6 : 0);
      data.set([value, value, value, 255], (y * tileTextureSize + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, tileTextureSize, tileTextureSize, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function put(scene, x, z, heading = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return group;
}

function batch(group) {
  const byMaterial = new Map();
  for (const mesh of group.children) {
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(geometry);
  }
  group.remove(...group.children.filter((child) => child.isMesh));
  for (const [material, geometries] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    geometries.forEach((geometry) => geometry.dispose());
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function pipe(parent, from, to, radius, color) {
  const start = new THREE.Vector3(...from);
  const delta = new THREE.Vector3(...to).sub(start);
  const center = start.addScaledVector(delta, .5);
  const body = column(parent, center.x, center.y, center.z, radius, delta.length(), color);
  body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
}

function crate(group, x, y, z, s = .65, angle = 0) {
  const box = new THREE.Group();
  box.position.set(x, y + s / 2, z);
  box.rotation.y = angle;
  group.add(box);
  block(box, 0, 0, 0, s, s, s, wood);
  for (const k of [-1, 1]) {
    block(box, 0, k * s * .43, 0, s * 1.05, s * .12, s * 1.06, lightWood);
    block(box, k * s * .44, 0, s * .513, s * .12, s * .84, s * .042, lightWood);
    const diagonal = block(box, 0, 0, s * .516, s * .11, s * 1.13, s * .033, lightWood);
    diagonal.rotation.z = k * .76;
  }
  for (let i = -1; i <= 1; i++) block(box, i * s * .24, s * .502, 0, s * .019, s * .009, s * .83, '#805634');
  batch(box);
}

function tires(group, x, z, count) {
  const geometry = new THREE.TorusGeometry(.255, .097, 6, 16);
  for (let i = 0; i < count; i++) {
    const tire = new THREE.Mesh(geometry, matte(rubber));
    tire.rotation.x = -Math.PI / 2;
    tire.position.set(x + i * .055, .092 + i * .157, z);
    group.add(tire);
    for (let step = 0; step < 11; step++) {
      const theta = (step / 11) * Math.PI * 2 + i * .2;
      const tread = block(group, tire.position.x + Math.cos(theta) * .347, tire.position.y,
        z + Math.sin(theta) * .347, .031, .105, .077, '#363641');
      tread.rotation.y = -theta;
    }
  }
}

function maintenanceShed(scene, x, z, color, heading) {
  const group = put(scene, x, z, heading);
  const w = 4.6;
  const d = 2.8;
  const front = d / 2;
  const h = 2.52;
  roundBox(group, 0, .086, 0, w + .22, .17, d + .19, .042, '#5a6069');
  block(group, 0, h / 2, 0, w, h, d, color);
  for (let i = -10; i <= 10; i++) {
    const u = i * .205;
    block(group, u, 1.29, -front - .012, .071, 2.4, .073, color);
    if (Math.abs(i) > 6) block(group, u, 1.29, front + .012, .071, 2.4, .073, color);
    block(group, u, h + .159, 0, .076, .057, d + .32, i % 2 ? '#617081' : '#6b7885');
  }
  for (let j = -5; j <= 5; j++) {
    for (const side of [-1, 1]) block(group, side * (w / 2 + .03), 1.29, j * .234, .078, 2.4, .069, color);
  }
  roundBox(group, 0, h + .07, 0, w + .37, .17, d + .40, .047, steel);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      block(group, side * w / 2, 1.31, end * front, .135, 2.49, .135, edge);
    }
    block(group, side * w / 2, .22, 0, .104, .114, d + .03, steel);
  }
  block(group, 0, 1.02, front + .053, 2.54, 1.95, .13, '#273345');
  block(group, 0, 1.02, front + .13, 2.27, 1.77, .052, '#657385');
  for (let i = 0; i < 12; i++) {
    const y = .23 + i * .137;
    block(group, 0, y, front + .174, 2.29, .061, .038, i % 2 ? '#475663' : '#526171');
  }
  for (const xSide of [-1, 1]) block(group, xSide * 1.23, 1.06, front + .198, .102, 1.91, .081, steel);
  roundBox(group, 0, 1.98, front + .193, 2.64, .16, .20, .032, edge);
  block(group, 0, 2.21, front + .071, 1.30, .25, .068, '#2f3d4d');
  for (let j = 0; j < 5; j++) block(group, -.45 + j * .22, 2.22, front + .117, .142, .043, .018, '#d3b885');
  for (const px of [-1.86, 1.86]) {
    block(group, px, .38, front + .073, .13, .49, .053, '#c5a358');
    for (let j = 0; j < 3; j++) block(group, px, .26 + j * .12, front + .108, .134, .049, .02, '#4a4651');
  }
  pipe(group, [-2.02, 1.84, front + .25], [-2.02, .10, front + .25], .084, '#87919d');
  pipe(group, [-2.02, 1.84, front + .25], [-1.64, 2.09, front + .24], .082, '#87919d');
  pipe(group, [-1.64, 2.09, front + .24], [-1.38, 2.09, front + .106], .082, '#87919d');
  oval(group, -2.02, 1.84, front + .25, .084, .084, .084, '#87919d');
  roundBox(group, 1.67, 2.62, -.71, .77, .40, .62, .08, '#3f4c58');
  for (let i = 0; i < 5; i++) block(group, 1.42 + i * .128, 2.83, -.71, .032, .023, .41, '#98a0a1');
  crate(group, 2.02, 0, front + .69, .67, .17);
  crate(group, 2.11, .67, front + .72, .53, -.15);
  crate(group, 2.66, 0, front + .23, .49, -.21);
  batch(group);
}

function bench(scene, x, z, heading) {
  const group = put(scene, x, z, heading);
  for (const end of [-.72, .72]) {
    block(group, end, .21, 0, .116, .42, .61, steel);
    block(group, end, .54, -.25, .091, .58, .078, steel);
  }
  for (let i = -1; i <= 1; i++) {
    roundBox(group, 0, .44, i * .155, 1.83, .085, .126, .028, '#b77a48');
    roundBox(group, 0, .588 + (i + 1) * .120, -.287, 1.83, .10, .08, .027, '#a96b43');
  }
  batch(group);
}

function corner(scene, x, z, angle) {
  const group = put(scene, x, z, angle);
  crate(group, -.55, 0, .11, .59, .22);
  crate(group, -.55, .59, .1, .45, -.18);
  crate(group, .08, 0, .16, .63, .13);
  tires(group, .93, -.1, 2);
  for (const px of [-.85, 1.33]) {
    block(group, px, .042, 1, .34, .08, .34, rubber);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(.058, .142, .34, 8), matte('#d38b50'));
    cone.position.set(px, .24, 1);
    group.add(cone);
    column(group, px, .222, 1, .109, .054, dirtyWhite);
  }
  roundBox(group, 1.18, .36, -.76, .53, .64, .53, .08, '#536f64');
  roundBox(group, 1.18, .70, -.77, .58, .11, .57, .04, '#6a8874');
  block(group, 1.18, .54, -.487, .22, .056, .019, '#354b45');
  for (let i = 0; i < 4; i++) {
    const board = block(group, -.68 + i * .055, .031 + i * .033, -.59, 1.07, .042, .09, i % 2 ? lightWood : wood);
    board.rotation.y = .11 + i * .22;
  }
  batch(group);
}

function soccerMarkings(scene, cols, rows) {
  const group = put(scene, 0, 0);
  const paint = '#aebdb3';
  const halfX = cols / 2 - .65;
  const halfZ = rows / 2 - .64;
  for (const side of [-1, 1]) {
    block(group, 0, .029, side * halfZ, halfX * 2, .008, .045, paint);
    block(group, side * halfX, .029, 0, .043, .008, halfZ * 2, paint);
    block(group, side * (halfX - 2), .028, 0, .035, .008, 4.5, paint);
    block(group, side * (halfX - 1), .028, -2.25, 1.98, .008, .036, paint);
    block(group, side * (halfX - 1), .028, 2.25, 1.98, .008, .036, paint);
  }
  block(group, 0, .029, 0, .041, .008, halfZ * 2, paint);
  const circle = new THREE.Mesh(new THREE.RingGeometry(2.08, 2.12, 48), matte(paint));
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = .031;
  group.add(circle);
}

export function addCampus(scene, cols, rows, texture) {
  const plazaTexture = texture.clone();
  plazaTexture.repeat.set(84, 84);
  plazaTexture.needsUpdate = true;
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(84, 84), new THREE.MeshStandardMaterial({
    color: '#72777c', map: plazaTexture, roughness: .97,
  }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -.047;
  plaza.receiveShadow = true;
  scene.add(plaza);
  soccerMarkings(scene, cols, rows);
  maintenanceShed(scene, -5.2, -11.14, '#79433d', 0);
  maintenanceShed(scene, 6.88, -11.9, '#876945', -.17);
  bench(scene, .02, -9.18, -.12);
  bench(scene, 10.9, -9.29, -.17);
  bench(scene, -5.3, 9.38, Math.PI);
  corner(scene, -15.94, -2.25, .32);
  corner(scene, 15.4, 2.75, -.79);
  corner(scene, 4.5, 10.4, Math.PI);
  for (const [x, z, scale, color] of [
    [-12.85, -10.9, 1.45, '#4b633b'], [-11.1, -11.84, 1.14, '#526a3d'],
    [.34, -11.15, 1.42, '#536b44'], [11.9, -10.87, 1.60, '#4c643b'],
    [-15.76, 6.8, 1.55, '#4a623b'], [15.68, 8.65, 1.49, '#647349'],
    [10.84, 10.74, 1.38, '#435b40'], [-10.8, 10.88, 1.50, '#4d653b'],
    [16.54, -5.11, 1.45, '#4c623e'],
  ]) {
    const planter = roundBox(scene, x, .095, z, 1.18, .20, 1.18, .09, '#657071');
    planter.receiveShadow = planter.castShadow = true;
    const model = tree(scene, x, z, scale, color);
    model.position.y = .15;
    batch(model);
  }
  const scrap = put(scene, 0, 0);
  for (let i = 0; i < 156; i++) {
    const col = (i * 31 % 151) / 151;
    const row = (i * 73 % 151) / 151;
    const x = (col * 2 - 1) * 17.0;
    const z = (row * 2 - 1) * 12.2;
    const decal = block(scrap, x, .036, z, .047 + (i % 5) * .021, .009, .051 + (i % 3) * .024,
      i % 9 === 0 ? '#b49a67' : i % 4 === 0 ? '#9ca295' : '#bfc4af');
    decal.rotation.y = i * 2.39;
  }
  batch(scrap);
  for (const mesh of scrap.children) mesh.castShadow = false;
}
