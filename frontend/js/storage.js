const GUEST_KEY = "snakeio_save_v1";
const CLOUD_CACHE_KEY = "snakeio_cloud_cache_v1";

const DEFAULT_SAVE = {
  version: 1,
  unlockedLevels: [1],
  unlockedSkins: ["default"],
  selectedSkin: "default",
  highScores: {
    classic: 0,
    endless: 0,
    byLevel: {}
  },
  settings: {
    musicOn: true,
    sfxOn: true,
    musicVolume: 0.6,
    difficulty: "normal",
    controlType: "auto"
  }
};

function migrate(data) {
  if (!data.version) data.version = 1;
  // Fill in any missing keys from DEFAULT_SAVE (forward-compat for future fields)
  const merged = structuredClone(DEFAULT_SAVE);
  return deepMerge(merged, data);
}

function deepMerge(base, override) {
  for (const key of Object.keys(override)) {
    if (
      override[key] && typeof override[key] === "object" && !Array.isArray(override[key]) &&
      base[key] && typeof base[key] === "object" && !Array.isArray(base[key])
    ) {
      deepMerge(base[key], override[key]);
    } else {
      base[key] = override[key];
    }
  }
  return base;
}

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persist(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage unavailable (private mode / quota) - fail silently, game still playable
  }
}

// Phase 3 source-of-truth split (spec 6.4-6.5): guestData is the trusted store for Guest
// Players and is never touched by cloud sync. cloudData is a local, non-authoritative
// cache of the authenticated player's cloud profile - populated on sign-in, cleared on
// sign-out, and always superseded by the backend on the next fetch. `mode` selects which
// one `this.data` currently points at, so every existing read/write call site (isGuest
// aside) works unchanged regardless of which player type is active.
class SaveStore {
  constructor() {
    try {
      this.guestData = migrate(load(GUEST_KEY) ?? {});
    } catch {
      this.guestData = structuredClone(DEFAULT_SAVE);
    }
    this.cloudData = load(CLOUD_CACHE_KEY);
    this.mode = "guest";
  }

  get data() {
    return this.mode === "cloud" && this.cloudData ? this.cloudData : this.guestData;
  }

  get isGuest() {
    return this.mode === "guest";
  }

  save() {
    if (this.mode === "cloud" && this.cloudData) persist(CLOUD_CACHE_KEY, this.cloudData);
    else persist(GUEST_KEY, this.guestData);
  }

  // Called after a successful sign-in once the cloud profile has been fetched (spec
  // 10.1, 14.4). `profile` only needs to look save-shaped; unrecognized/missing fields
  // fall back to sane defaults so a partial or test-supplied profile still works.
  enterCloudMode(profile) {
    this.mode = "cloud";
    this.cloudData = {
      version: 1,
      unlockedLevels: profile.unlockedLevels ?? [1],
      unlockedSkins: profile.unlockedSkins ?? ["default"],
      selectedSkin: profile.selectedSkin ?? "default",
      highScores: profile.highScores ?? { classic: 0, endless: 0, byLevel: {} },
      settings: { ...this.guestData.settings, ...(profile.settings ?? {}) },
      achievements: profile.achievements ?? [],
      displayName: profile.displayName ?? null,
      photoURL: profile.photoURL ?? null
    };
    this.save();
  }

  // Spec 10.4: signing out returns to Guest Mode and preserves (never deletes) cloud
  // progress - guestData was never touched while in cloud mode, so it's already intact.
  exitCloudMode() {
    this.mode = "guest";
    this.cloudData = null;
    try {
      localStorage.removeItem(CLOUD_CACHE_KEY);
    } catch {
      // ignore - non-fatal, just leaves a stale cache entry
    }
  }

  isLevelUnlocked(levelId) {
    return this.data.unlockedLevels.includes(levelId);
  }

  unlockLevel(levelId) {
    if (!this.data.unlockedLevels.includes(levelId)) {
      this.data.unlockedLevels.push(levelId);
      this.save();
    }
  }

  // Guests never get permanent unlocks (Phase 3: unlocks are authenticated-only) -
  // only the Default Snake is selectable, even if the underlying local stats would
  // otherwise satisfy an unlock condition (e.g. a 500+ Endless score).
  isSkinUnlocked(skin, allLevelIds) {
    if (skin.unlock.type === "default") return true;
    if (this.isGuest) return false;
    if (this.data.unlockedSkins.includes(skin.id)) return true;
    if (skin.unlock.type === "complete_level") {
      return this.data.unlockedLevels.includes(skin.unlock.levelId) &&
        this.data.highScores.byLevel[String(skin.unlock.levelId)]?.completed === true;
    }
    if (skin.unlock.type === "complete_all_levels") {
      return allLevelIds.every(id => this.data.highScores.byLevel[String(id)]?.completed === true);
    }
    if (skin.unlock.type === "endless_score") {
      return this.data.highScores.endless >= skin.unlock.target;
    }
    return false;
  }

  selectSkin(skinId) {
    this.data.selectedSkin = skinId;
    this.save();
  }

  // Achievements are never computed client-side (see achievements.js) - this just caches
  // whatever the backend already awarded, so the Achievements screen doesn't need a
  // fresh profile fetch to reflect a run that just earned one.
  addAchievements(ids) {
    if (!ids?.length) return;
    const current = this.data.achievements ?? (this.data.achievements = []);
    for (const id of ids) {
      if (!current.includes(id)) current.push(id);
    }
    this.save();
  }

  recordClassicScore(score) {
    if (score > this.data.highScores.classic) {
      this.data.highScores.classic = score;
      this.save();
      return true;
    }
    return false;
  }

  recordEndlessScore(score) {
    if (score > this.data.highScores.endless) {
      this.data.highScores.endless = score;
      this.save();
      return true;
    }
    return false;
  }

  recordLevelResult(levelId, { score, stars, timeMs, foodCollected, completed }) {
    const key = String(levelId);
    const existing = this.data.highScores.byLevel[key];
    const isNewHigh = !existing || score > existing.score;
    this.data.highScores.byLevel[key] = {
      score: Math.max(score, existing?.score ?? 0),
      stars: Math.max(stars, existing?.stars ?? 0),
      timeMs,
      foodCollected,
      completed: completed || existing?.completed || false
    };
    this.save();
    return isNewHigh;
  }

  updateSettings(partial) {
    Object.assign(this.data.settings, partial);
    this.save();
  }

  // Guest-only: there's no backend "reset my cloud profile" endpoint, so this must never
  // be called while in cloud mode (callers should guard on isGuest first - see main.js).
  resetProgress() {
    this.guestData = structuredClone(DEFAULT_SAVE);
    persist(GUEST_KEY, this.guestData);
  }
}

export const SaveData = new SaveStore();
