import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { requireAuth } from "./helpers.js";

const LEADERBOARD_MODES = new Set(["classic", "endless"]);
const LEADERBOARD_LIMIT = 50;

/**
 * Spec 19.5, 21.5: returns validated leaderboard entries only. Never exposes anti-cheat
 * scores, audit notes, or other private profile fields - just what's needed to render
 * a rank list.
 */
export const getLeaderboard = onCall(async (request) => {
  requireAuth(request); // leaderboards are readable by any signed-in player (21.1), not guests
  const { mode } = request.data ?? {};
  if (!LEADERBOARD_MODES.has(mode)) {
    throw new HttpsError("invalid-argument", "Unsupported leaderboard mode.");
  }

  const snap = await db.collection("leaderboards").doc(mode).collection("entries")
    .orderBy("score", "desc")
    .limit(LEADERBOARD_LIMIT)
    .get();

  const entries = snap.docs.map((doc, index) => {
    const data = doc.data();
    return {
      rank: index + 1,
      playerId: doc.id,
      displayName: data.displayName,
      score: data.score,
      submittedAt: data.submittedAt ? data.submittedAt.toMillis() : null
    };
  });

  return { mode, entries };
});
