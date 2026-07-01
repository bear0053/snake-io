import { LEVELS, getLevel } from "./levels.js";
import { SKINS, unlockDescription } from "./snakes.js";
import { SaveData } from "./storage.js";
import { States } from "./state.js";
import { POWER_UPS } from "./powerups.js";

const ALL_LEVEL_IDS = LEVELS.map(l => l.id);

const els = {
  hud: document.getElementById("hud"),
  dpad: document.getElementById("dpad"),
  screens: Array.from(document.querySelectorAll(".screen"))
};

export function showState(state) {
  for (const screen of els.screens) {
    screen.classList.toggle("hidden", screen.id !== state);
  }
  const isPlaying = state === States.PLAYING;
  els.hud.classList.toggle("hidden", !isPlaying);
}

export function setDpadVisible(visible) {
  els.dpad.classList.toggle("hidden", !visible);
}

// --- Level Select ----------------------------------------------------------

export function populateLevelSelect(onSelect) {
  const list = document.getElementById("level-list");
  list.innerHTML = "";
  for (const level of LEVELS) {
    const unlocked = SaveData.isLevelUnlocked(level.id);
    const result = SaveData.data.highScores.byLevel[String(level.id)];
    const card = document.createElement("div");
    card.className = "card" + (unlocked ? "" : " locked");
    card.innerHTML = `
      <div>
        <div class="card-title">${unlocked ? level.name : "🔒 " + level.name}</div>
        <div class="card-sub">${unlocked ? `Best: ${result?.score ?? 0}${result?.stars ? " · " + "★".repeat(result.stars) : ""}` : "Locked"}</div>
      </div>
    `;
    if (unlocked) {
      card.addEventListener("click", () => onSelect(level.id));
    }
    list.appendChild(card);
  }
}

// --- Snake Select ------------------------------------------------------------

export function populateSnakeSelect(onSelect) {
  const list = document.getElementById("snake-list");
  list.innerHTML = "";
  for (const skin of SKINS) {
    const unlocked = SaveData.isSkinUnlocked(skin, ALL_LEVEL_IDS);
    const selected = SaveData.data.selectedSkin === skin.id;
    const card = document.createElement("div");
    card.className = "card" + (unlocked ? "" : " locked") + (selected ? " selected" : "");
    card.innerHTML = `
      <div class="card-swatch" style="background:${skin.colors.body}"></div>
      <div style="flex:1">
        <div class="card-title">${skin.name}${selected ? " ✓" : ""}</div>
        <div class="card-sub">${unlockDescription(skin)}</div>
      </div>
    `;
    if (unlocked) {
      card.addEventListener("click", () => {
        SaveData.selectSkin(skin.id);
        onSelect(skin.id);
        populateSnakeSelect(onSelect);
      });
    }
    list.appendChild(card);
  }
}

// --- High Scores -------------------------------------------------------------

export function populateHighScores() {
  const list = document.getElementById("high-score-list");
  list.innerHTML = "";

  const classicCard = document.createElement("div");
  classicCard.className = "card";
  classicCard.innerHTML = `<div><div class="card-title">Classic Mode</div><div class="card-sub">High Score</div></div><div class="card-title">${SaveData.data.highScores.classic}</div>`;
  list.appendChild(classicCard);

  const endlessCard = document.createElement("div");
  endlessCard.className = "card";
  endlessCard.innerHTML = `<div><div class="card-title">Endless Mode</div><div class="card-sub">High Score</div></div><div class="card-title">${SaveData.data.highScores.endless}</div>`;
  list.appendChild(endlessCard);

  for (const level of LEVELS) {
    const result = SaveData.data.highScores.byLevel[String(level.id)];
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div><div class="card-title">${level.name}</div><div class="card-sub">${result ? "★".repeat(result.stars) || "Played" : "Not played"}</div></div><div class="card-title">${result?.score ?? 0}</div>`;
    list.appendChild(card);
  }
}

// --- Settings ------------------------------------------------------------------

export function populateSettings() {
  document.getElementById("setting-music").checked = SaveData.data.settings.musicOn;
  document.getElementById("setting-music-volume").value = Math.round(SaveData.data.settings.musicVolume * 100);
  document.getElementById("setting-sfx").checked = SaveData.data.settings.sfxOn;
  document.getElementById("setting-difficulty").value = SaveData.data.settings.difficulty;
  document.getElementById("setting-controls").value = SaveData.data.settings.controlType;
}

// --- HUD -----------------------------------------------------------------------

export function updateHud(game) {
  document.getElementById("hud-score").textContent = game.score;
  document.getElementById("hud-length").textContent = game.snake.segments.length;

  const objWrap = document.getElementById("hud-objective-wrap");
  const objective = game.level.objective;
  if (objective) {
    objWrap.style.display = "";
    const labelEl = document.getElementById("hud-objective-label");
    const valueEl = document.getElementById("hud-objective");
    if (objective.type === "collect_food") {
      labelEl.textContent = "Food";
      valueEl.textContent = `${game.objectiveProgress} / ${objective.target}`;
    } else if (objective.type === "survive_time") {
      labelEl.textContent = "Survive";
      valueEl.textContent = `${game.objectiveProgress}s / ${objective.target}s`;
    } else if (objective.type === "reach_score") {
      labelEl.textContent = "Score Goal";
      valueEl.textContent = `${game.objectiveProgress} / ${objective.target}`;
    } else if (objective.type === "collect_key_reach_exit") {
      labelEl.textContent = game.hasKey ? "Find the exit!" : "Find the key";
      valueEl.textContent = game.hasKey ? "🔑" : "";
    } else {
      labelEl.textContent = "Objective";
      valueEl.textContent = `${game.objectiveProgress}`;
    }
  } else {
    objWrap.style.display = "none";
  }

  const puWrap = document.getElementById("hud-powerup-wrap");
  const active = game.snake.activeEffects[0];
  if (active) {
    const def = POWER_UPS[active.type];
    puWrap.style.display = "";
    document.getElementById("hud-powerup-icon").textContent = def.icon;
    document.getElementById("hud-powerup-timer").textContent =
      active.remainingMs === Infinity ? "" : `${Math.ceil(active.remainingMs / 1000)}s`;
  } else {
    puWrap.style.display = "none";
  }
}

export function setHudSkinIcon(skin) {
  const el = document.getElementById("hud-skin-icon");
  el.style.color = skin.colors.body;
}

// --- Game Over / Level Complete ------------------------------------------------

export function showGameOverStats({ score, highScore, foodCollected, timeMs }) {
  document.getElementById("go-score").textContent = score;
  document.getElementById("go-high-score").textContent = highScore;
  document.getElementById("go-food").textContent = foodCollected;
  document.getElementById("go-time").textContent = `${Math.floor(timeMs / 1000)}s`;
}

export function showLevelCompleteStats({ score, stars, unlockMsg }) {
  document.getElementById("lc-score").textContent = score;
  document.getElementById("lc-stars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  document.getElementById("lc-unlock").textContent = unlockMsg;
}

export function computeStars(level, score) {
  if (!level.starThresholds) return 0;
  const thresholds = level.starThresholds;
  if (score >= thresholds[3]) return 3;
  if (score >= thresholds[2]) return 2;
  if (score >= thresholds[1]) return 1;
  return 0;
}
