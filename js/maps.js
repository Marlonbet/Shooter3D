import * as THREE from 'three';
import { scene, hemi, sun, fillLight } from './three-setup.js';
import { ARENA } from './config.js';
import { world, addBox, addRock, addFloor, addPerimeterWalls, scatter, clearWorld, rand } from './world.js';
import { navMesh } from './navmesh.js'; // <--- IMPORTANTE: Importar el NavMesh

export function buildMap(index) {
  clearWorld();
  scene.fog = null;
  
  if (index === 0) {
    buildWarehouse();
  } else if (index === 1) {
    buildDesert();
  } else {
    buildNeon();
  }
  
  const wallColor = index === 2 ? 0x0d1024 : (index === 1 ? 0x9c7a52 : 0x3c4556);
  addPerimeterWalls(wallColor);

  // MAPEAR EL NAVMESH DESPUÉS DE CONSTRUIR EL MAPA Y LAS PAREDES
  navMesh.build();
}

function buildWarehouse() {
  scene.background = new THREE.Color(0x1a2130);
  scene.fog = new THREE.Fog(0x1a2130, 48, 118);
  
  hemi.color.setHex(0xcfe4ff); 
  hemi.groundColor.setHex(0x2a3038); 
  hemi.intensity = 0.85;
  
  sun.color.setHex(0xfff2dd); 
  sun.intensity = 1.9; 
  fillLight.intensity = 0.5;
  
  addFloor(0x2b313d);

  const grid = new THREE.GridHelper(ARENA * 2, 34, 0x445066, 0x333b4a);
  grid.position.y = 0.02; 
  grid.material.opacity = 0.35; 
  grid.material.transparent = true;
  world.group.add(grid);

  addBox(-17, 2.2, -8, 1.4, 4.4, 22, 0x3a4354);
  addBox( 17, 2.2,  8, 1.4, 4.4, 22, 0x3a4354);
  addBox( 2, 2.2, -22, 24, 4.4, 1.4, 0x3a4354);
  addBox(-4, 2.2,  22, 24, 4.4, 1.4, 0x3a4354);
  addBox(-24, 1.6, 20, 12, 3.2, 1.2, 0x424c5e);
  addBox( 24, 1.6, -20, 12, 3.2, 1.2, 0x424c5e);
  
  scatter(20, 1.8, 3.6, [0x8a5a2b, 0xa06a35, 0x6e4a25, 0x96683a], 1.6, 4.6, 9);

  for (let i = 0; i < 5; i++) {
    const x = rand(-26, 26);
    const z = rand(-26, 26);
    if (Math.hypot(x, z) < 11) continue;
    const s = rand(1.4, 2.0);
    addBox(x, s/2, z, s, s, s, 0x8a5a2b);
    addBox(x + rand(-0.3, 0.3), s + s * 0.5, z + rand(-0.3, 0.3), s * 0.85, s * 0.85, s * 0.85, 0xa06a35);
  }
  
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    addBox(Math.cos(a) * 24, 5, Math.sin(a) * 24, 1.8, 10, 1.8, 0x4a5568, { metal: 0.4, rough: 0.5 });
  }
}

function buildDesert() {
  scene.background = new THREE.Color(0xe8c48a);
  scene.fog = new THREE.Fog(0xe8c48a, 42, 135);
  
  hemi.color.setHex(0xffe9c0); 
  hemi.groundColor.setHex(0xb08050); 
  hemi.intensity = 1.0;
  
  sun.color.setHex(0xffd9a0); 
  sun.intensity = 2.35;
  
  fillLight.intensity = 0.32; 
  fillLight.color.setHex(0xffbb77);
  
  addFloor(0xd4ae77);

  for (let i = 0; i < 16; i++) {
    const geo = new THREE.SphereGeometry(rand(4, 9), 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd9b47e, roughness: 1 }));
    m.position.set(rand(-40, 40), -0.6, rand(-40, 40));
    m.scale.y = rand(0.18, 0.35); 
    m.receiveShadow = true;
    world.group.add(m);
  }

  addBox(-14, 2.5, -12, 12, 5, 1.3, 0xbfa079, { rough: 1 });
  addBox(-8, 2.5, -6, 1.3, 5, 13, 0xbfa079, { rough: 1 });
  addBox( 15, 2.0, 10, 1.3, 4, 16, 0xb99a73, { rough: 1 });
  addBox( 15, 2.0, 2, 14, 4, 1.3, 0xb99a73, { rough: 1 });
  addBox( 0, 3.0, -24, 18, 6, 1.4, 0xc7a87f, { rough: 1 });

  for (let i = 0; i < 22; i++) {
    const x = rand(-ARENA + 4, ARENA - 4);
    const z = rand(-ARENA + 4, ARENA - 4);
    if (Math.hypot(x, z) < 9) continue;
    
    const r = rand(1.3, 3.6);
    const testBox = new THREE.Box3(
      new THREE.Vector3(x - r, 0, z - r),
      new THREE.Vector3(x + r, r * 2, z + r)
    );
    
    let bad = false;
    for (const o of world.obstacles) {
      if (o.box.clone().expandByScalar(1.8).intersectsBox(testBox)) { 
        bad = true; 
        break; 
      }
    }
    if (bad) continue;
    
    addRock(x, z, r, [0x8f6f4c, 0xa07b52, 0x7d5f40][(Math.random() * 3) | 0]);
  }

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    addBox(Math.cos(a) * 19, 3.5, Math.sin(a) * 19, 1.6, 7, 1.6, 0xb59468, { rough: 1 });
  }
}

function buildNeon() {
  scene.background = new THREE.Color(0x06060f);
  scene.fog = new THREE.Fog(0x08081a, 30, 105);
  
  hemi.color.setHex(0x3355ff); 
  hemi.groundColor.setHex(0x110022); 
  hemi.intensity = 0.55;
  
  sun.color.setHex(0x9ecbff); 
  sun.intensity = 0.75;
  
  fillLight.intensity = 0.55; 
  fillLight.color.setHex(0xff44cc);
  
  addFloor(0x0b0b16);

  const grid = new THREE.GridHelper(ARENA * 2, 40, 0x00e5ff, 0x2a1a55);
  grid.position.y = 0.03; 
  grid.material.opacity = 0.55; 
  grid.material.transparent = true;
  world.group.add(grid);

  const neonColors = [0x00e5ff, 0xff00d5, 0x8b5cff, 0x00ffa3];
  const pillars = [
    [-16, -16], [16, -16], [-16, 16], [16, 16],
    [0, -24], [0, 24], [-24, 0], [24, 0],
    [-9, -9], [9, -9], [-9, 9], [9, 9]
  ];
  
  pillars.forEach(([x, z], i) => {
    const h = rand(5, 10);
    addBox(x, h / 2, z, 1.5, h, 1.5, 0x12122a, { metal: 0.6, rough: 0.35 });
    
    const c = neonColors[i % neonColors.length];
    
    for (let k = 0; k < 2; k++) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, h * 0.8, 0.09),
        new THREE.MeshBasicMaterial({ color: c })
      );
      strip.position.set(x + (k ? 0.78 : -0.78), h / 2, z);
      world.group.add(strip);
    }
    
    const ring = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 0.1, 1.75),
      new THREE.MeshBasicMaterial({ color: c })
    );
    ring.position.set(x, h, z);
    world.group.add(ring);
  });

  scatter(14, 1.8, 3.4, [0x161630, 0x1c1c3d, 0x101024], 1.6, 4.4, 9);

  for (let i = 0; i < 10; i++) {
    const c = neonColors[(Math.random() * neonColors.length) | 0];
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(rand(1.2, 3), 0.16, rand(0.3, 0.6)),
      new THREE.MeshBasicMaterial({ color: c })
    );
    m.position.set(rand(-28, 28), rand(3.2, 6.5), rand(-28, 28));
    m.rotation.y = rand(0, Math.PI);
    world.group.add(m);
  }

  const l1 = new THREE.PointLight(0x00e5ff, 90, 42, 2); 
  l1.position.set(-16, 8, -16); 
  world.group.add(l1);
  
  const l2 = new THREE.PointLight(0xff00d5, 90, 42, 2); 
  l2.position.set(16, 8, 16); 
  world.group.add(l2);
  
  const l3 = new THREE.PointLight(0x8b5cff, 70, 36, 2); 
  l3.position.set(0, 9, -22); 
  world.group.add(l3);
}