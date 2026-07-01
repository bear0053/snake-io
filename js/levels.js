const BASE_MECHANICS = {
  wraparound: false,
  slippery: false,
  portals: false,
  sandstorm: false,
  movingHazards: false,
  lasers: false
};

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
    mechanics: { ...BASE_MECHANICS },
    starThresholds: { 1: 0, 2: 150, 3: 300 },
    unlocks: { nextLevel: 2 }
  },
  {
    id: 2,
    name: "Desert Dunes",
    theme: "desert",
    gridSize: 22,
    speed: 135,
    colors: { bgFrom: "#edc888", bgTo: "#d9a441", accent: "#8a5a24" },
    objective: { type: "collect_food", target: 12 },
    foodTypes: [
      { type: "regular", points: 10, weight: 60 },
      { type: "golden", points: 50, weight: 10 },
      { type: "poison", points: -10, weight: 30, endsGame: false }
    ],
    obstacles: {
      placement: "random_valid",
      layout: null,
      types: [{ type: "cactus", dangerous: true, count: 6 }]
    },
    powerUpPool: ["shield", "magnet", "double_points", "slow_time"],
    powerUpSpawnRateMs: 12000,
    mechanics: { ...BASE_MECHANICS, sandstorm: true },
    starThresholds: { 1: 0, 2: 180, 3: 340 },
    unlocks: { nextLevel: 3 }
  },
  {
    id: 3,
    name: "Snowy Peaks",
    theme: "snowy",
    gridSize: 22,
    speed: 130,
    colors: { bgFrom: "#eaf6ff", bgTo: "#bfe3f7", accent: "#5aa0c9" },
    objective: { type: "survive_time", target: 60 },
    foodTypes: [
      { type: "regular", points: 10, weight: 65 },
      { type: "golden", points: 50, weight: 10 },
      { type: "poison", points: -10, weight: 25, endsGame: false }
    ],
    obstacles: {
      placement: "random_valid",
      layout: null,
      types: [{ type: "snowball", dangerous: true, count: 6 }]
    },
    powerUpPool: ["shield", "magnet", "double_points", "slow_time", "ghost"],
    powerUpSpawnRateMs: 12000,
    mechanics: { ...BASE_MECHANICS, slippery: true },
    starThresholds: { 1: 0, 2: 100, 3: 220 },
    unlocks: { nextLevel: 4 }
  },
  {
    id: 4,
    name: "Jungle Ruins",
    theme: "jungle",
    gridSize: 24,
    speed: 125,
    colors: { bgFrom: "#2f6b3a", bgTo: "#1d4a26", accent: "#123318" },
    objective: { type: "reach_score", target: 260 },
    foodTypes: [
      { type: "regular", points: 10, weight: 60 },
      { type: "golden", points: 60, weight: 8 },
      { type: "poison", points: -10, weight: 32, endsGame: false }
    ],
    obstacles: {
      placement: "random_valid",
      layout: null,
      types: [
        { type: "vine", dangerous: false, count: 6 },
        { type: "stone", dangerous: true, count: 4 },
        { type: "bug", dangerous: true, count: 4, moving: true }
      ]
    },
    powerUpPool: ["shield", "magnet", "double_points", "slow_time", "ghost"],
    powerUpSpawnRateMs: 11000,
    mechanics: { ...BASE_MECHANICS, movingHazards: true },
    starThresholds: { 1: 0, 2: 320, 3: 420 },
    unlocks: { nextLevel: 5 }
  },
  {
    id: 5,
    name: "Lava Cavern",
    theme: "lava",
    gridSize: 22,
    speed: 105,
    colors: { bgFrom: "#3a0a0a", bgTo: "#1a0505", accent: "#ff6d00" },
    objective: { type: "collect_food", target: 14 },
    foodTypes: [
      { type: "regular", points: 10, weight: 55 },
      { type: "golden", points: 50, weight: 10 },
      { type: "poison", points: -15, weight: 35, endsGame: false }
    ],
    obstacles: {
      placement: "random_valid",
      layout: null,
      types: [{ type: "lava_pool", dangerous: true, count: 7 }]
    },
    powerUpPool: ["shield", "double_points", "slow_time", "ghost"],
    powerUpSpawnRateMs: 11000,
    mechanics: { ...BASE_MECHANICS },
    starThresholds: { 1: 0, 2: 220, 3: 380 },
    unlocks: { nextLevel: 6 }
  },
  {
    id: 6,
    name: "Cyber Grid",
    theme: "cyber",
    gridSize: 22,
    speed: 110,
    colors: { bgFrom: "#0d0221", bgTo: "#1a0b3d", accent: "#00e5ff" },
    objective: { type: "collect_key_reach_exit", target: 1 },
    foodTypes: [
      { type: "regular", points: 10, weight: 70 },
      { type: "golden", points: 50, weight: 15 },
      { type: "poison", points: -10, weight: 15, endsGame: false }
    ],
    obstacles: {
      placement: "random_valid",
      layout: null,
      types: [{ type: "laser", dangerous: true, count: 5 }]
    },
    powerUpPool: ["shield", "magnet", "double_points", "slow_time", "ghost"],
    powerUpSpawnRateMs: 12000,
    mechanics: { ...BASE_MECHANICS, portals: true, lasers: true },
    starThresholds: { 1: 0, 2: 150, 3: 280 },
    unlocks: { nextLevel: null }
  }
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
    mechanics: { ...BASE_MECHANICS },
    starThresholds: null,
    unlocks: null
  };
}

export function makeEndlessPseudoLevel() {
  return {
    id: "endless",
    name: "Endless",
    theme: "cyber",
    gridSize: 22,
    speed: 150,
    colors: { bgFrom: "#0d0221", bgTo: "#1a0b3d", accent: "#00e5ff" },
    objective: null,
    foodTypes: [
      { type: "regular", points: 10, weight: 70 },
      { type: "golden", points: 50, weight: 12 },
      { type: "poison", points: -10, weight: 18, endsGame: false }
    ],
    obstacles: { placement: "random_valid", layout: null, types: [{ type: "rock", dangerous: true, count: 4 }] },
    powerUpPool: ["shield", "magnet", "double_points", "slow_time", "ghost"],
    powerUpSpawnRateMs: 10000,
    mechanics: { ...BASE_MECHANICS },
    starThresholds: null,
    unlocks: null
  };
}

const DIFFICULTY_SPEED_MULTIPLIER = { easy: 1.25, normal: 1.0, hard: 0.8 };
const DIFFICULTY_POISON_ENDS_GAME = { easy: false, normal: false, hard: true };
const DIFFICULTY_OBSTACLE_MULTIPLIER = { easy: 0.7, normal: 1.0, hard: 1.4 };

export function applyDifficulty(level, difficulty) {
  const speedMul = DIFFICULTY_SPEED_MULTIPLIER[difficulty] ?? 1.0;
  const poisonEnds = DIFFICULTY_POISON_ENDS_GAME[difficulty] ?? false;
  const obstacleMul = DIFFICULTY_OBSTACLE_MULTIPLIER[difficulty] ?? 1.0;
  return {
    ...level,
    speed: Math.round(level.speed * speedMul),
    foodTypes: level.foodTypes.map(f => f.type === "poison" ? { ...f, endsGame: poisonEnds } : f),
    obstacles: {
      ...level.obstacles,
      types: level.obstacles.types.map(t => ({ ...t, count: Math.max(0, Math.round(t.count * obstacleMul)) }))
    }
  };
}
