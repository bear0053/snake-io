export const DIRS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

export function isOpposite(a, b) {
  if (!a || !b) return false;
  return DIRS[a].x === -DIRS[b].x && DIRS[a].y === -DIRS[b].y;
}

export class Snake {
  constructor({ gridSize, skinId = "default" }) {
    const start = Math.floor(gridSize / 2);
    this.segments = [
      { x: start, y: start },
      { x: start - 1, y: start },
      { x: start - 2, y: start }
    ];
    this.prevSegments = this.segments.map(s => ({ ...s }));
    this.direction = "RIGHT";
    this.pendingDirections = [];
    this.pendingGrowth = 0;
    this.skinId = skinId;
    this.activeEffects = [];
    this.alive = true;
    this.trailParticles = [];
  }

  requestDirection(dir) {
    const last = this.pendingDirections.at(-1) ?? this.direction;
    if (dir === last) return;
    if (isOpposite(dir, last)) return;
    if (this.pendingDirections.length >= 2) return;
    this.pendingDirections.push(dir);
  }

  hasEffect(type) {
    return this.activeEffects.some(e => e.type === type);
  }

  head() {
    return this.segments[0];
  }
}

export function makeFood(x, y, type, points) {
  return { x, y, type, points, spawnedAt: performance.now(), sparklePhase: Math.random() * Math.PI * 2 };
}

export function makePowerUp(x, y, type) {
  return { x, y, type, spawnedAt: performance.now() };
}

export function makeObstacle(x, y, type, dangerous) {
  return { x, y, type, dangerous, seed: Math.random() };
}

export function cellsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function isCellFree(x, y, gridSize, occupied) {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return false;
  for (const cell of occupied) {
    if (cell.x === x && cell.y === y) return false;
  }
  return true;
}

export function randomFreeCell(gridSize, occupied, rng = Math.random) {
  const maxAttempts = gridSize * gridSize * 4;
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.floor(rng() * gridSize);
    const y = Math.floor(rng() * gridSize);
    if (isCellFree(x, y, gridSize, occupied)) return { x, y };
  }
  return null;
}
