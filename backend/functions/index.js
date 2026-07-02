// Snake Odyssey Phase 3 Cloud Functions entry point. Each callable function lives in its
// own module under src/ - this file just re-exports them for Firebase to discover.
export { getOrCreatePlayerProfile, selectSnake } from "./src/profile.js";
export { startGameSession, submitGameResult } from "./src/session.js";
export { getLeaderboard } from "./src/leaderboard.js";
export { importGuestData } from "./src/guestImport.js";
