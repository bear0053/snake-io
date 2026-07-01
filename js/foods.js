// Food registry: base behavior per food type. Per-level point values/weights/endsGame
// come from LevelData.foodTypes[] (see levels.js) and override these defaults.
export const FOOD_TYPES = {
  regular: {
    id: "regular",
    label: "Apple",
    defaultPoints: 10,
    growth: 1,
    color: "#ef5350"
  },
  golden: {
    id: "golden",
    label: "Golden Apple",
    defaultPoints: 50,
    growth: 1,
    color: "#ffca28"
  },
  poison: {
    id: "poison",
    label: "Poison",
    defaultPoints: -10,
    growth: 0,
    color: "#8e24aa",
    isPoison: true
  }
};

export function pickWeightedFoodType(foodTypes, rng = Math.random) {
  const total = foodTypes.reduce((sum, f) => sum + f.weight, 0);
  let roll = rng() * total;
  for (const f of foodTypes) {
    roll -= f.weight;
    if (roll <= 0) return f;
  }
  return foodTypes[0];
}
