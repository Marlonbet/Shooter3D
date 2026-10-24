import * as THREE from 'three';
import { scene } from './three-setup.js';
import { ARENA } from './config.js';

export const world = {
  group: new THREE.Group(),
  obstacles: [],
  obstacleMeshes: []
};
scene.add(world.group);

export const rand = (a, b) => a + Math.random() * (b - a);

export function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

export function clearWorld() {
  disposeGroup(world.group);
  scene.remove(world.group);
  world.group = new THREE.Group();
  scene.add(world.group);
  world.obstacles = [];
  world.obstacleMeshes = [];
}

export function addBox(x, y, z, w, h, d, color, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.08,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  world.group.add(mesh);
  if (opts.collide !== false) {
    world.obstacles.push({ box: new THREE.Box3(
      new THREE.Vector3(x - w/2, y - h/2, z - d/2),
      new THREE.Vector3(x + w/2, y + h/2, z + d/2)) });
    world.obstacleMeshes.push(mesh);
  }
  return mesh;
}

export function addRock(x, z, r, color) {
  const geo = new THREE.IcosahedronGeometry(r, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness:1, metalness:0, flatShading:true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, r * 0.82, z);
  mesh.rotation.set(rand(0,3), rand(0,3), rand(0,3));
  mesh.castShadow = mesh.receiveShadow = true;
  world.group.add(mesh);
  world.obstacles.push({ box: new THREE.Box3(
    new THREE.Vector3(x - r*0.8, 0, z - r*0.8),
    new THREE.Vector3(x + r*0.8, r*1.7, z + r*0.8)) });
  world.obstacleMeshes.push(mesh);
  return mesh;
}

export function addFloor(color) {
  const geo = new THREE.PlaneGeometry(ARENA*2.6, ARENA*2.6);
  const mat = new THREE.MeshStandardMaterial({ color, roughness:0.95, metalness:0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI/2;
  mesh.receiveShadow = true;
  world.group.add(mesh);
}

export function addPerimeterWalls(color) {
  const T = 1.6, H = 8;
  addBox(0, H/2, -ARENA-0.8, ARENA*2+3, H, T, color);
  addBox(0, H/2,  ARENA+0.8, ARENA*2+3, H, T, color);
  addBox(-ARENA-0.8, H/2, 0, T, H, ARENA*2+3, color);
  addBox( ARENA+0.8, H/2, 0, T, H, ARENA*2+3, color);
}

export function scatter(count, sizeMin, sizeMax, colors, hMin = 1.6, hMax = 5.2, clearRadius = 9) {
  let placed = 0, tries = 0;
  while (placed < count && tries < 800) {
    tries++;
    const w = rand(sizeMin, sizeMax), d = rand(sizeMin, sizeMax), h = rand(hMin, hMax);
    const x = rand(-ARENA + 4, ARENA - 4), z = rand(-ARENA + 4, ARENA - 4);
    if (Math.hypot(x, z) < clearRadius) continue;
    const testBox = new THREE.Box3(
      new THREE.Vector3(x - w/2, 0, z - d/2),
      new THREE.Vector3(x + w/2, h, z + d/2));
    let bad = false;
    for (const o of world.obstacles) {
      if (o.box.clone().expandByScalar(2.4).intersectsBox(testBox)) { bad = true; break; }
    }
    if (bad) continue;
    addBox(x, h/2, z, w, h, d, colors[(Math.random() * colors.length) | 0]);
    placed++;
  }
}

export function collides(x, z, r) {
  for (let i = 0; i < world.obstacles.length; i++) {
    const b = world.obstacles[i].box;
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
  }
  return false;
}