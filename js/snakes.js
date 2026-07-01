export const SKINS = [
  {
    id: "default",
    name: "Default",
    colors: { body: "#66bb6a", head: "#388e3c", eye: "#ffffff" },
    trailEffect: null,
    unlock: { type: "default" }
  },
  {
    id: "fire",
    name: "Fire Snake",
    colors: { body: "#ff7043", head: "#d84315", eye: "#fff3e0" },
    trailEffect: "flame",
    unlock: { type: "complete_level", levelId: 5 }
  }
  // Phase 2: ice (unlock: complete_level 3), cyber (unlock: complete_level 6),
  // golden (unlock: complete_all_levels) - added as pure data entries here.
];

export function getSkin(skinId) {
  return SKINS.find(s => s.id === skinId) ?? SKINS[0];
}

export function unlockDescription(skin) {
  switch (skin.unlock.type) {
    case "default":
      return "Available from the start";
    case "complete_level":
      return `Unlocks after completing level ${skin.unlock.levelId}`;
    case "complete_all_levels":
      return "Unlocks after completing all levels";
    default:
      return "";
  }
}
