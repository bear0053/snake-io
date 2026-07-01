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
  },
  {
    id: "ice",
    name: "Ice Snake",
    colors: { body: "#4fc3f7", head: "#0288d1", eye: "#ffffff" },
    trailEffect: "frost",
    unlock: { type: "complete_level", levelId: 3 }
  },
  {
    id: "cyber",
    name: "Cyber Snake",
    colors: { body: "#ab47bc", head: "#6a1b9a", eye: "#e1bee7" },
    trailEffect: "glow",
    unlock: { type: "complete_level", levelId: 6 }
  },
  {
    id: "golden",
    name: "Golden Snake",
    colors: { body: "#ffd54f", head: "#ffa000", eye: "#ffffff" },
    trailEffect: "sparkle",
    unlock: { type: "complete_all_levels" }
  }
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
