import { States, StateMachine } from "./state.js";
import { SaveData } from "./storage.js";
import { LEVELS, getLevel, nextLevelOf, makeClassicPseudoLevel, makeEndlessPseudoLevel } from "./levels.js";
import { getSkin, SKINS } from "./snakes.js";
import { createGame, createGameLoop } from "./engine.js";
import { hasActiveEffect } from "./powerups.js";
import { renderGame } from "./render.js";
import { initInput } from "./input.js";
import { createResizer } from "./resize.js";
import { AudioSys } from "./audio.js";
import {
  showState, setDpadVisible, populateLevelSelect, populateSnakeSelect,
  populateHighScores, populateSettings, updateHud, setHudSkinIcon,
  showGameOverStats, showLevelCompleteStats, computeStars,
  updateAccountBar, showAccountDetails, populateAvatarPicker, showFormError, clearFormError,
  setFeatureLockedContent, setLeaderboardModeActive, populateLeaderboard, showLeaderboardError,
  populateAchievements
} from "./ui.js";
import { AVATARS } from "./avatars.js";
import { getAchievement } from "./achievements.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
const dpad = document.getElementById("dpad");

let currentGame = null;
let currentLevelId = null; // number | 'classic'

function gameModeFor(levelIdOrClassic) {
  return levelIdOrClassic === "classic" ? "classic" : levelIdOrClassic === "endless" ? "endless" : "level";
}

// Guests can only ever play as the Default Snake, even if stale local data has
// selectedSkin pointing at something else (e.g. from before signing out).
function currentSkinId() {
  return isGuest() && SaveData.data.selectedSkin !== "default" ? "default" : SaveData.data.selectedSkin;
}

function newGameFor(levelIdOrClassic) {
  const mode = gameModeFor(levelIdOrClassic);
  const level = mode === "classic" ? makeClassicPseudoLevel()
    : mode === "endless" ? makeEndlessPseudoLevel()
    : getLevel(levelIdOrClassic);
  return createGame({
    level,
    mode,
    skinId: currentSkinId(),
    difficulty: SaveData.data.settings.difficulty
  });
}

let currentSessionId = null;
let gameStarting = false;
let leaderboardMode = "classic";

// Spec 19.2, 26.2: authenticated runs need a backend-created session before gameplay can
// begin and affect trusted progression; guests (and the test-only guest override, which
// has no real Firebase user) skip this and start instantly, exactly as before.
async function startGame(levelIdOrClassic) {
  if (gameStarting) return;
  gameStarting = true;
  clearFormError("menu-session-error");
  currentSessionId = null;

  if (hasRealAuthSession()) {
    const mode = gameModeFor(levelIdOrClassic);
    try {
      const session = await backendApi.startGameSession({
        mode,
        levelId: mode === "level" ? levelIdOrClassic : null,
        skinId: currentSkinId()
      });
      currentSessionId = session.sessionId;
    } catch (err) {
      gameStarting = false;
      showFormError("menu-session-error", backendApi.backendErrorMessage(err));
      return;
    }
  }

  gameStarting = false;
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

// Records the run locally (through SaveData - the guest store, or the cached cloud
// profile while in cloud mode) and shows the Game Over screen.
function recordAndShowGameOver(game, cloudNote) {
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
    timeMs: game.elapsedMs,
    cloudNote: cloudNote ?? guestUnlockUpsell(currentLevelId, game.score)
  });
  StateMachine.setState(States.GAME_OVER);
}

// Spec 22.2: a rejected run is never written to SaveData (local cache or guest store) -
// just displayed, with a friendly explanation of why it wasn't saved.
function showGameOverWithoutRecording(game, cloudNote) {
  const highScore = currentLevelId === "endless" ? SaveData.data.highScores.endless
    : currentLevelId === "classic" ? SaveData.data.highScores.classic
    : SaveData.data.highScores.byLevel[String(currentLevelId)]?.score ?? game.score;
  showGameOverStats({ score: game.score, highScore, foodCollected: game.foodCollected, timeMs: game.elapsedMs, cloudNote });
  StateMachine.setState(States.GAME_OVER);
}

function recordAndShowLevelComplete(game, cloudNote) {
  const stars = computeStars(game.level, game.score);
  SaveData.recordLevelResult(currentLevelId, {
    score: game.score,
    stars,
    timeMs: game.elapsedMs,
    foodCollected: game.foodCollected,
    completed: true
  });
  let unlockMsg = cloudNote ?? "-";
  const next = nextLevelOf(currentLevelId);
  if (!cloudNote) {
    if (next && !SaveData.isLevelUnlocked(next.id)) {
      SaveData.unlockLevel(next.id);
      unlockMsg = `${next.name} unlocked!`;
    } else if (next) {
      unlockMsg = "Level replayed";
    } else {
      unlockMsg = "All levels complete!";
    }
  }
  showLevelCompleteStats({ score: game.score, stars, unlockMsg });
  StateMachine.setState(States.LEVEL_COMPLETE);
}

// Spec 19.3, 26.4, 27, 22: authenticated runs are submitted to the backend for
// validation before any progression is recorded locally - an accepted run records
// exactly like the guest/local path (SaveData writes through to the cached cloud
// profile while in cloud mode), a rejected one records nothing and shows why instead.
async function handleGameEnded(game) {
  const completed = game.endReason === "objective";
  let accepted = true;
  let cloudNote = null;

  // Submit whenever a session was actually created for this run. Deliberately not also
  // re-checking hasRealAuthSession() here - the backend independently verifies the
  // session belongs to the caller, so a second, redundant *current*-auth-state check here
  // adds nothing except a way for this to disagree with the session that was actually
  // created at the start of the run.
  if (currentSessionId) {
    const sessionId = currentSessionId;
    currentSessionId = null;
    try {
      const result = await backendApi.submitGameResult({
        sessionId,
        score: game.score,
        foodCollected: game.foodCollected,
        completed
      });
      accepted = result.accepted;
      if (!accepted) {
        cloudNote = result.reason || "We couldn't validate this run, so it was not saved to your cloud profile.";
      } else {
        if (result.newlyEarnedAchievements?.length) SaveData.addAchievements(result.newlyEarnedAchievements);
        if (result.flagged) {
          cloudNote = "This run is under review, so it won't count toward the leaderboard yet.";
        } else {
          const parts = [];
          if (result.newlyUnlockedSkins?.length) {
            parts.push(`${result.newlyUnlockedSkins.map(id => getSkin(id).name).join(", ")} unlocked!`);
          }
          if (result.newlyEarnedAchievements?.length) {
            const names = result.newlyEarnedAchievements.map(id => getAchievement(id)?.name ?? id).join(", ");
            parts.push(`Achievement earned: ${names}`);
          }
          if (parts.length) cloudNote = parts.join(" ");
        }
      }
    } catch (err) {
      accepted = false;
      cloudNote = backendApi?.backendErrorMessage(err) ?? "Unable to connect. Your result could not be validated.";
    }
  }

  if (!accepted) {
    showGameOverWithoutRecording(game, cloudNote);
  } else if (completed) {
    recordAndShowLevelComplete(game, cloudNote);
  } else {
    recordAndShowGameOver(game, cloudNote);
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
  if (next === States.SNAKE_SELECT) populateSnakeSelect(handleSelectSkin);
  if (next === States.HIGH_SCORES) populateHighScores();
  if (next === States.SETTINGS) populateSettings();
  if (next === States.SIGN_IN) clearFormError("sign-in-error");
  if (next === States.SIGN_UP) {
    clearFormError("sign-up-error");
    populateAvatarPicker(selectedAvatarId, (id) => { selectedAvatarId = id; });
  }
  if (next === States.ACCOUNT && authApi?.AuthState.user) showAccountDetails(authApi.AuthState.user);
  if (next === States.LEADERBOARD) loadLeaderboard(leaderboardMode);
  if (next === States.ACHIEVEMENTS) populateAchievements();
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
    case "nav-level-select":
      navigateToGatedFeature(
        "Level Mode",
        "Level Mode saves your progress, unlocks new snakes, and tracks achievements. Sign in with a free account to begin your adventure.",
        States.LEVEL_SELECT
      );
      break;
    case "nav-leaderboard":
      navigateToGatedFeature(
        "Leaderboard",
        "Leaderboards are for signed-in players only. Sign in with a free account to see how you stack up.",
        States.LEADERBOARD
      );
      break;
    case "nav-achievements":
      navigateToGatedFeature(
        "Achievements",
        "Achievements are tracked for signed-in players only. Sign in with a free account to start earning them.",
        States.ACHIEVEMENTS
      );
      break;
    case "leaderboard-classic":
      loadLeaderboard("classic");
      break;
    case "leaderboard-endless":
      loadLeaderboard("endless");
      break;
    case "sign-in-google":
      handleSignInGoogle();
      break;
    case "continue-as-guest":
      StateMachine.setState(States.MENU);
      break;
    case "sign-out":
      handleSignOut();
      break;
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
  if (!SaveData.isGuest) {
    alert("Progress reset isn't available for signed-in accounts. Sign out to reset your local guest progress instead.");
    return;
  }
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

// --- Auth + Backend --------------------------------------------------------------------
// Loaded dynamically so a CDN/network failure degrades to guest-only play instead of
// breaking the game (players should never be blocked from launching by a login screen).

let authApi = null;
let backendApi = null;
let selectedAvatarId = AVATARS[0].id;

Promise.all([import("./auth.js"), import("./backend.js")]).then(([auth, backend]) => {
  authApi = auth;
  backendApi = backend;
  authApi.AuthState.onChange(handleAuthStateChange);
  handleAuthStateChange(authApi.AuthState.user);
}).catch((err) => {
  console.warn("Firebase unavailable, continuing in guest-only mode:", err);
});

// SaveData.isGuest is the single source of truth for gating/display (Level Select lock,
// skin-unlock computation, upsell-vs-cloud-note messaging) and is what the test-only
// debug override manipulates. hasRealAuthSession() is a separate, narrower check for
// whether backend session/submit calls should actually be attempted - it only reflects a
// real Firebase sign-in, so the debug override (which never touches Firebase) can drive
// UI/progression state for tests without hitting a real or undeployed backend.
function isGuest() {
  return SaveData.isGuest;
}

function hasRealAuthSession() {
  return !!authApi?.AuthState.user;
}

// Spec 8.3, 13.1, 21.1: Level Mode, the leaderboard, and achievements are all
// authenticated-only - guests land on the shared "sign in to unlock this" screen.
function navigateToGatedFeature(title, message, unlockedState) {
  if (isGuest()) {
    setFeatureLockedContent(title, message);
    StateMachine.setState(States.FEATURE_LOCKED);
  } else {
    StateMachine.setState(unlockedState);
  }
}

async function loadLeaderboard(mode) {
  leaderboardMode = mode;
  setLeaderboardModeActive(mode);
  if (!backendApi || !hasRealAuthSession()) {
    showLeaderboardError("Leaderboard is currently unavailable.");
    return;
  }
  try {
    const { entries } = await backendApi.getLeaderboard({ mode });
    populateLeaderboard(entries, authApi?.AuthState.user?.uid ?? null);
  } catch (err) {
    console.warn("Failed to load leaderboard", err);
    showLeaderboardError(backendApi.backendErrorMessage(err));
  }
}

let guestOverrideActive = false; // test-only; see window.__debug.setGuestOverride below
let authStateSyncInFlight = null;

// Spec 10.1, 12: fetches/creates the cloud profile on sign-in and caches it locally
// (SaveData.enterCloudMode), or restores the guest store on sign-out (exitCloudMode).
// First-time accounts get a one-shot import of the guest device's local high
// scores/settings (spec 12.2-12.5) - never unlocks, Level Mode progress, or achievements.
async function handleAuthStateChange(user) {
  // Firebase's own auth-state resolution is async and can fire well after a test has
  // forced a guest/cloud override - without this guard it would silently clobber the
  // override back to guest mode once it resolves ("no real session found").
  if (guestOverrideActive) return;
  updateAccountBar(user);
  if (!user) {
    SaveData.exitCloudMode();
    return;
  }
  if (!backendApi) return;

  // This listener can fire more than once in quick succession for a single sign-in
  // (Firebase's own onAuthStateChanged, plus signUpEmail's manual re-emit once
  // updateProfile's displayName/photoURL land) - without this guard, two overlapping
  // getOrCreatePlayerProfile()+enterCloudMode() calls can race each other (observed
  // directly: occasionally left SaveData stuck in guest mode after a real sign-up).
  if (authStateSyncInFlight) return authStateSyncInFlight;
  authStateSyncInFlight = (async () => {
    try {
      const { profile, isNewAccount } = await backendApi.getOrCreatePlayerProfile();
      if (isNewAccount) {
        const guestSnapshot = SaveData.guestData;
        try {
          const { imported } = await backendApi.importGuestData({
            classicHighScore: guestSnapshot.highScores.classic,
            endlessHighScore: guestSnapshot.highScores.endless,
            settings: guestSnapshot.settings
          });
          if (imported.classicHighScore !== undefined) profile.highScores.classic = imported.classicHighScore;
          if (imported.endlessHighScore !== undefined) profile.highScores.endless = imported.endlessHighScore;
          if (imported.settings) profile.settings = { ...profile.settings, ...imported.settings };
        } catch (err) {
          console.warn("Guest data import failed", err);
        }
      }
      SaveData.enterCloudMode(profile);
    } catch (err) {
      console.warn("Failed to load cloud profile, account bar will show signed-in but progress may be stale", err);
    } finally {
      authStateSyncInFlight = null;
    }
  })();
  return authStateSyncInFlight;
}

function guestUnlockUpsell(levelIdOrClassic, score) {
  if (levelIdOrClassic !== "endless" || !isGuest()) return null;
  const skin = SKINS.find(s => s.unlock.type === "endless_score" && score >= s.unlock.target);
  if (!skin) return null;
  return `Amazing run! You scored over ${skin.unlock.target} in Endless Mode. Create a free account and do it again to permanently unlock ${skin.name}.`;
}

// Spec 19.4: snake selection is backend-validated for authenticated players; the local
// selection only changes once the backend confirms it (guests/test-override select
// locally, same as before).
async function handleSelectSkin(skinId) {
  if (hasRealAuthSession()) {
    try {
      await backendApi.selectSnakeRemote({ skinId });
    } catch (err) {
      console.warn("Failed to select snake", err);
      return;
    }
  }
  SaveData.selectSkin(skinId);
  populateSnakeSelect(handleSelectSkin);
}

function requireAuthApi(errorElId) {
  if (!authApi) {
    showFormError(errorElId, "Sign-in is currently unavailable. Please try again later.");
    return null;
  }
  return authApi;
}

document.getElementById("sign-in-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormError("sign-in-error");
  const api = requireAuthApi("sign-in-error");
  if (!api) return;
  const email = document.getElementById("sign-in-email").value;
  const password = document.getElementById("sign-in-password").value;
  try {
    await api.signInEmail(email, password);
    e.target.reset();
    StateMachine.setState(States.MENU);
  } catch (err) {
    showFormError("sign-in-error", api.authErrorMessage(err));
  }
});

document.getElementById("sign-up-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFormError("sign-up-error");
  const api = requireAuthApi("sign-up-error");
  if (!api) return;
  const displayName = document.getElementById("sign-up-name").value.trim();
  const email = document.getElementById("sign-up-email").value;
  const password = document.getElementById("sign-up-password").value;
  const avatarUrl = AVATARS.find(a => a.id === selectedAvatarId)?.url ?? AVATARS[0].url;
  try {
    await api.signUpEmail({ email, password, displayName, avatarUrl });
    e.target.reset();
    selectedAvatarId = AVATARS[0].id;
    StateMachine.setState(States.MENU);
  } catch (err) {
    showFormError("sign-up-error", api.authErrorMessage(err));
  }
});

async function handleSignInGoogle() {
  clearFormError("sign-in-error");
  const api = requireAuthApi("sign-in-error");
  if (!api) return;
  try {
    await api.signInGoogle();
    StateMachine.setState(States.MENU);
  } catch (err) {
    showFormError("sign-in-error", api.authErrorMessage(err));
  }
}

async function handleSignOut() {
  if (!authApi) return;
  await authApi.signOutUser();
  StateMachine.setState(States.MENU);
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
  window.__debug = {
    getGame: () => currentGame, startGame, currentMusicTheme, saveData: SaveData, StateMachine, States,
    // Promotes the current guest data into SaveData's cloud-mode cache (v=false) or
    // restores guest mode (v=true), bypassing real Firebase auth entirely - lets tests
    // exercise authenticated-only UI/progression without a real or deployed backend.
    // Real end-to-end auth/backend testing uses the Firebase emulators (see the `run` skill).
    setGuestOverride: (v) => {
      guestOverrideActive = true;
      v ? SaveData.exitCloudMode() : SaveData.enterCloudMode(SaveData.guestData);
    }
  };
}
