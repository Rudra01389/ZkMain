const { loadReview, saveReview } = require("./store");

/**
 * 2-level human review/escalation state machine layered on top of an
 * existing (unmodified) evaluation record. The AI score and ZK proof on the
 * evaluation record itself are never touched — this is purely an append-only
 * side record keyed by evaluationId, mirroring the private-evaluation
 * companion-file pattern already used in store.js.
 *
 * Level 1 = Teacher.  Accept -> final score = AI score, case closed.
 *                     Reject -> escalate to Level 2 (Final Authority).
 * Level 2 = Final Authority. Always closes the case with its own final score
 *           (there is nothing to escalate to beyond this).
 *
 * Scores here (aiScore / proposedScore / finalScore) are all in the SAME
 * display scale as the evaluation's `displayScore` (i.e. out of the
 * teacher's chosen maxMarks), not the raw 0-100 circuit score — that raw
 * score is what the ZK proof actually commits to and is left untouched on
 * the evaluation record.
 */
const STATUS = {
  AI_EVALUATED: "AI_EVALUATED",
  TEACHER_ACCEPTED: "TEACHER_ACCEPTED",
  FINAL_AUTHORITY_PENDING: "FINAL_AUTHORITY_PENDING",
  FINALIZED: "FINALIZED",
};

function evaluationDisplayScore(evaluation) {
  if (typeof evaluation.displayScore === "number") return evaluation.displayScore;
  if (typeof evaluation.displayScore10 === "number") return evaluation.displayScore10;
  return evaluation.claimedScore;
}

function evaluationMaxMarks(evaluation) {
  return typeof evaluation.maxMarks === "number" ? evaluation.maxMarks : 10;
}

function defaultReview(evaluation) {
  return {
    evaluationId: evaluation.evaluationId,
    batchId: evaluation.batchId,
    aiScore: evaluationDisplayScore(evaluation),
    maxMarks: evaluationMaxMarks(evaluation),
    status: STATUS.AI_EVALUATED,
    teacherReview: null,
    finalAuthorityReview: null,
    finalScore: null,
    finalizedAt: null,
  };
}

function getOrCreateReview(evaluation) {
  const existing = loadReview(evaluation.evaluationId);
  if (existing) return existing;
  return defaultReview(evaluation);
}

function assertScoreInRange(score, maxMarks, label) {
  if (typeof score !== "number" || Number.isNaN(score) || score < 0 || score > maxMarks) {
    throw new Error(`${label} must be a number between 0 and ${maxMarks}`);
  }
}

function assertReviewerId(id, label) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`${label} (string) is required`);
  }
}

function acceptAsTeacher(evaluation, { teacherId, reason }) {
  const record = getOrCreateReview(evaluation);
  if (record.status !== STATUS.AI_EVALUATED) {
    throw new Error(`cannot accept: evaluation is not awaiting teacher review (status: ${record.status})`);
  }
  assertReviewerId(teacherId, "teacherId");

  const timestamp = new Date().toISOString();
  record.teacherReview = {
    teacherId: teacherId.trim(),
    decision: "accept",
    proposedScore: record.aiScore,
    reason: (reason || "Accepted AI score").trim(),
    timestamp,
  };
  record.status = STATUS.TEACHER_ACCEPTED;
  record.finalScore = record.aiScore;
  record.finalizedAt = timestamp;

  saveReview(evaluation.evaluationId, record);
  return record;
}

function rejectAsTeacher(evaluation, { teacherId, proposedScore, reason }) {
  const record = getOrCreateReview(evaluation);
  if (record.status !== STATUS.AI_EVALUATED) {
    throw new Error(`cannot reject: evaluation is not awaiting teacher review (status: ${record.status})`);
  }
  assertReviewerId(teacherId, "teacherId");
  assertScoreInRange(proposedScore, record.maxMarks, "proposedScore");
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("reason (string) is required when rejecting");
  }

  const timestamp = new Date().toISOString();
  record.teacherReview = {
    teacherId: teacherId.trim(),
    decision: "reject",
    proposedScore,
    reason: reason.trim(),
    timestamp,
  };
  record.status = STATUS.FINAL_AUTHORITY_PENDING;

  saveReview(evaluation.evaluationId, record);
  return record;
}

function finalizeAsAuthority(evaluation, { authorityId, finalScore, reason }) {
  const record = getOrCreateReview(evaluation);
  if (record.status !== STATUS.FINAL_AUTHORITY_PENDING) {
    throw new Error(`cannot finalize: evaluation is not awaiting final authority review (status: ${record.status})`);
  }
  assertReviewerId(authorityId, "authorityId");
  assertScoreInRange(finalScore, record.maxMarks, "finalScore");
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("reason (string) is required");
  }

  const timestamp = new Date().toISOString();
  record.finalAuthorityReview = {
    authorityId: authorityId.trim(),
    finalScore,
    reason: reason.trim(),
    timestamp,
  };
  record.status = STATUS.FINALIZED;
  record.finalScore = finalScore;
  record.finalizedAt = timestamp;

  saveReview(evaluation.evaluationId, record);
  return record;
}

module.exports = { STATUS, getOrCreateReview, acceptAsTeacher, rejectAsTeacher, finalizeAsAuthority };
