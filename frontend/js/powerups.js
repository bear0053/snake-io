// Power-up registry: data-driven effects. Collision/engine code stays generic by
// consulting these hooks instead of branching on power-up type directly.
// onCollect(game)                  - called once when the snake picks up the entity
// onTick(game, effect, dtMs)       - called every game tick while the effect is active
// onExpire(game, effect)           - called once when a timed effect's duration runs out
// onCollisionAbsorb(game, effect)  - called on a fatal collision; return true to absorb the hit and keep playing

function addTimedEffect(snake, type, durationMs, meta = {}) {
  const existing = snake.activeEffects.find(e => e.type === type);
  if (existing) {
    existing.remainingMs = durationMs;
  } else {
    snake.activeEffects.push({ type, remainingMs: durationMs, ...meta });
  }
}

function pullNearbyFoodToward(game, radius) {
  const head = game.snake.head();
  for (const food of game.foods) {
    const dx = food.x - head.x;
    const dy = food.y - head.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist === 0 || dist > radius) continue;
    if (Math.abs(dx) >= Math.abs(dy)) {
      food.x += dx > 0 ? -1 : 1;
    } else {
      food.y += dy > 0 ? -1 : 1;
    }
    food.x = Math.max(0, Math.min(game.level.gridSize - 1, food.x));
    food.y = Math.max(0, Math.min(game.level.gridSize - 1, food.y));
  }
}

export const POWER_UPS = {
  shield: {
    id: "shield",
    name: "Shield",
    icon: "🛡",
    color: "#42a5f5",
    hudDuration: null,
    onCollect(game) {
      addTimedEffect(game.snake, "shield", Infinity);
    },
    onCollisionAbsorb(game, effect) {
      game.snake.activeEffects = game.snake.activeEffects.filter(e => e !== effect);
      return true;
    }
  },
  magnet: {
    id: "magnet",
    name: "Magnet",
    icon: "🧲",
    color: "#ab47bc",
    hudDuration: 8000,
    onCollect(game) {
      addTimedEffect(game.snake, "magnet", 8000);
    },
    onTick(game) {
      pullNearbyFoodToward(game, 6);
    }
  },
  double_points: {
    id: "double_points",
    name: "2x Points",
    icon: "×2",
    color: "#ffca28",
    hudDuration: 10000,
    onCollect(game) {
      addTimedEffect(game.snake, "double_points", 10000);
    }
  },
  slow_time: {
    id: "slow_time",
    name: "Slow Time",
    icon: "🐌",
    color: "#26c6da",
    hudDuration: 8000,
    onCollect(game) {
      addTimedEffect(game.snake, "slow_time", 8000);
    }
  },
  ghost: {
    id: "ghost",
    name: "Ghost Mode",
    icon: "👻",
    color: "#b39ddb",
    hudDuration: 6000,
    onCollect(game) {
      addTimedEffect(game.snake, "ghost", 6000);
    }
  }
};

export function tickEffects(game, dtMs) {
  for (const effect of game.snake.activeEffects) {
    POWER_UPS[effect.type]?.onTick?.(game, effect, dtMs);
    if (effect.remainingMs !== Infinity) effect.remainingMs -= dtMs;
  }
  const expired = game.snake.activeEffects.filter(e => e.remainingMs !== Infinity && e.remainingMs <= 0);
  for (const effect of expired) {
    POWER_UPS[effect.type]?.onExpire?.(game, effect);
  }
  game.snake.activeEffects = game.snake.activeEffects.filter(e => e.remainingMs === Infinity || e.remainingMs > 0);
}

export function tryAbsorbCollision(game) {
  for (const effect of [...game.snake.activeEffects]) {
    const def = POWER_UPS[effect.type];
    if (def?.onCollisionAbsorb && def.onCollisionAbsorb(game, effect)) {
      return true;
    }
  }
  return false;
}

export function hasActiveEffect(snake, type) {
  return snake.activeEffects.some(e => e.type === type);
}

export function collectPowerUp(game, type) {
  POWER_UPS[type]?.onCollect?.(game);
}
