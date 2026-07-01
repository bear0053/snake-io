const STORAGE_KEY = "snakeio_save_v1";

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

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

function persist(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable (private mode / quota) - fail silently, game still playable
  }
}

class SaveStore {
  constructor() {
    this.data = load();
  }

  save() {
    persist(this.data);
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

  isSkinUnlocked(skin, allLevelIds) {
    if (skin.unlock.type === "default") return true;
    if (this.data.unlockedSkins.includes(skin.id)) return true;
    if (skin.unlock.type === "complete_level") {
      return this.data.unlockedLevels.includes(skin.unlock.levelId) &&
        this.data.highScores.byLevel[String(skin.unlock.levelId)]?.completed === true;
    }
    if (skin.unlock.type === "complete_all_levels") {
      return allLevelIds.every(id => this.data.highScores.byLevel[String(id)]?.completed === true);
    }
    return false;
  }

  unlockSkin(skinId) {
    if (!this.data.unlockedSkins.includes(skinId)) {
      this.data.unlockedSkins.push(skinId);
      this.save();
    }
  }

  selectSkin(skinId) {
    this.data.selectedSkin = skinId;
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

  resetProgress() {
    this.data = structuredClone(DEFAULT_SAVE);
    this.save();
  }
}

export const SaveData = new SaveStore();
