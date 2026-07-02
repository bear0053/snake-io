// Minimal server-side mirror of the scoring-relevant parts of the frontend's game data
// registries (frontend/js/levels.js, snakes.js). Cloud Functions can't import those
// directly - Firebase only packages the `functions/` source directory on deploy - so
// this is intentionally a small, independent copy covering just what score validation
// and unlock rules need (objective type/target, max food value, unlock conditions), not
// the full level/skin definitions (visuals, obstacles, power-ups, etc. stay frontend-only).
//
// IMPORTANT: if a level's objective, food values, or a skin's unlock condition changes in
// the frontend registries, mirror the change here too, or server-side validation will
// drift from what the client actually awards.

export const LEVELS = {
  1: { objective: { type: "collect_food", target: 10 }, maxFoodPoints: 50 },
  2: { objective: { type: "collect_food", target: 12 }, maxFoodPoints: 50 },
  3: { objective: { type: "survive_time", target: 60 }, maxFoodPoints: 50 },
  4: { objective: { type: "reach_score", target: 260 }, maxFoodPoints: 60 },
  5: { objective: { type: "collect_food", target: 14 }, maxFoodPoints: 50 },
  6: { objective: { type: "collect_key_reach_exit", target: 1 }, maxFoodPoints: 50 }
};

export const CLASSIC_MAX_FOOD_POINTS = 50;
export const ENDLESS_MAX_FOOD_POINTS = 50;

export const ALL_LEVEL_IDS = Object.keys(LEVELS).map(Number);

// Mirrors snakes.js SKINS unlock rules. "default" isn't listed - it's always unlocked.
export const SKIN_UNLOCK_RULES = [
  { id: "fire", type: "complete_level", levelId: 5 },
  { id: "ice", type: "complete_level", levelId: 3 },
  { id: "cyber", type: "complete_level", levelId: 6 },
  { id: "golden", type: "complete_all_levels" },
  { id: "odyssey", type: "endless_score", target: 500 }
];

export const ALL_SKIN_IDS = ["default", "fire", "ice", "cyber", "golden", "odyssey"];

// Achievements are server-computed only (unlike skins, the frontend has no local copy
// of the check logic - lifetimeStats only exist authoritatively on the cloud profile).
// The frontend mirrors just the id/name/description for display in frontend/js/achievements.js.
export const ACHIEVEMENTS = [
  { id: "first_bite", name: "First Bite", check: (p) => p.lifetimeStats.totalFoodCollected >= 1 },
  { id: "century_club", name: "Century Club", check: (p) => p.lifetimeStats.totalFoodCollected >= 100 },
  { id: "first_steps", name: "First Steps", check: (p) => Object.values(p.highScores.byLevel).some(r => r?.completed) },
  { id: "world_explorer", name: "World Explorer", check: (p) => ALL_LEVEL_IDS.every(id => p.highScores.byLevel[String(id)]?.completed) },
  { id: "snake_collector", name: "Snake Collector", check: (p) => ALL_SKIN_IDS.every(id => p.unlockedSkins.includes(id)) },
  { id: "endless_legend", name: "Endless Legend", check: (p) => p.highScores.endless >= 1000 },
  { id: "dedicated", name: "Dedicated", check: (p) => p.lifetimeStats.totalRuns >= 25 }
];
