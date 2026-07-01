export const LEVELS = [
  {
    id: 1,
    name: "Garden Grove",
    theme: "garden",
    gridSize: 22,
    speed: 150,
    colors: { bgFrom: "#7ec850", bgTo: "#4f9130", accent: "#3f7d24" },
    objective: { type: "collect_food", target: 10 },
    foodTypes: [
      { type: "regular", points: 10, weight: 65 },
      { type: "golden", points: 50, weight: 12 },
      { type: "poison", points: -10, weight: 23, endsGame: false }
    ],
    obstacles: {
      placement: "random_valid",
      layout: null,
      types: [
        { type: "rock", dangerous: true, count: 5 },
        { type: "flower", dangerous: false, count: 7 }
      ]
    },
    powerUpPool: ["shield", "double_points", "magnet"],
    powerUpSpawnRateMs: 13000,
    mechanics: { wraparound: false, slippery: false, portals: false, sandstorm: false, movingHazards: false },
    starThresholds: { 1: 0, 2: 150, 3: 300 },
    unlocks: { nextLevel: 2 }
  }
  // Phase 2 adds Levels 2-6 here as pure data, same shape.
];

export function getLevel(id) {
  return LEVELS.find(l => l.id === id) ?? null;
}

export function nextLevelOf(id) {
  const level = getLevel(id);
  if (!level?.unlocks?.nextLevel) return null;
  return getLevel(level.unlocks.nextLevel);
}

export function makeClassicPseudoLevel() {
  return {
    id: "classic",
    name: "Classic",
    theme: "garden",
    gridSize: 22,
    speed: 150,
    colors: { bgFrom: "#7ec850", bgTo: "#4f9130", accent: "#3f7d24" },
    objective: null,
    foodTypes: [
      { type: "regular", points: 10, weight: 75 },
      { type: "golden", points: 50, weight: 10 },
      { type: "poison", points: -10, weight: 15, endsGame: false }
    ],
    obstacles: { placement: "random_valid", layout: null, types: [] },
    powerUpPool: ["shield", "double_points", "magnet"],
    powerUpSpawnRateMs: 13000,
    mechanics: { wraparound: false, slippery: false, portals: false, sandstorm: false, movingHazards: false },
    starThresholds: null,
    unlocks: null
  };
}

const DIFFICULTY_SPEED_MULTIPLIER = { easy: 1.25, normal: 1.0, hard: 0.8 };
const DIFFICULTY_POISON_ENDS_GAME = { easy: false, normal: false, hard: true };

export function applyDifficulty(level, difficulty) {
  const speedMul = DIFFICULTY_SPEED_MULTIPLIER[difficulty] ?? 1.0;
  const poisonEnds = DIFFICULTY_POISON_ENDS_GAME[difficulty] ?? false;
  return {
    ...level,
    speed: Math.round(level.speed * speedMul),
    foodTypes: level.foodTypes.map(f => f.type === "poison" ? { ...f, endsGame: poisonEnds } : f)
  };
}
