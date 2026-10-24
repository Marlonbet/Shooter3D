import * as THREE from 'three';
import { isMobile } from './config.js';

export const canvas = document.getElementById('game');

export const renderer = new THREE.WebGLRenderer({
  canvas, antialias:!isMobile, powerPreference:'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(76, window.innerWidth/window.innerHeight, 0.08, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x334455, 0.75);
scene.add(hemi);

export const sun = new THREE.DirectionalLight(0xffffff, 1.85);
sun.position.set(34, 56, 22);
sun.castShadow = true;
const shadowSize = isMobile ? 1024 : 2048;
sun.shadow.mapSize.set(shadowSize, shadowSize);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

export const fillLight = new THREE.DirectionalLight(0x88bbff, 0.45);
fillLight.position.set(-28, 22, -30);
scene.add(fillLight);

/* -------- Viewmodel del arma -------- */
export const gunGroup = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color:0x1e242e, metalness:0.85, roughness:0.34 });
  const dark  = new THREE.MeshStandardMaterial({ color:0x11151b, metalness:0.7,  roughness:0.5 });
  const glow  = new THREE.MeshBasicMaterial({ color:0x4dffd0 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.52), metal);
  body.position.set(0, 0, -0.16); gunGroup.add(body);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.42, 10), dark);
  barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.015, -0.55); gunGroup.add(barrel);

  const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), metal);
  muzzleRing.rotation.x = Math.PI/2; muzzleRing.position.set(0, 0.015, -0.74); gunGroup.add(muzzleRing);

  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.22, 0.13), dark);
  mag.position.set(0, -0.16, -0.14); mag.rotation.x = 0.18; gunGroup.add(mag);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.19, 0.1), dark);
  grip.position.set(0, -0.15, 0.08); grip.rotation.x = -0.3; gunGroup.add(grip);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), dark);
  sight.position.set(0, 0.095, -0.22); gunGroup.add(sight);

  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), glow);
  dot.position.set(0, 0.115, -0.3); gunGroup.add(dot);

  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.3), glow);
  strip.position.set(0.058, 0.02, -0.2); gunGroup.add(strip);

  gunGroup.position.set(0.25, -0.21, -0.48);
  gunGroup.rotation.set(0, 0.06, 0);
  if (isMobile) gunGroup.scale.setScalar(1.1);
  camera.add(gunGroup);
}

export const gunLight = new THREE.PointLight(0x66ddff, 0.9, 4.5, 2);
gunLight.position.set(0.3, -0.1, -0.4);
camera.add(gunLight);