// Cloud Functions client wrapper (Phase 3, Step 5). Loaded via dynamic import from
// main.js alongside auth.js, same resilience rationale: a CDN/network failure here must
// degrade to local-only play, not break the game (spec Part 5 Error Handling).
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";
import { app } from "./auth.js";

const functions = getFunctions(app);
// See auth.js - set only by the tests/cloud/ Playwright fixture, never in production.
if (window.__USE_FIREBASE_EMULATORS__) {
  connectFunctionsEmulator(functions, "localhost", 5001);
}

function callable(name) {
  const fn = httpsCallable(functions, name);
  return async (data) => (await fn(data)).data;
}

export const getOrCreatePlayerProfile = callable("getOrCreatePlayerProfile");
export const startGameSession = callable("startGameSession");
export const submitGameResult = callable("submitGameResult");
export const selectSnakeRemote = callable("selectSnake");
export const getLeaderboard = callable("getLeaderboard");
export const importGuestData = callable("importGuestData");

export function backendErrorMessage(error) {
  switch (error?.code) {
    case "functions/unauthenticated":
      return "Please sign in to continue.";
    case "functions/failed-precondition":
    case "functions/permission-denied":
      return error.message || "That action isn't available right now.";
    case "functions/resource-exhausted":
      return "Please slow down and try again in a moment.";
    case "functions/unavailable":
    case "functions/deadline-exceeded":
      return "Unable to connect. Please check your internet connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}
