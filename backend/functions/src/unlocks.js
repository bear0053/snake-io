import { SKIN_UNLOCK_RULES, ALL_LEVEL_IDS } from "./gameData.js";

/**
 * Mirrors storage.js's isSkinUnlocked() condition logic (frontend/js/storage.js), but
 * server-side and only ever called for authenticated profiles - guests never reach here.
 * Returns the list of skin ids that are newly satisfied by the given profile state but
 * not yet recorded in profile.unlockedSkins.
 */
export function computeNewlyUnlockedSkins(profile) {
  const newlyUnlocked = [];
  for (const rule of SKIN_UNLOCK_RULES) {
    if (profile.unlockedSkins.includes(rule.id)) continue;
    if (rule.type === "complete_level") {
      const result = profile.highScores.byLevel[String(rule.levelId)];
      if (profile.unlockedLevels.includes(rule.levelId) && result?.completed === true) {
        newlyUnlocked.push(rule.id);
      }
    } else if (rule.type === "complete_all_levels") {
      const allDone = ALL_LEVEL_IDS.every(id => profile.highScores.byLevel[String(id)]?.completed === true);
      if (allDone) newlyUnlocked.push(rule.id);
    } else if (rule.type === "endless_score") {
      if (profile.highScores.endless >= rule.target) newlyUnlocked.push(rule.id);
    }
  }
  return newlyUnlocked;
}
