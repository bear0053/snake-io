import { db, FieldValue } from "./admin.js";

const RISK_IMPACT = {
  rejected_submission: 5,
  flagged_submission: 1,
  duplicate_or_expired_submission: 2
};

/**
 * Writes an audit log entry (spec 29) and nudges the player's risk score (28.5).
 * Never throws - a logging failure shouldn't take down the caller's main operation.
 */
export async function writeAuditLog({ playerId, sessionId = null, eventType, gameMode = null, submittedScore = null, validationResult, reasonCode = null, clientVersion = null }) {
  const riskImpact = RISK_IMPACT[eventType] ?? 0;
  try {
    await db.collection("auditLogs").add({
      playerId,
      sessionId,
      eventType,
      timestamp: FieldValue.serverTimestamp(),
      gameMode,
      submittedScore,
      validationResult,
      reasonCode,
      clientVersion,
      riskScoreImpact: riskImpact
    });
    if (riskImpact > 0 && playerId) {
      await db.collection("players").doc(playerId).update({ riskScore: FieldValue.increment(riskImpact) });
    }
  } catch (err) {
    console.error("Failed to write audit log", { playerId, eventType, err });
  }
}
