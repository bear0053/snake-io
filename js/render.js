import { getSkin } from "./snakes.js";
import { FOOD_TYPES } from "./foods.js";
import { POWER_UPS } from "./powerups.js";

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function cellCenter(cell, cellPx) {
  return { x: cell.x * cellPx + cellPx / 2, y: cell.y * cellPx + cellPx / 2 };
}

function drawGradientBackground(ctx, game) {
  const { width, height } = game.canvasCssSize;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, game.level.colors.bgFrom);
  grad.addColorStop(1, game.level.colors.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(0,0,0,0.06)";
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

// --- Obstacle shape primitives -------------------------------------------

function drawRock(ctx, cx, cy, r, tint = "#8d8d8d", highlight = "#a8a8a8") {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.55, r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.85, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = highlight;
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

function drawCactus(ctx, cx, cy, r) {
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.7, r * 0.6, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2e7d32";
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.3, cy - r * 0.9, r * 0.6, r * 1.6, r * 0.3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.75, cy - r * 0.15, r * 0.35, r * 0.75, r * 0.2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx + r * 0.4, cy - r * 0.5, r * 0.35, r * 0.75, r * 0.2);
  ctx.fill();
}

function drawSnowball(ctx, cx, cy, r) {
  ctx.fillStyle = "rgba(120,150,180,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.6, r * 0.8, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r * 0.85);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, "#cfe8f7");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawVine(ctx, cx, cy, r, seed) {
  ctx.strokeStyle = "#2e7d32";
  ctx.lineWidth = r * 0.25;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.6, cy - r * 0.9);
  ctx.bezierCurveTo(cx + r * 0.6, cy - r * 0.3, cx - r * 0.6, cy + r * 0.3, cx + r * 0.5, cy + r * 0.9);
  ctx.stroke();
  ctx.fillStyle = "#66bb6a";
  for (let i = 0; i < 3; i++) {
    const t = i / 2;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.6 + t * r * 1.1, cy - r * 0.6 + t * r * 0.9, r * 0.22, r * 0.14, seed, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBug(ctx, cx, cy, r) {
  ctx.fillStyle = "#3e2723";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.7, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3e2723";
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + side * r * 0.3, cy + i * r * 0.25);
      ctx.lineTo(cx + side * r * 0.9, cy + i * r * 0.45);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#ef5350";
  ctx.beginPath();
  ctx.arc(cx - r * 0.15, cy - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.15, cy - r * 0.1, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawLavaPool(ctx, cx, cy, r, elapsed) {
  const wobble = 1 + 0.06 * Math.sin(elapsed / 300);
  const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * wobble);
  grad.addColorStop(0, "#fff176");
  grad.addColorStop(0.4, "#ff6d00");
  grad.addColorStop(1, "#7a1500");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * wobble, 0, Math.PI * 2);
  ctx.fill();
}

function drawLaser(ctx, cx, cy, r, active, elapsed) {
  const glow = active ? 14 + 6 * Math.sin(elapsed / 150) : 0;
  ctx.save();
  ctx.shadowColor = active ? "#ff1744" : "transparent";
  ctx.shadowBlur = glow;
  ctx.fillStyle = active ? "#ff1744" : "rgba(120,120,140,0.35)";
  ctx.beginPath();
  ctx.roundRect(cx - r * 0.85, cy - r * 0.28, r * 1.7, r * 0.56, r * 0.2);
  ctx.fill();
  ctx.restore();
}

// --- Per-theme obstacle dispatch -------------------------------------------

function drawGardenObstacle(ctx, game, obstacle) {
  const { x: cx, y: cy } = cellCenter(obstacle, game.cellPx);
  const r = game.cellPx * 0.42;
  if (obstacle.type === "rock") drawRock(ctx, cx, cy, r);
  else drawFlower(ctx, cx, cy, r, obstacle.seed);
}

function drawDesertObstacle(ctx, game, obstacle) {
  const { x: cx, y: cy } = cellCenter(obstacle, game.cellPx);
  drawCactus(ctx, cx, cy, game.cellPx * 0.42);
}

function drawSnowyObstacle(ctx, game, obstacle) {
  const { x: cx, y: cy } = cellCenter(obstacle, game.cellPx);
  drawSnowball(ctx, cx, cy, game.cellPx * 0.42);
}

function drawJungleObstacle(ctx, game, obstacle) {
  const { x: cx, y: cy } = cellCenter(obstacle, game.cellPx);
  const r = game.cellPx * 0.42;
  if (obstacle.type === "vine") drawVine(ctx, cx, cy, r, obstacle.seed);
  else if (obstacle.type === "bug") drawBug(ctx, cx, cy, r);
  else drawRock(ctx, cx, cy, r, "#6d6d6d", "#8a8a8a");
}

function drawLavaObstacle(ctx, game, obstacle) {
  const { x: cx, y: cy } = cellCenter(obstacle, game.cellPx);
  drawLavaPool(ctx, cx, cy, game.cellPx * 0.44, performance.now());
}

function drawCyberObstacle(ctx, game, obstacle) {
  const { x: cx, y: cy } = cellCenter(obstacle, game.cellPx);
  drawLaser(ctx, cx, cy, game.cellPx * 0.42, obstacle.dangerous, performance.now());
}

// --- Food rendering (theme-aware) -----------------------------------------

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

function drawDroplet(ctx, cx, cy, r, c1, c2, pulse) {
  const rr = r * pulse;
  ctx.save();
  ctx.translate(cx, cy);
  const grad = ctx.createLinearGradient(0, -rr, 0, rr);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -rr);
  ctx.bezierCurveTo(rr * 0.75, -rr * 0.1, rr * 0.6, rr, 0, rr);
  ctx.bezierCurveTo(-rr * 0.6, rr, -rr * 0.75, -rr * 0.1, 0, -rr);
  ctx.fill();
  ctx.restore();
}

function drawCrystal(ctx, cx, cy, r, c1, c2, pulse) {
  const rr = r * pulse;
  ctx.save();
  ctx.translate(cx, cy);
  const grad = ctx.createLinearGradient(0, -rr, 0, rr);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -rr);
  ctx.lineTo(rr * 0.7, 0);
  ctx.lineTo(0, rr);
  ctx.lineTo(-rr * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawOrb(ctx, cx, cy, r, c1, c2, pulse) {
  const rr = r * pulse;
  ctx.save();
  ctx.shadowColor = c1;
  ctx.shadowBlur = 12;
  const grad = ctx.createRadialGradient(cx, cy, rr * 0.1, cx, cy, rr);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBerry(ctx, cx, cy, r, c1, c2, pulse) {
  const rr = r * pulse;
  const grad = ctx.createRadialGradient(cx - rr * 0.25, cy - rr * 0.25, rr * 0.1, cx, cy, rr);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 0.78, 0, Math.PI * 2);
  ctx.fill();
}

function drawPoisonFood(ctx, cx, cy, r, pulse) {
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

const THEME_FOOD_STYLES = {
  garden: { shape: "apple" },
  desert: { shape: "droplet", regular: ["#ffcc80", "#e65100"], golden: ["#81d4fa", "#0288d1"] },
  snowy: { shape: "crystal", regular: ["#90caf9", "#1565c0"], golden: ["#fff59d", "#f9a825"] },
  jungle: { shape: "berry", regular: ["#aed581", "#33691e"], golden: ["#fff176", "#f57f17"] },
  lava: { shape: "berry", regular: ["#fff59d", "#ff8f00"], golden: ["#ffffff", "#ffd600"] },
  cyber: { shape: "orb", regular: ["#80f6ff", "#00acc1"], golden: ["#fff59d", "#f9a825"] }
};

const EXPIRY_FADE_WARNING_MS = 600;

function drawFood(ctx, game, food) {
  const { x: cx, y: cy } = cellCenter(food, game.cellPx);
  const r = game.cellPx * 0.42;
  const now = performance.now();
  const elapsed = now - food.spawnedAt;
  const pulse = 1 + 0.08 * Math.sin(elapsed / 200 + food.sparklePhase);

  const remaining = food.expiresAt - now;
  const fadeAlpha = remaining < EXPIRY_FADE_WARNING_MS ? Math.max(0.15, remaining / EXPIRY_FADE_WARNING_MS) : 1;
  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  if (food.type === "poison") {
    drawPoisonFood(ctx, cx, cy, r, pulse);
  } else {
    const style = THEME_FOOD_STYLES[game.level.theme] ?? THEME_FOOD_STYLES.garden;
    if (style.shape === "apple") {
      if (food.type === "golden") {
        const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r * pulse);
        grad.addColorStop(0, "#fff59d");
        grad.addColorStop(1, "#f9a825");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * pulse * 0.85, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawApple(ctx, cx, cy, r, pulse);
      }
    } else {
      const [c1, c2] = style[food.type === "golden" ? "golden" : "regular"];
      if (style.shape === "droplet") drawDroplet(ctx, cx, cy, r, c1, c2, pulse);
      else if (style.shape === "crystal") drawCrystal(ctx, cx, cy, r, c1, c2, pulse);
      else if (style.shape === "orb") drawOrb(ctx, cx, cy, r, c1, c2, pulse);
      else drawBerry(ctx, cx, cy, r, c1, c2, pulse);
    }
  }

  const sparkleAlpha = 0.5 + 0.5 * Math.sin(elapsed / 260 + food.sparklePhase * 2);
  if (sparkleAlpha > 0.85) {
    drawSparkle(ctx, cx + r * 0.55, cy - r * 0.55, r * 0.35, (sparkleAlpha - 0.85) / 0.15);
  }

  ctx.restore();
}

function drawPowerUp(ctx, game, pu) {
  const { x: cx, y: cy } = cellCenter(pu, game.cellPx);
  const def = POWER_UPS[pu.type];
  const now = performance.now();
  const elapsed = now - pu.spawnedAt;
  const glow = 10 + 8 * Math.sin(elapsed / 260);
  const r = game.cellPx * 0.4;

  const remaining = pu.expiresAt - now;
  const fadeAlpha = remaining < EXPIRY_FADE_WARNING_MS ? Math.max(0.15, remaining / EXPIRY_FADE_WARNING_MS) : 1;
  ctx.save();
  ctx.globalAlpha = fadeAlpha;

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

  ctx.restore();
}

// --- Key / Exit / Portals ---------------------------------------------------

function drawKey(ctx, game, key) {
  const { x: cx, y: cy } = cellCenter(key, game.cellPx);
  const elapsed = performance.now();
  const bob = Math.sin(elapsed / 300) * game.cellPx * 0.06;
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.shadowColor = "#ffd54f";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "#ffd54f";
  ctx.lineWidth = game.cellPx * 0.12;
  ctx.beginPath();
  ctx.arc(-game.cellPx * 0.15, 0, game.cellPx * 0.16, 0, Math.PI * 2);
  ctx.moveTo(0, 0);
  ctx.lineTo(game.cellPx * 0.32, 0);
  ctx.moveTo(game.cellPx * 0.18, 0);
  ctx.lineTo(game.cellPx * 0.18, game.cellPx * 0.14);
  ctx.stroke();
  ctx.restore();
}

function drawExit(ctx, game, exit, hasKey) {
  const { x: cx, y: cy } = cellCenter(exit, game.cellPx);
  const r = game.cellPx * 0.44;
  ctx.save();
  ctx.shadowColor = hasKey ? "#69f0ae" : "#616161";
  ctx.shadowBlur = hasKey ? 16 : 4;
  ctx.strokeStyle = hasKey ? "#69f0ae" : "#757575";
  ctx.lineWidth = game.cellPx * 0.1;
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.3);
  ctx.stroke();
  ctx.restore();
}

function drawPortals(ctx, game) {
  if (game.portals.length !== 2) return;
  const colors = ["#00e5ff", "#ff4081"];
  const t = performance.now();
  game.portals.forEach((portal, i) => {
    const { x: cx, y: cy } = cellCenter(portal, game.cellPx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t / 400 + i);
    ctx.shadowColor = colors[i];
    ctx.shadowBlur = 14;
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = game.cellPx * 0.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, game.cellPx * 0.4, game.cellPx * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}

// --- Sandstorm foreground effect --------------------------------------------

function drawSandstorm(ctx, game) {
  const { width, height } = game.canvasCssSize;
  const t = game.elapsedMs;
  const gustAlpha = 0.08 + 0.07 * Math.max(0, Math.sin(t / 4000));
  if (gustAlpha < 0.03) return;
  ctx.save();
  ctx.globalAlpha = gustAlpha;
  ctx.fillStyle = "#e0b873";
  const stripeSpacing = 34;
  const offset = (t / 12) % (stripeSpacing * 2);
  for (let x = -stripeSpacing * 2 + (offset % stripeSpacing); x < width + stripeSpacing; x += stripeSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height * 0.4, 0);
    ctx.lineTo(x + height * 0.4 + 10, 0);
    ctx.lineTo(x + 10, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// --- Snake -------------------------------------------------------------------

const TRAIL_STYLES = {
  flame: ["#ffca28", "#ff7043"],
  frost: ["#e1f5fe", "#4fc3f7"],
  glow: ["#ce93d8", "#8e24aa"],
  sparkle: ["#fff9c4", "#ffd54f"]
};

function drawSnake(ctx, game, interp) {
  const skin = getSkin(game.snake.skinId);
  const { segments, prevSegments } = game.snake;
  const cellPx = game.cellPx;
  const size = cellPx * 0.82;

  if (skin.trailEffect && game.snake.trailParticles.length) {
    const [colorA, colorB] = TRAIL_STYLES[skin.trailEffect] ?? TRAIL_STYLES.flame;
    for (const p of game.snake.trailParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.life > 0.5 ? colorA : colorB;
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
  garden: { drawBackground: drawGradientBackground, drawObstacle: drawGardenObstacle },
  desert: { drawBackground: drawGradientBackground, drawObstacle: drawDesertObstacle },
  snowy: { drawBackground: drawGradientBackground, drawObstacle: drawSnowyObstacle },
  jungle: { drawBackground: drawGradientBackground, drawObstacle: drawJungleObstacle },
  lava: { drawBackground: drawGradientBackground, drawObstacle: drawLavaObstacle },
  cyber: { drawBackground: drawGradientBackground, drawObstacle: drawCyberObstacle }
};

export function renderGame(ctx, game, interp) {
  const { width, height } = game.canvasCssSize;
  ctx.clearRect(0, 0, width, height);

  const theme = themeRenderers[game.level.theme] ?? themeRenderers.garden;
  theme.drawBackground(ctx, game);

  for (const obs of game.obstacles) theme.drawObstacle(ctx, game, obs);
  if (game.exit) drawExit(ctx, game, game.exit, game.hasKey);
  if (game.key) drawKey(ctx, game, game.key);
  drawPortals(ctx, game);
  for (const food of game.foods) drawFood(ctx, game, food);
  for (const pu of game.powerUps) drawPowerUp(ctx, game, pu);

  drawSnake(ctx, game, interp);

  if (game.level.mechanics.sandstorm) drawSandstorm(ctx, game);

  drawCollisionFlash(ctx, game);
  drawLevelTransition(ctx, game);
}
