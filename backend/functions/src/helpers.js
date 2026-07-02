import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { ALL_SKIN_IDS } from "./gameData.js";

export function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to continue.");
  }
  return request.auth.uid;
}

export async function getProfileOrThrow(uid) {
  const snap = await db.collection("players").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Player profile not found. Please sign in again.");
  }
  return snap.data();
}

export function requireActiveAccount(profile) {
  if (profile.accountStatus !== "active") {
    throw new HttpsError("permission-denied", "This account is currently restricted.");
  }
}

export function isSkinIdValid(skinId) {
  return ALL_SKIN_IDS.includes(skinId);
}
