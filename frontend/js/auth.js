// Firebase Authentication wiring (Phase 3, Step 2 — identity only, no cloud saves yet).
// Loaded via dynamic import from main.js so a CDN/network hiccup can't take down
// the core game (see spec Part 5 Error Handling: "Network unavailable" must degrade
// gracefully, not break gameplay).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Set only by the tests/cloud/ Playwright fixture (page.add_init_script), before any page
// script runs - never true in production or normal local dev, so this can't accidentally
// point a real player's session at a local emulator. See .claude/skills/run/SKILL.md.
if (window.__USE_FIREBASE_EMULATORS__) {
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
}
const persistenceReady = setPersistence(auth, browserLocalPersistence);

let currentUser = null;
const listeners = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  for (const fn of listeners) fn(user);
});

export const AuthState = {
  get user() { return currentUser; },
  get isGuest() { return currentUser === null; },
  onChange(fn) { listeners.push(fn); }
};

export async function signInGoogle() {
  await persistenceReady;
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
}

export async function signInEmail(email, password) {
  await persistenceReady;
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signUpEmail({ email, password, displayName, avatarUrl }) {
  await persistenceReady;
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName, photoURL: avatarUrl });
  // updateProfile doesn't always re-fire onAuthStateChanged with the new fields on
  // every browser, so tell listeners about the now-complete profile directly.
  for (const fn of listeners) fn(auth.currentUser);
  return cred.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export function authErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/email-already-in-use":
      return "An account already exists with that email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/missing-password":
      return "Please enter a password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/network-request-failed":
      return "Unable to connect. Please check your internet connection.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
