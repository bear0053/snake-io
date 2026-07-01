import { Snake, makeFood, makePowerUp, makeObstacle, randomFreeCell, DIRS } from "./entities.js";
import { FOOD_TYPES, pickWeightedFoodType } from "./foods.js";
import { tickEffects, tryAbsorbCollision, hasActiveEffect, collectPowerUp } from "./powerups.js";
import { detectFatalCollision, wrapPosition } from "./collision.js";
import { applyDifficulty } from "./levels.js";
import { getSkin } from "./snakes.js";
import { AudioSys } from "./audio.js";

const MAX_POWERUPS_ON_BOARD = 2;

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
    score: 0,
    foodCollected: 0,
    startTime: performance.now(),
    elapsedMs: 0,
    objectiveProgress: 0,
    noHit: true,
    cellPx: 20,
    canvasCssSize: { width: 400, height: 400 },
    collisionFlash: { active: false, elapsedMs: 0, durationMs: 400 },
    levelTransition: { active: false, elapsedMs: 0, durationMs: 500 },
    powerUpTimer: 0,
    ended: false,
    endReason: null,
    comboWindowMs: 2500,
    lastFoodAt: null,
    comboCount: 0
  };

  placeObstacles(game);
  spawnFood(game);
  return game;
}

function occupiedCells(game) {
  return [...game.snake.segments, ...game.obstacles, ...game.foods, ...game.powerUps];
}

function resolveDangerous(obstaclesDef, type) {
  return obstaclesDef.types.find(t => t.type === type)?.dangerous ?? false;
}

function placeObstacles(game) {
  const { obstacles } = game.level;
  if (obstacles.placement === "fixed_layout" && obstacles.layout) {
    for (const o of obstacles.layout) {
      game.obstacles.push(makeObstacle(o.x, o.y, o.type, resolveDangerous(obstacles, o.type)));
    }
    return;
  }
  for (const typeDef of obstacles.types) {
    for (let i = 0; i < typeDef.count; i++) {
      const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
      if (!cell) continue;
      game.obstacles.push(makeObstacle(cell.x, cell.y, typeDef.type, typeDef.dangerous));
    }
  }
}

function spawnFood(game) {
  const typeDef = pickWeightedFoodType(game.level.foodTypes);
  const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!cell) return;
  game.foods.push(makeFood(cell.x, cell.y, typeDef.type, typeDef.points));
}

function spawnPowerUp(game) {
  if (!game.level.powerUpPool.length || game.powerUps.length >= MAX_POWERUPS_ON_BOARD) return;
  const type = game.level.powerUpPool[Math.floor(Math.random() * game.level.powerUpPool.length)];
  const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!cell) return;
  game.powerUps.push(makePowerUp(cell.x, cell.y, type));
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
    if (!game.ended) spawnFood(game);
  }

  const puIdx = game.powerUps.findIndex(p => p.x === head.x && p.y === head.y);
  if (puIdx !== -1) {
    const pu = game.powerUps[puIdx];
    game.powerUps.splice(puIdx, 1);
    collectPowerUp(game, pu.type);
    AudioSys.playSfx("powerup");
  }
}

function moveSnake(game, stepMs) {
  const snake = game.snake;
  snake.prevSegments = snake.segments.map(s => ({ ...s }));

  const dir = snake.pendingDirections.shift() ?? snake.direction;
  snake.direction = dir;

  let head = { x: snake.segments[0].x + DIRS[dir].x, y: snake.segments[0].y + DIRS[dir].y };
  if (game.level.mechanics.wraparound) head = wrapPosition(head, game.level.gridSize);

  const willGrow = snake.pendingGrowth > 0;
  const bodyToCheck = willGrow ? snake.segments : snake.segments.slice(0, -1);
  const collisionType = detectFatalCollision(head, game.level, bodyToCheck, game.obstacles);

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
  if (skin.trailEffect === "flame") {
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
  game.powerUpTimer += stepMs;
  if (game.powerUpTimer >= game.level.powerUpSpawnRateMs) {
    game.powerUpTimer = 0;
    spawnPowerUp(game);
  }
  tickEffects(game, stepMs);
  moveSnake(game, stepMs);
}

// --- Persistent RAF loop --------------------------------------------------

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
        onEnded(game);
        break;
      }
    }

    if (game.collisionFlash.active) {
      game.collisionFlash.elapsedMs += delta;
      if (game.collisionFlash.elapsedMs >= game.collisionFlash.durationMs) game.collisionFlash.active = false;
    }
    if (game.levelTransition.active) {
      game.levelTransition.elapsedMs += delta;
      if (game.levelTransition.elapsedMs >= game.levelTransition.durationMs) game.levelTransition.active = false;
    }

    render(game, accumulator / stepMs);
  }

  requestAnimationFrame(frame);
}
