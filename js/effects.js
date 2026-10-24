import * as THREE from 'three';
import { scene } from './three-setup.js';

export const effects = [];

export function addTracer(from, to, color, opacity = 0.95) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = new THREE.LineBasicMaterial({ color, transparent:true, opacity });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  effects.push({ obj: line, life: 0.07, maxLife: 0.07, type: 'tracer' });
}

export function addImpact(pos, color) {
  const geo = new THREE.SphereGeometry(0.09, 6, 6);
  const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  effects.push({ obj: mesh, life: 0.26, maxLife: 0.26, type: 'impact' });
}

export function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    const t = Math.max(0, e.life / e.maxLife);
    if (e.type === 'tracer') e.obj.material.opacity = t * 0.95;
    else { e.obj.material.opacity = t; e.obj.scale.setScalar(1 + (1 - t) * 2.6); }
    if (e.life <= 0) {
      scene.remove(e.obj);
      e.obj.geometry.dispose();
      e.obj.material.dispose();
      effects.splice(i, 1);
    }
  }
}

export function clearEffects() {
  for (const e of effects) {
    scene.remove(e.obj);
    e.obj.geometry.dispose();
    e.obj.material.dispose();
  }
  effects.length = 0;
}