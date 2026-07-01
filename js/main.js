import { States, StateMachine } from "./state.js";
import { SaveData } from "./storage.js";
import { LEVELS, getLevel, nextLevelOf, makeClassicPseudoLevel } from "./levels.js";
import { getSkin } from "./snakes.js";
import { createGame, createGameLoop } from "./engine.js";
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
  const mode = levelIdOrClassic === "classic" ? "classic" : "level";
  const level = mode === "classic" ? makeClassicPseudoLevel() : getLevel(levelIdOrClassic);
  const game = createGame({
    level,
    mode,
    skinId: SaveData.data.selectedSkin,
    difficulty: SaveData.data.settings.difficulty
  });
  resizeToGame(game);
  return game;
}

function resizeToGame(game) {
  currentGame = game;
  resize();
}

function startGame(levelIdOrClassic) {
  currentLevelId = levelIdOrClassic;
  currentGame = newGameFor(levelIdOrClassic);
  setHudSkinIcon(getSkin(currentGame.snake.skinId));
  StateMachine.setState(States.PLAYING);
}

function restartLevel() {
  startGame(currentLevelId);
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
    const highScoreKey = currentLevelId === "classic" ? "classic" : null;
    let highScore;
    if (highScoreKey) {
      SaveData.recordClassicScore(game.score);
      highScore = SaveData.data.highScores.classic;
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
  getStepMs: () => currentGame.level.speed,
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
    if (SaveData.data.settings.musicOn) AudioSys.startMusic();
  }
});

// --- Screen navigation -----------------------------------------------------------

StateMachine.onChange((next) => {
  showState(next);
  if (next === States.LEVEL_SELECT) populateLevelSelect(startGame);
  if (next === States.SNAKE_SELECT) populateSnakeSelect(() => {});
  if (next === States.HIGH_SCORES) populateHighScores();
  if (next === States.SETTINGS) populateSettings();
  if (next === States.PLAYING) requestAnimationFrame(fullResize);
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
  if (e.target.checked) AudioSys.startMusic();
  else AudioSys.stopMusic();
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
