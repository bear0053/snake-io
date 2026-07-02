import { States, StateMachine } from "./state.js";
import { SaveData } from "./storage.js";
import { LEVELS, getLevel, nextLevelOf, makeClassicPseudoLevel, makeEndlessPseudoLevel } from "./levels.js";
import { getSkin } from "./snakes.js";
import { createGame, createGameLoop } from "./engine.js";
import { hasActiveEffect } from "./powerups.js";
import { renderGame } from "./render.js";
import { initInput } from "./input.js";
import { createResizer } from "./resize.js";
import { AudioSys } from "./audio.js";
import {
  showState, setDpadVisible, populateLevelSelect, populateSnakeSelect,
  populateHighScores, populateSettings, updateHud, setHudSkinIcon,
  showGameOverStats, showLevelCompleteStats, computeStars
} from "./ui.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
const dpad = document.getElementById("dpad");

let currentGame = null;
let currentLevelId = null; // number | 'classic'

function newGameFor(levelIdOrClassic) {
  const mode = levelIdOrClassic === "classic" ? "classic" : levelIdOrClassic === "endless" ? "endless" : "level";
  const level = mode === "classic" ? makeClassicPseudoLevel()
    : mode === "endless" ? makeEndlessPseudoLevel()
    : getLevel(levelIdOrClassic);
  return createGame({
    level,
    mode,
    skinId: SaveData.data.selectedSkin,
    difficulty: SaveData.data.settings.difficulty
  });
}

function startGame(levelIdOrClassic) {
  currentLevelId = levelIdOrClassic;
  currentGame = newGameFor(levelIdOrClassic);
  resize();
  setHudSkinIcon(getSkin(currentGame.snake.skinId));
  StateMachine.setState(States.PLAYING);
}

function restartLevel() {
  startGame(currentLevelId);
}

// Music always matches the theme of whatever's on screen: the active level's theme while
// playing/paused, or the calm menu track everywhere else (menus, game over, level complete).
function currentMusicTheme() {
  const playingOrPaused = StateMachine.current === States.PLAYING || StateMachine.current === States.PAUSED;
  if (playingOrPaused && currentGame) return currentGame.level.theme;
  return "menu";
}

function syncMusicForState() {
  if (!SaveData.data.settings.musicOn) return;
  AudioSys.startMusic(currentMusicTheme());
}

function handleGameEnded(game) {
  if (game.endReason === "objective") {
    const stars = computeStars(game.level, game.score);
    const isNewHigh = SaveData.recordLevelResult(currentLevelId, {
      score: game.score,
      stars,
      timeMs: game.elapsedMs,
      foodCollected: game.foodCollected,
      completed: true
    });
    let unlockMsg = "-";
    const next = nextLevelOf(currentLevelId);
    if (next && !SaveData.isLevelUnlocked(next.id)) {
      SaveData.unlockLevel(next.id);
      unlockMsg = `${next.name} unlocked!`;
    } else if (next) {
      unlockMsg = "Level replayed";
    } else {
      unlockMsg = "All levels complete!";
    }
    showLevelCompleteStats({ score: game.score, stars, unlockMsg });
    StateMachine.setState(States.LEVEL_COMPLETE);
  } else {
    let highScore;
    if (currentLevelId === "classic" || currentLevelId === "endless") {
      if (currentLevelId === "endless") {
        SaveData.recordEndlessScore(game.score);
        highScore = SaveData.data.highScores.endless;
      } else {
        SaveData.recordClassicScore(game.score);
        highScore = SaveData.data.highScores.classic;
      }
    } else {
      SaveData.recordLevelResult(currentLevelId, {
        score: game.score,
        stars: 0,
        timeMs: game.elapsedMs,
        foodCollected: game.foodCollected,
        completed: false
      });
      highScore = SaveData.data.highScores.byLevel[String(currentLevelId)]?.score ?? game.score;
    }
    showGameOverStats({
      score: game.score,
      highScore,
      foodCollected: game.foodCollected,
      timeMs: game.elapsedMs
    });
    StateMachine.setState(States.GAME_OVER);
  }
}

// --- Game loop wiring --------------------------------------------------------

createGameLoop({
  ctx,
  render(game, interp) {
    renderGame(ctx, game, interp);
    if (StateMachine.current === States.PLAYING) updateHud(game);
  },
  isActive: () => StateMachine.current === States.PLAYING,
  getStepMs: () => currentGame.level.speed * (hasActiveEffect(currentGame.snake, "slow_time") ? 1.6 : 1),
  getGame: () => currentGame,
  onEnded: handleGameEnded
});

// --- Resize --------------------------------------------------------------------

const resize = createResizer(canvas, ctx, { get level() { return currentGame?.level; }, set canvasCssSize(v) { if (currentGame) currentGame.canvasCssSize = v; }, set cellPx(v) { if (currentGame) currentGame.cellPx = v; } }, hud, dpad);

function fullResize() {
  resize();
}
window.addEventListener("load", fullResize);

// --- Input -----------------------------------------------------------------------

function togglePause() {
  if (StateMachine.current === States.PLAYING) {
    StateMachine.setState(States.PAUSED);
  } else if (StateMachine.current === States.PAUSED) {
    StateMachine.setState(States.PLAYING);
  }
}

initInput({
  canvas,
  dpad,
  game: { get snake() { return currentGame?.snake; } },
  StateMachine,
  onPauseToggle: togglePause,
  onFirstGesture: () => {
    AudioSys.ensureContext();
    AudioSys.resume();
    AudioSys.applySettings(SaveData.data.settings);
    syncMusicForState();
  },
  onAnyGesture: () => AudioSys.resume()
});

// iOS Safari can also suspend/interrupt audio while the tab is backgrounded; try to
// recover as soon as the page becomes visible again (in addition to on the next gesture).
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) AudioSys.resume();
});

// --- Screen navigation -----------------------------------------------------------

StateMachine.onChange((next) => {
  showState(next);
  if (next === States.LEVEL_SELECT) populateLevelSelect(startGame);
  if (next === States.SNAKE_SELECT) populateSnakeSelect(() => {});
  if (next === States.HIGH_SCORES) populateHighScores();
  if (next === States.SETTINGS) populateSettings();
  if (next === States.PLAYING) requestAnimationFrame(fullResize);
  syncMusicForState();
});

document.addEventListener("click", (e) => {
  const navBtn = e.target.closest("[data-nav]");
  const actionBtn = e.target.closest("[data-action]");
  if (!navBtn && !actionBtn) return;

  if (AudioSys && document.body) AudioSys.playSfx("click");

  if (navBtn) {
    StateMachine.setState(navBtn.dataset.nav);
    return;
  }

  switch (actionBtn.dataset.action) {
    case "play-classic":
      startGame("classic");
      break;
    case "play-endless":
      startGame("endless");
      break;
    case "resume":
      StateMachine.setState(States.PLAYING);
      break;
    case "toggle-pause":
      togglePause();
      break;
    case "restart-level":
      restartLevel();
      break;
    case "quit-to-menu":
      currentGame = null;
      StateMachine.setState(States.MENU);
      break;
    case "next-level": {
      const next = nextLevelOf(currentLevelId);
      if (next && SaveData.isLevelUnlocked(next.id)) {
        startGame(next.id);
      } else {
        StateMachine.setState(States.MENU);
      }
      break;
    }
  }
});

// --- Settings wiring ---------------------------------------------------------------

document.getElementById("setting-music").addEventListener("change", (e) => {
  SaveData.updateSettings({ musicOn: e.target.checked });
  AudioSys.applySettings(SaveData.data.settings);
  if (e.target.checked) syncMusicForState();
  else AudioSys.stopMusic();
});
document.getElementById("setting-music-volume").addEventListener("input", (e) => {
  SaveData.updateSettings({ musicVolume: Number(e.target.value) / 100 });
  AudioSys.applySettings(SaveData.data.settings);
});
document.getElementById("setting-sfx").addEventListener("change", (e) => {
  SaveData.updateSettings({ sfxOn: e.target.checked });
  AudioSys.applySettings(SaveData.data.settings);
});
document.getElementById("setting-difficulty").addEventListener("change", (e) => {
  SaveData.updateSettings({ difficulty: e.target.value });
});
document.getElementById("setting-controls").addEventListener("change", (e) => {
  SaveData.updateSettings({ controlType: e.target.value });
  applyDpadVisibility();
});
document.getElementById("reset-progress-btn").addEventListener("click", () => {
  if (confirm("Reset all progress, unlocks, and settings?")) {
    SaveData.resetProgress();
    populateSettings();
  }
});

function applyDpadVisibility() {
  const control = SaveData.data.settings.controlType;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const visible = control === "touch" || (control === "auto" && coarse);
  setDpadVisible(visible);
  requestAnimationFrame(fullResize);
}

// --- Boot ----------------------------------------------------------------------------

populateSettings();
applyDpadVisibility();
StateMachine.setState(States.MENU);
fullResize();

// --- Debug hook (test-only) --------------------------------------------------
// Exposed only when served locally - never in production (GitHub Pages serves from
// a different hostname) - so the automated suite in tests/ can drive and inspect
// game state directly instead of only clicking through the DOM. See the `run` skill.
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  window.__debug = { getGame: () => currentGame, startGame, currentMusicTheme, saveData: SaveData, StateMachine, States };
}
