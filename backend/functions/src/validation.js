// Heuristic score/session validation (spec Part 4, sections 27-28).
//
// This deliberately does NOT re-simulate the game tick-by-tick server-side - that would
// mean maintaining a second full copy of the game engine in Node and keeping it in perfect
// sync with the frontend forever. Instead it computes a generous, physically-motivated
// upper bound on what a run *could* have scored, and rejects anything past that bound.
// This matches the spec's own philosophy (Principle 6 / 28.1): "not impossible to tamper
// with, just ineffective" - a submission has to be wildly implausible to get caught, not
// merely optimal.
import { LEVELS, CLASSIC_MAX_FOOD_POINTS, ENDLESS_MAX_FOOD_POINTS } from "./gameData.js";

// engine.js's ENDLESS_MIN_SPEED - the fastest a tick can ever run, at max Endless ramp-up
// or on Hard difficulty. The snake can eat at most one food per tick, so this is also the
// floor for "time between two food pickups."
const TICK_MS_FLOOR = 60;
// Jungle Ruins' golden food (60) is the highest point value of any food in the game.
const MAX_POINTS_PER_FOOD = 60;
// Generous ceiling on combo bonus (comboCount * 5) + double-points-powerup stacking per
// pickup - not modeled precisely, just bounded well above anything a real combo chain
// could realistically reach given food respawn timing.
const MAX_BONUS_PER_FOOD = 150;
const LEVEL_COMPLETE_BONUS = 200; // 100 objective + 100 no-hit, see engine.js completeLevel()
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes - an abandoned/stale session can't be submitted

export function sessionExpired(startedAtMs, nowMs) {
  return nowMs - startedAtMs > SESSION_EXPIRY_MS;
}

function maxPlausibleScore({ durationMs, maxFoodPoints, completed }) {
  const maxFoodEvents = Math.max(1, Math.ceil(durationMs / TICK_MS_FLOOR));
  const perFoodCeiling = maxFoodPoints + MAX_BONUS_PER_FOOD;
  const fromFood = maxFoodEvents * perFoodCeiling;
  return fromFood + (completed ? LEVEL_COMPLETE_BONUS : 0);
}

/**
 * @param {{mode: string, levelId: number|null}} session - the server-recorded session
 * @param {{score: number, foodCollected: number, completed: boolean}} submission
 * @param {number} durationMs - server-measured (endedAt - startedAt), never client-reported
 * @returns {{ok: boolean, reason?: string, flagged?: boolean}}
 */
export function validateResult(session, submission, durationMs) {
  const { score, foodCollected } = submission;

  if (!Number.isFinite(score) || score < 0) {
    return { ok: false, reason: "invalid_score" };
  }
  if (!Number.isInteger(foodCollected) || foodCollected < 0) {
    return { ok: false, reason: "invalid_food_count" };
  }
  if (durationMs < 0) {
    return { ok: false, reason: "invalid_duration" };
  }

  const maxFoodEvents = Math.max(1, Math.ceil(durationMs / TICK_MS_FLOOR));
  if (foodCollected > maxFoodEvents) {
    return { ok: false, reason: "food_count_exceeds_time_bound" };
  }

  let maxFoodPoints;
  let objective = null;
  if (session.mode === "classic") {
    maxFoodPoints = CLASSIC_MAX_FOOD_POINTS;
  } else if (session.mode === "endless") {
    maxFoodPoints = ENDLESS_MAX_FOOD_POINTS;
  } else {
    const level = LEVELS[session.levelId];
    if (!level) return { ok: false, reason: "unknown_level" };
    maxFoodPoints = level.maxFoodPoints;
    objective = level.objective;
  }

  const completed = session.mode === "level" && submission.completed === true;
  if (completed && objective) {
    if (objective.type === "survive_time" && durationMs < objective.target * 1000) {
      return { ok: false, reason: "completed_before_objective_possible" };
    }
    if (objective.type === "collect_food" && foodCollected < objective.target) {
      return { ok: false, reason: "completed_without_enough_food" };
    }
    if (objective.type === "reach_score" && score < objective.target) {
      return { ok: false, reason: "completed_without_reaching_target_score" };
    }
  }

  const ceiling = maxPlausibleScore({ durationMs, maxFoodPoints, completed });
  if (score > ceiling) {
    return { ok: false, reason: "score_exceeds_plausible_ceiling" };
  }

  // Flagged, not rejected: technically within bounds but close enough to the generous
  // ceiling that it's worth a look (spec 28.4/28.5) - still saved locally to the profile,
  // but excluded from leaderboard eligibility and nudges the player's risk score.
  if (score > ceiling * 0.6) {
    return { ok: true, flagged: true, reason: "near_plausible_ceiling" };
  }

  return { ok: true, flagged: false };
}
