import { States } from "./state.js";

const KEY_MAP = {
  ArrowUp: "UP", KeyW: "UP",
  ArrowDown: "DOWN", KeyS: "DOWN",
  ArrowLeft: "LEFT", KeyA: "LEFT",
  ArrowRight: "RIGHT", KeyD: "RIGHT"
};

const SWIPE_THRESHOLD = 22;

export function initInput({ canvas, dpad, game, StateMachine, onPauseToggle, onFirstGesture, onAnyGesture }) {
  let gestureFired = false;
  const fireFirstGesture = () => {
    // Runs on every interaction, not just the first: iOS Safari can suspend/interrupt the
    // AudioContext mid-session (phone calls, Siri, backgrounding), and resuming it requires
    // a fresh user gesture each time - not just the very first one ever.
    onAnyGesture?.();
    if (gestureFired) return;
    gestureFired = true;
    onFirstGesture?.();
  };

  function requestDirection(dir) {
    if (StateMachine.current !== States.PLAYING) return;
    game.snake.requestDirection(dir);
  }

  document.addEventListener("keydown", (e) => {
    fireFirstGesture();
    if (KEY_MAP[e.code]) {
      requestDirection(KEY_MAP[e.code]);
      e.preventDefault();
      return;
    }
    if (e.code === "Escape" || e.code === "Space") {
      if (StateMachine.current === States.PLAYING || StateMachine.current === States.PAUSED) {
        onPauseToggle?.();
        e.preventDefault();
      }
    }
  });

  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    fireFirstGesture();
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      requestDirection(dx > 0 ? "RIGHT" : "LEFT");
    } else {
      requestDirection(dy > 0 ? "DOWN" : "UP");
    }
  }, { passive: true });

  dpad.querySelectorAll("[data-dpad]").forEach((btn) => {
    const dir = btn.dataset.dpad;
    btn.addEventListener("touchstart", (e) => {
      fireFirstGesture();
      requestDirection(dir);
      e.preventDefault();
    }, { passive: false });
    btn.addEventListener("click", () => {
      fireFirstGesture();
      requestDirection(dir);
    });
  });

  document.body.addEventListener("click", fireFirstGesture, { once: true });
  document.body.addEventListener("touchstart", fireFirstGesture, { once: true, passive: true });
}
