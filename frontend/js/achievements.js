// Display metadata only - whether an achievement is earned is decided entirely
// server-side (backend/functions/src/gameData.js ACHIEVEMENTS) since it depends on
// lifetimeStats that only exist authoritatively on the cloud profile. Keep names/ids in
// sync with the backend list; descriptions are frontend-only (backend never needs them).
export const ACHIEVEMENTS = [
  { id: "first_bite", name: "First Bite", description: "Eat your first food." },
  { id: "century_club", name: "Century Club", description: "Eat 100 food, lifetime." },
  { id: "first_steps", name: "First Steps", description: "Complete your first level." },
  { id: "world_explorer", name: "World Explorer", description: "Complete all 6 levels." },
  { id: "snake_collector", name: "Snake Collector", description: "Unlock every snake skin." },
  { id: "endless_legend", name: "Endless Legend", description: "Score 1000+ in Endless Mode." },
  { id: "dedicated", name: "Dedicated", description: "Complete 25 runs." }
];

export function getAchievement(id) {
  return ACHIEVEMENTS.find(a => a.id === id);
}
