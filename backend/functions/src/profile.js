import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin.js";
import { requireAuth, requireActiveAccount, isSkinIdValid } from "./helpers.js";

// Default new-account state (spec 11.2, 17.4) - no Phase 2 localStorage progress ever
// carries over automatically; only importGuestData's narrow allowlist can seed anything.
function defaultProfile(authToken) {
  return {
    displayName: authToken.name || authToken.email?.split("@")[0] || "Player",
    photoURL: authToken.picture || null,
    createdAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    selectedSkin: "default",
    unlockedSkins: ["default"],
    unlockedLevels: [1],
    highScores: { classic: 0, endless: 0, byLevel: {} },
    achievements: [],
    lifetimeStats: { totalRuns: 0, totalFoodCollected: 0, totalPlayTimeMs: 0 },
    accountStatus: "active",
    riskScore: 0
  };
}

/**
 * Creates a cloud profile on first sign-in, or loads + touches lastLoginAt on return visits.
 * Spec 10.1, 11.1-11.2, 19.1.
 */
export const getOrCreatePlayerProfile = onCall(async (request) => {
  const uid = requireAuth(request);
  const ref = db.collection("players").doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const profile = defaultProfile(request.auth.token);
    await ref.set(profile);
    const created = await ref.get();
    return { profile: { id: uid, ...created.data() }, isNewAccount: true };
  }

  await ref.update({ lastLoginAt: FieldValue.serverTimestamp() });
  const fresh = await ref.get();
  return { profile: { id: uid, ...fresh.data() }, isNewAccount: false };
});

/**
 * Spec 19.4: only a controlled, backend-validated path may change a player's selected
 * snake - the frontend can request it, but the backend decides whether it's allowed.
 */
export const selectSnake = onCall(async (request) => {
  const uid = requireAuth(request);
  const { skinId } = request.data ?? {};
  if (!isSkinIdValid(skinId)) {
    throw new HttpsError("invalid-argument", "Unknown snake skin.");
  }

  const ref = db.collection("players").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Player profile not found. Please sign in again.");
  const profile = snap.data();
  requireActiveAccount(profile);

  if (!profile.unlockedSkins.includes(skinId)) {
    throw new HttpsError("failed-precondition", "That snake hasn't been unlocked yet.");
  }

  await ref.update({ selectedSkin: skinId });
  return { selectedSkin: skinId };
});
