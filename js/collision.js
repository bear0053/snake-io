export function wrapPosition(pos, gridSize) {
  return {
    x: ((pos.x % gridSize) + gridSize) % gridSize,
    y: ((pos.y % gridSize) + gridSize) % gridSize
  };
}

// Returns 'wall' | 'self' | 'obstacle' | null
export function detectFatalCollision(head, level, bodyToCheck, obstacles) {
  const inBounds = head.x >= 0 && head.y >= 0 && head.x < level.gridSize && head.y < level.gridSize;
  if (!inBounds && !level.mechanics.wraparound) return "wall";

  for (const seg of bodyToCheck) {
    if (seg.x === head.x && seg.y === head.y) return "self";
  }

  for (const obs of obstacles) {
    if (obs.dangerous && obs.x === head.x && obs.y === head.y) return "obstacle";
  }

  return null;
}
