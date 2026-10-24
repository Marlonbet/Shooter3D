import * as THREE from 'three';
import { ARENA } from './config.js';
import { world } from './world.js';

const GRID_SIZE = 1.0;
const GRID_RADIUS = Math.floor(ARENA / GRID_SIZE);
const OFFSET = ARENA;

export const navMesh = {
  grid: [],
  cols: GRID_RADIUS * 2,
  rows: GRID_RADIUS * 2,
  offset: OFFSET,
  cellSize: GRID_SIZE,
  
  build() {
    this.cols = Math.floor((ARENA * 2) / GRID_SIZE);
    this.rows = Math.floor((ARENA * 2) / GRID_SIZE);
    this.grid = [];
    
    // Inicializar todo como caminable
    for (let x = 0; x < this.cols; x++) {
      this.grid[x] = [];
      for (let z = 0; z < this.rows; z++) {
        this.grid[x][z] = true;
      }
    }
    
    // Inflar obstáculos por el radio del bot (0.55) + margen (0.2)
    const botRadius = 0.75;
    
    for (const obs of world.obstacles) {
      const minX = Math.floor((obs.box.min.x - botRadius + OFFSET) / GRID_SIZE);
      const maxX = Math.ceil((obs.box.max.x + botRadius + OFFSET) / GRID_SIZE);
      const minZ = Math.floor((obs.box.min.z - botRadius + OFFSET) / GRID_SIZE);
      const maxZ = Math.ceil((obs.box.max.z + botRadius + OFFSET) / GRID_SIZE);
      
      for (let x = Math.max(0, minX); x <= Math.min(this.cols - 1, maxX); x++) {
        for (let z = Math.max(0, minZ); z <= Math.min(this.rows - 1, maxZ); z++) {
          this.grid[x][z] = false;
        }
      }
    }
  },
  
  isWalkable(x, z) {
    const gx = Math.floor((x + OFFSET) / GRID_SIZE);
    const gz = Math.floor((z + OFFSET) / GRID_SIZE);
    if (gx < 0 || gx >= this.cols || gz < 0 || gz >= this.rows) return false;
    return this.grid[gx][gz];
  },
  
  gridToWorld(gx, gz) {
    return new THREE.Vector3(
      gx * GRID_SIZE - OFFSET + GRID_SIZE / 2,
      0,
      gz * GRID_SIZE - OFFSET + GRID_SIZE / 2
    );
  },
  
  worldToGrid(x, z) {
    return {
      x: Math.floor((x + OFFSET) / GRID_SIZE),
      z: Math.floor((z + OFFSET) / GRID_SIZE)
    };
  },
  
  getClosestWalkable(x, z) {
    if (this.isWalkable(x, z)) return new THREE.Vector3(x, 0, z);
    const gridPos = this.worldToGrid(x, z);
    let bestDist = Infinity;
    let bestPoint = new THREE.Vector3(0, 0, 0);
    
    for (let dx = -10; dx <= 10; dx++) {
      for (let dz = -10; dz <= 10; dz++) {
        const nx = gridPos.x + dx;
        const nz = gridPos.z + dz;
        if (nx >= 0 && nx < this.cols && nz >= 0 && nz < this.rows && this.grid[nx][nz]) {
          const wx = nx * GRID_SIZE - OFFSET + GRID_SIZE / 2;
          const wz = nz * GRID_SIZE - OFFSET + GRID_SIZE / 2;
          const d = (x - wx) ** 2 + (z - wz) ** 2;
          if (d < bestDist) {
            bestDist = d;
            bestPoint.set(wx, 0, wz);
          }
        }
      }
    }
    return bestPoint;
  },
  
  findPath(startPos, endPos) {
    const start = this.worldToGrid(startPos.x, startPos.z);
    const end = this.worldToGrid(endPos.x, endPos.z);
    
    if (!this.grid[end.x] || !this.grid[end.x][end.z]) {
      const closest = this.getClosestWalkable(endPos.x, endPos.z);
      const cGrid = this.worldToGrid(closest.x, closest.z);
      end.x = cGrid.x;
      end.z = cGrid.z;
    }
    
    const startNode = { x: start.x, z: start.z, g: 0, h: 0, f: 0, parent: null };
    const endNode = { x: end.x, z: end.z };
    
    const openList = [startNode];
    const closedList = new Set();
    const nodeMap = new Map();
    nodeMap.set(`${start.x},${start.z}`, startNode);
    
    const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
    
    while (openList.length > 0) {
      openList.sort((a, b) => a.f - b.f);
      const current = openList.shift();
      
      if (current.x === endNode.x && current.z === endNode.z) {
        const path = [];
        let curr = current;
        while (curr) {
          path.push(this.gridToWorld(curr.x, curr.z));
          curr = curr.parent;
        }
        return path.reverse();
      }
      
      closedList.add(`${current.x},${current.z}`);
      const dirs = [
        { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 },
        { x: 1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: 1 }, { x: -1, z: -1 }
      ];
      
      for (const dir of dirs) {
        const nx = current.x + dir.x;
        const nz = current.z + dir.z;
        
        if (nx < 0 || nx >= this.cols || nz < 0 || nz >= this.rows) continue;
        if (!this.grid[nx][nz]) continue;
        if (closedList.has(`${nx},${nz}`)) continue;
        
        if (dir.x !== 0 && dir.z !== 0) {
          if (!this.grid[current.x + dir.x][current.z] || !this.grid[current.x][current.z + dir.z]) continue;
        }
        
        const gScore = current.g + (dir.x !== 0 && dir.z !== 0 ? 1.414 : 1);
        const key = `${nx},${nz}`;
        let neighbor = nodeMap.get(key);
        
        if (!neighbor) {
          neighbor = { x: nx, z: nz, g: Infinity, h: 0, f: 0, parent: null };
          nodeMap.set(key, neighbor);
        }
        
        if (gScore < neighbor.g) {
          neighbor.parent = current;
          neighbor.g = gScore;
          neighbor.h = heuristic(neighbor, endNode);
          neighbor.f = neighbor.g + neighbor.h;
          
          if (!openList.includes(neighbor)) {
            openList.push(neighbor);
          }
        }
      }
    }
    return [];
  },
  
  getSmoothPath(path) {
    if (path.length <= 2) return path;
    const smooth = [path[0]];
    let currentIdx = 0;
    while (currentIdx < path.length - 1) {
      let farthestVisible = currentIdx + 1;
      for (let i = path.length - 1; i > currentIdx; i--) {
        if (this.isLineWalkable(path[currentIdx], path[i])) {
          farthestVisible = i;
          break;
        }
      }
      smooth.push(path[farthestVisible]);
      currentIdx = farthestVisible;
    }
    return smooth;
  },
  
  isLineWalkable(p1, p2) {
    const dist = p1.distanceTo(p2);
    const steps = Math.ceil(dist / 0.5);
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    for (let i = 1; i < steps; i++) {
      const test = p1.clone().addScaledVector(dir, i * 0.5);
      if (!this.isWalkable(test.x, test.z)) return false;
    }
    return true;
  }
};