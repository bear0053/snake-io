export const States = Object.freeze({
  MENU: "screen-menu",
  LEVEL_SELECT: "screen-level-select",
  SNAKE_SELECT: "screen-snake-select",
  HIGH_SCORES: "screen-high-scores",
  SETTINGS: "screen-settings",
  HOW_TO_PLAY: "screen-how-to-play",
  SIGN_IN: "screen-sign-in",
  SIGN_UP: "screen-sign-up",
  ACCOUNT: "screen-account",
  LEVEL_LOCKED: "screen-level-locked",
  PLAYING: "playing",
  PAUSED: "screen-pause",
  GAME_OVER: "screen-game-over",
  LEVEL_COMPLETE: "screen-level-complete"
});

const OVERLAY_STATES = new Set(Object.values(States).filter(s => s !== States.PLAYING));

class GameStateMachine {
  #current = States.MENU;
  #listeners = [];

  get current() {
    return this.#current;
  }

  onChange(fn) {
    this.#listeners.push(fn);
  }

  setState(next, payload) {
    const prev = this.#current;
    this.#current = next;
    for (const fn of this.#listeners) fn(next, prev, payload);
  }

  isOverlay(state) {
    return OVERLAY_STATES.has(state);
  }
}

export const StateMachine = new GameStateMachine();
