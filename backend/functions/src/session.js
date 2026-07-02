import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin.js";
import { requireAuth, requireActiveAccount } from "./helpers.js";
import { LEVELS, ALL_LEVEL_IDS } from "./gameData.js";
import { validateResult, sessionExpired } from "./validation.js";
import { computeNewlyUnlockedSkins } from "./unlocks.js";
import { writeAuditLog } from "./audit.js";

const VALID_MODES = new Set(["classic", "endless", "level"]);
// Simple per-player rate limit (28.5 "excessive session creation") - counts sessions
// started in the trailing window, not a sliding-window/token-bucket implementation.
const SESSION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const SESSION_RATE_LIMIT_MAX = 20;

/**
 * Spec 19.2, 26.2: creates a server-side session before any authenticated run that can
 * affect trusted progression. The frontend may only begin gameplay after this succeeds.
 */
export const startGameSession = onCall(async (request) => {
  const uid = requireAuth(request);
  const { mode, levelId = null, skinId, clientVersion = null } = request.data ?? {};

  if (!VALID_MODES.has(mode)) throw new HttpsError("invalid-argument", "Unknown game mode.");
  if (mode === "level" && !ALL_LEVEL_IDS.includes(levelId)) {
    throw new HttpsError("invalid-argument", "Unknown level.");
  }

  const profileRef = db.collection("players").doc(uid);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) throw new HttpsError("failed-precondition", "Player profile not found. Please sign in again.");
  const profile = profileSnap.data();
  requireActiveAccount(profile);

  if (!profile.unlockedSkins.includes(skinId)) {
    throw new HttpsError("failed-precondition", "Selected snake hasn't been unlocked yet.");
  }
  if (mode === "level" && !profile.unlockedLevels.includes(levelId)) {
    throw new HttpsError("failed-precondition", "Selected level hasn't been unlocked yet.");
  }

  // Composite equality+range query - requires the gameSessions(playerId, startedAt)
  // index in firestore.indexes.json. The emulator doesn't enforce this, only production.
  const windowStart = new Date(Date.now() - SESSION_RATE_LIMIT_WINDOW_MS);
  const recentSessions = await db.collection("gameSessions")
    .where("playerId", "==", uid)
    .where("startedAt", ">=", windowStart)
    .count().get();
  if (recentSessions.data().count >= SESSION_RATE_LIMIT_MAX) {
    await writeAuditLog({ playerId: uid, eventType: "excessive_session_creation", gameMode: mode, validationResult: "rejected", clientVersion });
    throw new HttpsError("resource-exhausted", "Too many game sessions started recently. Please slow down.");
  }

  const sessionRef = db.collection("gameSessions").doc();
  await sessionRef.set({
    playerId: uid,
    mode,
    levelId,
    skinId,
    clientVersion,
    startedAt: FieldValue.serverTimestamp(),
    endedAt: null,
    status: "active",
    submittedResult: null,
    validationStatus: null,
    validationReason: null
  });

  return { sessionId: sessionRef.id };
});

async function applyAcceptedResult({ uid, session, submission, flagged }) {
  const profileRef = db.collection("players").doc(uid);
  const profileSnap = await profileRef.get();
  const profile = profileSnap.data();

  const updates = { "lifetimeStats.totalRuns": FieldValue.increment(1) };
  if (Number.isInteger(submission.foodCollected)) {
    updates["lifetimeStats.totalFoodCollected"] = FieldValue.increment(submission.foodCollected);
  }

  let newHighScore = false;
  const eligibleForLeaderboard = !flagged;

  if (session.mode === "classic") {
    if (submission.score > profile.highScores.classic) {
      updates["highScores.classic"] = submission.score;
      newHighScore = true;
    }
  } else if (session.mode === "endless") {
    if (submission.score > profile.highScores.endless) {
      updates["highScores.endless"] = submission.score;
      newHighScore = true;
    }
  } else {
    const levelKey = String(session.levelId);
    const existing = profile.highScores.byLevel[levelKey];
    const completedNow = submission.completed === true;
    newHighScore = !existing || submission.score > existing.score;
    updates[`highScores.byLevel.${levelKey}`] = {
      score: Math.max(submission.score, existing?.score ?? 0),
      completed: completedNow || existing?.completed === true
    };
    if (completedNow) {
      const level = LEVELS[session.levelId];
      const nextId = session.levelId + 1;
      if (level && ALL_LEVEL_IDS.includes(nextId) && !profile.unlockedLevels.includes(nextId)) {
        updates.unlockedLevels = FieldValue.arrayUnion(nextId);
      }
    }
  }

  await profileRef.update(updates);

  // Re-read to compute unlocks against the post-update state (arrayUnion/increment
  // above aren't reflected in the local `profile` object).
  const updatedSnap = await profileRef.get();
  const updatedProfile = updatedSnap.data();
  const newlyUnlockedSkins = computeNewlyUnlockedSkins(updatedProfile);
  if (newlyUnlockedSkins.length) {
    await profileRef.update({ unlockedSkins: FieldValue.arrayUnion(...newlyUnlockedSkins) });
  }

  let leaderboardUpdated = false;
  if (eligibleForLeaderboard && (session.mode === "classic" || session.mode === "endless")) {
    const entryRef = db.collection("leaderboards").doc(session.mode).collection("entries").doc(uid);
    const entrySnap = await entryRef.get();
    if (!entrySnap.exists || submission.score > entrySnap.data().score) {
      await entryRef.set({
        playerId: uid,
        displayName: updatedProfile.displayName,
        score: submission.score,
        submittedAt: FieldValue.serverTimestamp()
      });
      leaderboardUpdated = true;
    }
  }

  return { newHighScore, newlyUnlockedSkins, leaderboardUpdated };
}

/**
 * Spec 19.3, 26.4-26.7, 27: validates a submitted run and, only if it passes, updates
 * cloud progression. The frontend never writes highScores/unlockedSkins/leaderboards
 * directly - this function is the only path.
 */
export const submitGameResult = onCall(async (request) => {
  const uid = requireAuth(request);
  const { sessionId, score, foodCollected, completed = false, clientVersion = null } = request.data ?? {};

  if (typeof sessionId !== "string" || !sessionId) {
    throw new HttpsError("invalid-argument", "Missing session id.");
  }

  const sessionRef = db.collection("gameSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Game session not found.");
  const session = sessionSnap.data();

  if (session.playerId !== uid) {
    throw new HttpsError("permission-denied", "This session does not belong to you.");
  }

  if (session.status !== "active") {
    // Duplicate submission for an already-closed session (26.5) - ignore idempotently
    // rather than erroring, since a flaky network retry is a normal client scenario.
    await writeAuditLog({ playerId: uid, sessionId, eventType: "duplicate_or_expired_submission", gameMode: session.mode, submittedScore: score, validationResult: "ignored", clientVersion });
    return { accepted: false, reason: "This run was already submitted." };
  }

  const startedAtMs = session.startedAt.toMillis();
  const nowMs = Date.now();

  if (sessionExpired(startedAtMs, nowMs)) {
    await sessionRef.update({ status: "expired", endedAt: FieldValue.serverTimestamp() });
    await writeAuditLog({ playerId: uid, sessionId, eventType: "duplicate_or_expired_submission", gameMode: session.mode, submittedScore: score, validationResult: "expired", clientVersion });
    return { accepted: false, reason: "This session expired before the result was submitted." };
  }

  const durationMs = nowMs - startedAtMs;
  const validation = validateResult(session, { score, foodCollected, completed }, durationMs);

  if (!validation.ok) {
    await sessionRef.update({
      status: "closed",
      endedAt: FieldValue.serverTimestamp(),
      submittedResult: { score, foodCollected, completed },
      validationStatus: "rejected",
      validationReason: validation.reason
    });
    await writeAuditLog({ playerId: uid, sessionId, eventType: "rejected_submission", gameMode: session.mode, submittedScore: score, validationResult: "rejected", reasonCode: validation.reason, clientVersion });
    return { accepted: false, reason: "We couldn't validate this run, so it was not saved to your cloud profile." };
  }

  const { newHighScore, newlyUnlockedSkins, leaderboardUpdated } = await applyAcceptedResult({
    uid, session, submission: { score, foodCollected, completed }, flagged: validation.flagged
  });

  await sessionRef.update({
    status: "closed",
    endedAt: FieldValue.serverTimestamp(),
    submittedResult: { score, foodCollected, completed },
    validationStatus: validation.flagged ? "flagged" : "accepted",
    validationReason: validation.flagged ? validation.reason : null
  });

  if (validation.flagged) {
    await writeAuditLog({ playerId: uid, sessionId, eventType: "flagged_submission", gameMode: session.mode, submittedScore: score, validationResult: "flagged", reasonCode: validation.reason, clientVersion });
  }

  return {
    accepted: true,
    flagged: validation.flagged === true,
    score,
    newHighScore,
    newlyUnlockedSkins,
    leaderboardUpdated
  };
});
