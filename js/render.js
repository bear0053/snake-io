import { getSkin } from "./snakes.js";
import { FOOD_TYPES } from "./foods.js";
import { POWER_UPS } from "./powerups.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function cellCenter(cell, cellPx) {
  return { x: cell.x * cellPx + cellPx / 2, y: cell.y * cellPx + cellPx / 2 };
}

// --- Theme: Garden Grove -------------------------------------------------

function drawGardenBackground(ctx, game) {
  const { width, height } = game.canvasCssSize;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, game.level.colors.bgFrom);
  grad.addColorStop(1, game.level.colors.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // subtle tile grid texture
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  ctx.lineWidth = 1;
  const cellPx = game.cellPx;
  for (let i = 0; i <= game.level.gridSize; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellPx, 0);
    ctx.lineTo(i * cellPx, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cellPx);
    ctx.lineTo(width, i * cellPx);
    ctx.stroke();
  }
}

function drawRock(ctx, cx, cy, r) {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.55, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8d8d8d";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.85, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a8a8a8";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.2, cy - r * 0.15, r * 0.4, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlower(ctx, cx, cy, r, seed) {
  const petalColors = ["#f48fb1", "#fff59d", "#ce93d8", "#ef9a9a"];
  const color = petalColors[Math.floor(seed * petalColors.length) % petalColors.length];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / 5 + seed * 6);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.45, r * 0.26, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#ffca28";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGardenObstacle(ctx, game, obstacle) {
  const { x: cx, y: cy } = cellCenter(obstacle, game.cellPx);
  const r = game.cellPx * 0.42;
  if (obstacle.type === "rock") drawRock(ctx, cx, cy, r);
  else drawFlower(ctx, cx, cy, r, obstacle.seed);
}

function drawApple(ctx, cx, cy, r, pulse) {
  const rr = r * pulse;
  const grad = ctx.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, cx, cy, rr);
  grad.addColorStop(0, "#ff8a80");
  grad.addColorStop(1, "#e53935");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6d4c41";
  ctx.fillRect(cx - 1.5, cy - rr * 0.95, 3, rr * 0.4);

  ctx.fillStyle = "#66bb6a";
  ctx.beginPath();
  ctx.ellipse(cx + rr * 0.25, cy - rr * 0.8, rr * 0.28, rr * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSparkle(ctx, cx, cy, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.1, -r * 0.5);
    ctx.lineTo(0, -r * 0.9);
    ctx.lineTo(-r * 0.1, -r * 0.5);
  }
  ctx.fill();
  ctx.restore();
}

function drawFood(ctx, game, food) {
  const { x: cx, y: cy } = cellCenter(food, game.cellPx);
  const r = game.cellPx * 0.42;
  const elapsed = performance.now() - food.spawnedAt;
  const pulse = 1 + 0.08 * Math.sin(elapsed / 200 + food.sparklePhase);

  if (food.type === "regular") {
    drawApple(ctx, cx, cy, r, pulse);
  } else if (food.type === "golden") {
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * pulse);
    grad.addColorStop(0, "#fff59d");
    grad.addColorStop(1, "#f9a825");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse * 0.85, 0, Math.PI * 2);
    ctx.fill();
  } else if (food.type === "poison") {
    ctx.fillStyle = "#8e24aa";
    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4a148c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.3);
    ctx.moveTo(cx + r * 0.3, cy - r * 0.3);
    ctx.lineTo(cx - r * 0.3, cy + r * 0.3);
    ctx.stroke();
  }

  const sparkleAlpha = 0.5 + 0.5 * Math.sin(elapsed / 260 + food.sparklePhase * 2);
  if (sparkleAlpha > 0.85) {
    drawSparkle(ctx, cx + r * 0.55, cy - r * 0.55, r * 0.35, (sparkleAlpha - 0.85) / 0.15);
  }
}

function drawPowerUp(ctx, game, pu) {
  const { x: cx, y: cy } = cellCenter(pu, game.cellPx);
  const def = POWER_UPS[pu.type];
  const elapsed = performance.now() - pu.spawnedAt;
  const glow = 10 + 8 * Math.sin(elapsed / 260);
  const r = game.cellPx * 0.4;

  ctx.save();
  ctx.shadowColor = def.color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#0f1220";
  ctx.font = `${Math.round(r)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(def.icon, cx, cy + 1);
}

function drawSnake(ctx, game, interp) {
  const skin = getSkin(game.snake.skinId);
  const { segments, prevSegments } = game.snake;
  const cellPx = game.cellPx;
  const size = cellPx * 0.82;

  // Fire trail particles (drawn behind the snake)
  if (skin.trailEffect === "flame" && game.snake.trailParticles.length) {
    for (const p of game.snake.trailParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.life > 0.5 ? "#ffca28" : "#ff7043";
      ctx.beginPath();
      ctx.arc(p.x * cellPx + cellPx / 2, p.y * cellPx + cellPx / 2, cellPx * 0.18 * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const prev = prevSegments[i] ?? seg;
    const x = lerp(prev.x, seg.x, interp) * cellPx + cellPx / 2;
    const y = lerp(prev.y, seg.y, interp) * cellPx + cellPx / 2;
    const isHead = i === 0;
    const s = isHead ? size * 1.08 : size;

    ctx.fillStyle = isHead ? skin.colors.head : skin.colors.body;
    ctx.beginPath();
    ctx.roundRect(x - s / 2, y - s / 2, s, s, s * 0.35);
    ctx.fill();

    if (isHead) {
      const dir = game.snake.direction;
      const eyeOffsets = {
        UP: [[-0.2, -0.28], [0.2, -0.28]],
        DOWN: [[-0.2, 0.28], [0.2, 0.28]],
        LEFT: [[-0.28, -0.2], [-0.28, 0.2]],
        RIGHT: [[0.28, -0.2], [0.28, 0.2]]
      }[dir] ?? [[0.28, -0.2], [0.28, 0.2]];
      ctx.fillStyle = skin.colors.eye;
      for (const [ox, oy] of eyeOffsets) {
        ctx.beginPath();
        ctx.arc(x + ox * s, y + oy * s, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#111";
      for (const [ox, oy] of eyeOffsets) {
        ctx.beginPath();
        ctx.arc(x + ox * s, y + oy * s, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawCollisionFlash(ctx, game) {
  if (!game.collisionFlash.active) return;
  const t = game.collisionFlash.elapsedMs / game.collisionFlash.durationMs;
  const alpha = Math.max(0, 0.6 * (1 - t));
  const { width, height } = game.canvasCssSize;
  ctx.save();
  const shake = (1 - t) * 4;
  ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.fillStyle = `rgba(255,0,0,${alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawLevelTransition(ctx, game) {
  if (!game.levelTransition.active) return;
  const t = Math.min(1, game.levelTransition.elapsedMs / game.levelTransition.durationMs);
  const alpha = t < 0.5 ? t * 2 : (1 - t) * 2;
  const { width, height } = game.canvasCssSize;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.fillRect(0, 0, width, height);
}

export const themeRenderers = {
  garden: {
    drawBackground: drawGardenBackground,
    drawObstacle: drawGardenObstacle
  }
};

export function renderGame(ctx, game, interp) {
  const { width, height } = game.canvasCssSize;
  ctx.clearRect(0, 0, width, height);

  const theme = themeRenderers[game.level.theme] ?? themeRenderers.garden;
  theme.drawBackground(ctx, game);

  for (const obs of game.obstacles) theme.drawObstacle(ctx, game, obs);
  for (const food of game.foods) drawFood(ctx, game, food);
  for (const pu of game.powerUps) drawPowerUp(ctx, game, pu);

  drawSnake(ctx, game, interp);
  drawCollisionFlash(ctx, game);
  drawLevelTransition(ctx, game);
}
