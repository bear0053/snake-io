import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { requireAuth } from "./helpers.js";

// Sanity ceiling, independent of the per-session validation ceiling in validation.js -
// a guest could hand-edit localStorage before importing, so this is deliberately generous
// but not unbounded. Imported scores are personal-record-only and never leaderboard
// eligible (spec 12.3/21.2), so this is a light sanity check, not strict anti-cheat.
const GUEST_IMPORT_MAX_PLAUSIBLE_SCORE = 50000;

const SETTINGS_ALLOWLIST = ["musicOn", "sfxOn", "musicVolume", "difficulty", "controlType"];

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  const clean = {};
  for (const key of SETTINGS_ALLOWLIST) {
    if (key in settings) clean[key] = settings[key];
  }
  return Object.keys(clean).length ? clean : null;
}

/**
 * Spec 12.2-12.5, 19.6: imports only the narrow allowlist of guest localStorage data into
 * a freshly authenticated profile. Never imports unlocks, Level Mode progress, or
 * achievements - those begin fresh from the authenticated profile's default state.
 */
export const importGuestData = onCall(async (request) => {
  const uid = requireAuth(request);
  const { classicHighScore, endlessHighScore, settings } = request.data ?? {};

  const ref = db.collection("players").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Player profile not found. Please sign in again.");
  const profile = snap.data();

  const updates = {};
  const imported = {};

  if (Number.isFinite(classicHighScore) && classicHighScore >= 0) {
    const capped = Math.min(classicHighScore, GUEST_IMPORT_MAX_PLAUSIBLE_SCORE);
    if (capped > profile.highScores.classic) {
      updates["highScores.classic"] = capped;
      imported.classicHighScore = capped;
    }
  }
  if (Number.isFinite(endlessHighScore) && endlessHighScore >= 0) {
    const capped = Math.min(endlessHighScore, GUEST_IMPORT_MAX_PLAUSIBLE_SCORE);
    if (capped > profile.highScores.endless) {
      updates["highScores.endless"] = capped;
      imported.endlessHighScore = capped;
    }
  }
  const cleanSettings = sanitizeSettings(settings);
  if (cleanSettings) {
    updates.settings = cleanSettings;
    imported.settings = cleanSettings;
  }

  if (Object.keys(updates).length) {
    await ref.update(updates);
  }

  return { imported };
});
