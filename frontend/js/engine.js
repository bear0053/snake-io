import { Snake, makeFood, makePowerUp, makeObstacle, randomFreeCell, randomFreeCellNear, DIRS } from "./entities.js";
import { FOOD_TYPES, pickWeightedFoodType } from "./foods.js";
import { tickEffects, tryAbsorbCollision, hasActiveEffect, collectPowerUp } from "./powerups.js";
import { detectFatalCollision, wrapPosition } from "./collision.js";
import { applyDifficulty } from "./levels.js";
import { getSkin } from "./snakes.js";
import { AudioSys } from "./audio.js";

const MAX_POWERUPS_ON_BOARD = 2;
const LASER_CYCLE_MS = 1500;
const ENDLESS_RAMP_INTERVAL_MS = 10000;
const ENDLESS_MIN_SPEED = 60;
const ENDLESS_MAX_OBSTACLES = 24;
const FOOD_MIN_COUNT = 1;
const FOOD_MAX_COUNT = 3;
const FOOD_SPAWN_INTERVAL_MIN_MS = 1500;
const FOOD_SPAWN_INTERVAL_MAX_MS = 4000;
const KEY_SPAWN_DELAY_MIN_MS = 10000;
const KEY_SPAWN_DELAY_MAX_MS = 30000;
const KEY_LIFETIME_MIN_MS = 3000;
const KEY_LIFETIME_MAX_MS = 7000;
// Portals are a fun bonus mechanic rather than an urgent one, so they live much
// longer than food/keys: enough time to notice and use them a few times before
// they relocate, with a short breather before a new pair appears.
const PORTAL_LIFETIME_MIN_MS = 15000;
const PORTAL_LIFETIME_MAX_MS = 25000;
const PORTAL_REGEN_DELAY_MIN_MS = 3000;
const PORTAL_REGEN_DELAY_MAX_MS = 8000;
// Odyssey Snake's "Navigator's Luck": every 6s, a 40% chance the next non-poison
// food spawns within a short radius of the snake instead of anywhere on the board.
const NAVIGATORS_LUCK_INTERVAL_MS = 6000;
const NAVIGATORS_LUCK_CHANCE = 0.4;
const NAVIGATORS_LUCK_RADIUS = 5;
const FOOD_FLASH_DURATION_MS = 250;

// Cached once instead of reallocated on every moving-hazard tick.
const DIR_LIST = Object.values(DIRS);

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomFoodSpawnInterval() {
  return randomBetween(FOOD_SPAWN_INTERVAL_MIN_MS, FOOD_SPAWN_INTERVAL_MAX_MS);
}

function randomKeySpawnDelay() {
  return randomBetween(KEY_SPAWN_DELAY_MIN_MS, KEY_SPAWN_DELAY_MAX_MS);
}

function randomKeyLifetime() {
  return randomBetween(KEY_LIFETIME_MIN_MS, KEY_LIFETIME_MAX_MS);
}

function randomPortalLifetime() {
  return randomBetween(PORTAL_LIFETIME_MIN_MS, PORTAL_LIFETIME_MAX_MS);
}

function randomPortalRegenDelay() {
  return randomBetween(PORTAL_REGEN_DELAY_MIN_MS, PORTAL_REGEN_DELAY_MAX_MS);
}

export function createGame({ level, mode, skinId, difficulty }) {
  const adjLevel = applyDifficulty(level, difficulty);
  const snake = new Snake({ gridSize: adjLevel.gridSize, skinId });

  const game = {
    level: adjLevel,
    mode,
    difficulty,
    snake,
    foods: [],
    powerUps: [],
    obstacles: [],
    key: null,
    exit: null,
    hasKey: false,
    portals: [],
    score: 0,
    foodCollected: 0,
    elapsedMs: 0,
    objectiveProgress: 0,
    noHit: true,
    cellPx: 20,
    canvasCssSize: { width: 400, height: 400 },
    collisionFlash: { active: false, elapsedMs: 0, durationMs: 400 },
    foodFlash: { active: false, elapsedMs: 0, durationMs: FOOD_FLASH_DURATION_MS },
    powerUpTimer: 0,
    endlessRampTimer: 0,
    foodSpawnTimer: 0,
    nextFoodSpawnMs: randomFoodSpawnInterval(),
    keySpawnTimer: 0,
    nextKeySpawnMs: randomKeySpawnDelay(),
    portalCycleTimer: 0,
    nextPortalCycleMs: randomPortalLifetime(),
    navigatorsLuckTimer: 0,
    navigatorsLuckPending: false,
    ended: false,
    endReason: null,
    endNotified: false, // guards against createGameLoop calling onEnded more than once
    comboWindowMs: 2500,
    lastFoodAt: null,
    comboCount: 0
  };

  placeObstacles(game);
  spawnFood(game);
  if (adjLevel.objective?.type === "collect_key_reach_exit") spawnExit(game); // exit appears immediately; the key spawns on a delayed cycle (see updateKeySpawn)
  if (adjLevel.mechanics.portals) placePortals(game);
  return game;
}

function occupiedCells(game) {
  const extra = [];
  if (game.key) extra.push(game.key);
  if (game.exit) extra.push(game.exit);
  if (game.portals) extra.push(...game.portals);
  return [...game.snake.segments, ...game.obstacles, ...game.foods, ...game.powerUps, ...extra];
}

function resolveObstacleTypeDef(obstaclesDef, type) {
  return obstaclesDef.types.find(t => t.type === type);
}

function placeObstacles(game) {
  const { obstacles } = game.level;
  if (obstacles.placement === "fixed_layout" && obstacles.layout) {
    for (const o of obstacles.layout) {
      const typeDef = resolveObstacleTypeDef(obstacles, o.type);
      const obs = makeObstacle(o.x, o.y, o.type, typeDef?.dangerous ?? false);
      if (typeDef?.moving) initMovingObstacle(obs);
      game.obstacles.push(obs);
    }
    return;
  }
  for (const typeDef of obstacles.types) {
    for (let i = 0; i < typeDef.count; i++) {
      const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
      if (!cell) continue;
      const obs = makeObstacle(cell.x, cell.y, typeDef.type, typeDef.dangerous);
      if (typeDef.moving) initMovingObstacle(obs);
      game.obstacles.push(obs);
    }
  }
}

function initMovingObstacle(obs) {
  obs.moving = true;
  obs.moveAccumulator = 0;
  obs.moveIntervalMs = 450;
  obs.dir = null;
}

function spawnFood(game) {
  const typeDef = pickWeightedFoodType(game.level.foodTypes);
  let cell;
  if (game.navigatorsLuckPending && !FOOD_TYPES[typeDef.type].isPoison) {
    cell = randomFreeCellNear(game.snake.head(), game.level.gridSize, occupiedCells(game), NAVIGATORS_LUCK_RADIUS);
    game.navigatorsLuckPending = false; // consumed by this non-poison spawn
  } else {
    cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  }
  if (!cell) return;
  game.foods.push(makeFood(cell.x, cell.y, typeDef.type, typeDef.points));
}

function updateNavigatorsLuck(game, stepMs) {
  if (game.snake.skinId !== "odyssey") return;
  game.navigatorsLuckTimer += stepMs;
  if (game.navigatorsLuckTimer < NAVIGATORS_LUCK_INTERVAL_MS) return;
  game.navigatorsLuckTimer = 0;
  if (Math.random() < NAVIGATORS_LUCK_CHANCE) game.navigatorsLuckPending = true;
}

function updateFoodLifecycle(game, stepMs) {
  const now = performance.now();
  game.foods = game.foods.filter(f => f.expiresAt > now);

  if (game.foods.length < FOOD_MIN_COUNT) {
    spawnFood(game);
    game.foodSpawnTimer = 0;
    game.nextFoodSpawnMs = randomFoodSpawnInterval();
    return;
  }
  if (game.foods.length >= FOOD_MAX_COUNT) return;

  game.foodSpawnTimer += stepMs;
  if (game.foodSpawnTimer >= game.nextFoodSpawnMs) {
    game.foodSpawnTimer = 0;
    game.nextFoodSpawnMs = randomFoodSpawnInterval();
    spawnFood(game);
  }
}

function spawnPowerUp(game) {
  if (!game.level.powerUpPool.length || game.powerUps.length >= MAX_POWERUPS_ON_BOARD) return;
  const type = game.level.powerUpPool[Math.floor(Math.random() * game.level.powerUpPool.length)];
  const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!cell) return;
  game.powerUps.push(makePowerUp(cell.x, cell.y, type));
}

function updatePowerUpLifecycle(game) {
  const now = performance.now();
  game.powerUps = game.powerUps.filter(p => p.expiresAt > now);
}

function spawnExit(game) {
  const exitCell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (exitCell) game.exit = { x: exitCell.x, y: exitCell.y };
}

function spawnKey(game) {
  const keyCell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!keyCell) return;
  game.key = { x: keyCell.x, y: keyCell.y, expiresAt: performance.now() + randomKeyLifetime() };
}

// Keys don't sit on the board permanently: spawn after a random 10-30s delay, then
// vanish after a random 3-7s if not collected, repeating until the player grabs one
// (or dies). Applies to any level whose objective is collect_key_reach_exit.
function updateKeySpawn(game, stepMs) {
  if (game.level.objective?.type !== "collect_key_reach_exit" || game.hasKey) return;

  if (game.key) {
    if (performance.now() >= game.key.expiresAt) {
      game.key = null;
      game.keySpawnTimer = 0;
      game.nextKeySpawnMs = randomKeySpawnDelay();
    }
    return;
  }

  game.keySpawnTimer += stepMs;
  if (game.keySpawnTimer >= game.nextKeySpawnMs) {
    game.keySpawnTimer = 0;
    spawnKey(game);
  }
}

function placePortals(game) {
  const a = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!a) return;
  game.portals.push({ x: a.x, y: a.y });
  const b = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!b) {
    game.portals.pop();
    return;
  }
  game.portals.push({ x: b.x, y: b.y });
}

// Portals aren't permanent fixtures: once active they stick around for a while
// (long enough to actually find and use), then vanish and relocate elsewhere
// after a short breather, repeating for the rest of the level/run. Applies to
// every level/mode with mechanics.portals enabled (Cyber Grid, Endless Mode).
function updatePortalCycle(game, stepMs) {
  if (!game.level.mechanics.portals) return;

  game.portalCycleTimer += stepMs;
  if (game.portalCycleTimer < game.nextPortalCycleMs) return;
  game.portalCycleTimer = 0;

  if (game.portals.length === 2) {
    game.portals = [];
    game.nextPortalCycleMs = randomPortalRegenDelay();
  } else {
    placePortals(game);
    game.nextPortalCycleMs = randomPortalLifetime();
  }
}

function endGame(game, reason) {
  if (game.ended) return;
  game.ended = true;
  game.endReason = reason;
  game.collisionFlash.active = true;
  game.collisionFlash.elapsedMs = 0;
  AudioSys.playSfx("collision");
}

function completeLevel(game) {
  if (game.ended) return;
  game.ended = true;
  game.endReason = "objective";
  game.score += 100;
  if (game.noHit) game.score += 100;
  AudioSys.playLevelComplete();
}

function handleFoodCollected(game, food) {
  const foodDef = FOOD_TYPES[food.type];

  if (foodDef.isPoison) {
    AudioSys.playSfx("poison");
    game.noHit = false;
    const levelFoodDef = game.level.foodTypes.find(f => f.type === "poison");
    if (levelFoodDef?.endsGame) {
      endGame(game, "poison");
      return;
    }
    game.score = Math.max(0, game.score + food.points);
    return;
  }

  AudioSys.playSfx("food");
  game.foodCollected++;
  game.snake.pendingGrowth += foodDef.growth;

  if (game.snake.skinId === "odyssey") {
    game.foodFlash.active = true;
    game.foodFlash.elapsedMs = 0;
  }

  const now = performance.now();
  game.comboCount = (game.lastFoodAt && now - game.lastFoodAt < game.comboWindowMs) ? game.comboCount + 1 : 0;
  game.lastFoodAt = now;
  const comboBonus = game.comboCount * 5;

  const multiplier = hasActiveEffect(game.snake, "double_points") ? 2 : 1;
  game.score += (food.points + comboBonus) * multiplier;

  if (game.level.objective?.type === "collect_food") {
    game.objectiveProgress++;
    if (game.objectiveProgress >= game.level.objective.target) {
      completeLevel(game);
    }
  }
}

function checkPickups(game, head) {
  const foodIdx = game.foods.findIndex(f => f.x === head.x && f.y === head.y);
  if (foodIdx !== -1) {
    const food = game.foods[foodIdx];
    game.foods.splice(foodIdx, 1);
    handleFoodCollected(game, food);
  }
  if (game.ended) return;

  const puIdx = game.powerUps.findIndex(p => p.x === head.x && p.y === head.y);
  if (puIdx !== -1) {
    const pu = game.powerUps[puIdx];
    game.powerUps.splice(puIdx, 1);
    collectPowerUp(game, pu.type);
    AudioSys.playSfx("powerup");
  }

  if (game.key && head.x === game.key.x && head.y === game.key.y) {
    game.key = null;
    game.hasKey = true;
    AudioSys.playSfx("powerup");
  }

  if (game.exit && game.hasKey && head.x === game.exit.x && head.y === game.exit.y) {
    completeLevel(game);
    return;
  }

  if (game.portals.length === 2) {
    const idx = game.portals.findIndex(p => p.x === head.x && p.y === head.y);
    if (idx !== -1) {
      const dest = game.portals[1 - idx];
      head.x = dest.x;
      head.y = dest.y;
      game.snake.segments[0].x = dest.x;
      game.snake.segments[0].y = dest.y;
    }
  }
}

function checkObjective(game) {
  const obj = game.level.objective;
  if (!obj || game.ended) return;
  if (obj.type === "survive_time") {
    game.objectiveProgress = Math.min(obj.target, Math.floor(game.elapsedMs / 1000));
    if (game.elapsedMs >= obj.target * 1000) completeLevel(game);
  } else if (obj.type === "reach_score") {
    game.objectiveProgress = Math.min(obj.target, game.score);
    if (game.score >= obj.target) completeLevel(game);
  } else if (obj.type === "collect_key_reach_exit") {
    game.objectiveProgress = game.hasKey ? 1 : 0;
  }
  // "collect_food" progress is tracked incrementally in handleFoodCollected.
}

function updateLasers(game) {
  if (!game.level.mechanics.lasers) return;
  const on = Math.floor(game.elapsedMs / LASER_CYCLE_MS) % 2 === 0;
  for (const obs of game.obstacles) {
    if (obs.type === "laser") obs.dangerous = on;
  }
}

function updateMovingHazards(game, stepMs) {
  if (!game.level.mechanics.movingHazards) return;
  for (const obs of game.obstacles) {
    if (!obs.moving) continue;
    obs.moveAccumulator += stepMs;
    if (obs.moveAccumulator < obs.moveIntervalMs) continue;
    obs.moveAccumulator = 0;

    if (!obs.dir || Math.random() < 0.35) {
      obs.dir = DIR_LIST[Math.floor(Math.random() * DIR_LIST.length)];
    }
    const nx = obs.x + obs.dir.x;
    const ny = obs.y + obs.dir.y;
    const inBounds = nx >= 0 && ny >= 0 && nx < game.level.gridSize && ny < game.level.gridSize;
    const blocked = !inBounds ||
      game.obstacles.some(o => o !== obs && o.x === nx && o.y === ny) ||
      game.snake.segments.some(s => s.x === nx && s.y === ny);

    if (blocked) {
      obs.dir = DIR_LIST[Math.floor(Math.random() * DIR_LIST.length)];
      continue;
    }
    obs.x = nx;
    obs.y = ny;
  }
}

function updateEndlessRamp(game, stepMs) {
  if (game.mode !== "endless") return;
  game.endlessRampTimer += stepMs;
  if (game.endlessRampTimer < ENDLESS_RAMP_INTERVAL_MS) return;
  game.endlessRampTimer -= ENDLESS_RAMP_INTERVAL_MS;
  game.level.speed = Math.max(ENDLESS_MIN_SPEED, Math.round(game.level.speed * 0.92));
  if (game.obstacles.length < ENDLESS_MAX_OBSTACLES) {
    const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
    if (cell) game.obstacles.push(makeObstacle(cell.x, cell.y, "rock", true));
  }
}

function moveSnake(game, stepMs) {
  const snake = game.snake;
  snake.prevSegments = snake.segments.map(s => ({ ...s }));

  let dir;
  if (game.level.mechanics.slippery) {
    snake.slipTickCounter = (snake.slipTickCounter ?? 0) + 1;
    dir = (snake.slipTickCounter % 2 === 0 && snake.pendingDirections.length)
      ? snake.pendingDirections.shift()
      : snake.direction;
  } else {
    dir = snake.pendingDirections.shift() ?? snake.direction;
  }
  snake.direction = dir;

  let head = { x: snake.segments[0].x + DIRS[dir].x, y: snake.segments[0].y + DIRS[dir].y };
  if (game.level.mechanics.wraparound) head = wrapPosition(head, game.level.gridSize);

  const willGrow = snake.pendingGrowth > 0;
  const bodyToCheck = willGrow ? snake.segments : snake.segments.slice(0, -1);
  const obstaclesForCollision = hasActiveEffect(snake, "ghost") ? [] : game.obstacles;
  const collisionType = detectFatalCollision(head, game.level, bodyToCheck, obstaclesForCollision);

  if (collisionType) {
    if (tryAbsorbCollision(game)) return; // shield consumed, snake stays put this tick
    endGame(game, collisionType);
    return;
  }

  snake.segments.unshift(head);
  if (willGrow) {
    snake.pendingGrowth--;
    snake.prevSegments.unshift(snake.prevSegments[0]); // keep index alignment with grown segments for interpolation
  } else {
    snake.segments.pop();
  }

  const skin = getSkin(snake.skinId);
  if (skin.trailEffect) {
    const tail = snake.prevSegments.at(-1);
    if (tail) snake.trailParticles.push({ x: tail.x, y: tail.y, life: 1 });
  }
  snake.trailParticles.forEach(p => { p.life -= stepMs / 400; });
  snake.trailParticles = snake.trailParticles.filter(p => p.life > 0);

  checkPickups(game, head);
}

export function tickGame(game, stepMs) {
  if (game.ended) return;
  game.elapsedMs += stepMs;
  updateFoodLifecycle(game, stepMs);
  updatePowerUpLifecycle(game);
  updateKeySpawn(game, stepMs);
  updatePortalCycle(game, stepMs);
  updateNavigatorsLuck(game, stepMs);
  game.powerUpTimer += stepMs;
  if (game.powerUpTimer >= game.level.powerUpSpawnRateMs) {
    game.powerUpTimer = 0;
    spawnPowerUp(game);
  }
  tickEffects(game, stepMs);
  updateLasers(game);
  updateMovingHazards(game, stepMs);
  updateEndlessRamp(game, stepMs);
  moveSnake(game, stepMs);
  if (!game.ended) checkObjective(game);
}

// --- Persistent RAF loop --------------------------------------------------

// collisionFlash/foodFlash share the same {active, elapsedMs, durationMs} shape.
function advanceFlash(flash, delta) {
  if (!flash.active) return;
  flash.elapsedMs += delta;
  if (flash.elapsedMs >= flash.durationMs) flash.active = false;
}

export function createGameLoop({ ctx, render, isActive, getStepMs, getGame, onEnded }) {
  let lastTime = 0;
  let accumulator = 0;

  function frame(timestamp) {
    requestAnimationFrame(frame);
    if (document.hidden || !isActive()) {
      lastTime = timestamp;
      return;
    }
    const delta = Math.min(timestamp - lastTime, 250); // clamp to avoid huge catch-up after tab switch
    lastTime = timestamp;
    accumulator += delta;
    const stepMs = getStepMs();
    const game = getGame();

    while (accumulator >= stepMs) {
      tickGame(game, stepMs);
      accumulator -= stepMs;
      if (game.ended) {
        accumulator = 0;
        // onEnded (main.js's handleGameEnded) is async - it awaits a backend call before
        // transitioning state away from PLAYING, so isActive() stays true and game.ended
        // stays true across several more animation frames while that's in flight. Without
        // this guard, onEnded fires again on every one of those frames (observed directly:
        // a second, synchronous-looking call would race ahead of the first's pending
        // backend validation and record an unvalidated result).
        if (!game.endNotified) {
          game.endNotified = true;
          onEnded(game);
        }
        break;
      }
    }

    advanceFlash(game.collisionFlash, delta);
    advanceFlash(game.foodFlash, delta);

    render(game, accumulator / stepMs);
  }

  requestAnimationFrame(frame);
}
