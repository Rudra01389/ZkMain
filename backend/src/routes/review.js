const express = require("express");

const { loadEvaluation } = require("../services/store");
const { getOrCreateReview, acceptAsTeacher, rejectAsTeacher, finalizeAsAuthority } = require("../services/reviewService");
const { appendRecord } = require("../services/auditChain");

const router = express.Router();

function requireEvaluation(req, res) {
  const evaluation = loadEvaluation(req.params.evaluationId);
  if (!evaluation) {
    res.status(404).json({ error: `no evaluation record found for id ${req.params.evaluationId}` });
    return null;
  }
  return evaluation;
}

router.get("/:evaluationId", (req, res) => {
  const evaluation = requireEvaluation(req, res);
  if (!evaluation) return;
  res.json({ review: getOrCreateReview(evaluation) });
});

router.post("/:evaluationId/accept", (req, res) => {
  try {
    const evaluation = requireEvaluation(req, res);
    if (!evaluation) return;
    const { teacherId, reason } = req.body || {};
    const record = acceptAsTeacher(evaluation, { teacherId, reason });

    const auditRecord = appendRecord(evaluation.batchId, {
      type: "teacher_accepted",
      evaluationId: evaluation.evaluationId,
      teacherId: record.teacherReview.teacherId,
      finalScore: record.finalScore,
      timestamp: record.teacherReview.timestamp,
    });

    res.json({ review: record, audit: { index: auditRecord.index, recordHash: auditRecord.recordHash } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:evaluationId/reject", (req, res) => {
  try {
    const evaluation = requireEvaluation(req, res);
    if (!evaluation) return;
    const { teacherId, proposedScore, reason } = req.body || {};
    const record = rejectAsTeacher(evaluation, { teacherId, proposedScore: Number(proposedScore), reason });

    const auditRecord = appendRecord(evaluation.batchId, {
      type: "teacher_rejected_escalated",
      evaluationId: evaluation.evaluationId,
      teacherId: record.teacherReview.teacherId,
      proposedScore: record.teacherReview.proposedScore,
      reason: record.teacherReview.reason,
      timestamp: record.teacherReview.timestamp,
    });

    res.json({ review: record, audit: { index: auditRecord.index, recordHash: auditRecord.recordHash } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:evaluationId/finalize", (req, res) => {
  try {
    const evaluation = requireEvaluation(req, res);
    if (!evaluation) return;
    const { authorityId, finalScore, reason } = req.body || {};
    const record = finalizeAsAuthority(evaluation, { authorityId, finalScore: Number(finalScore), reason });

    const auditRecord = appendRecord(evaluation.batchId, {
      type: "final_authority_finalized",
      evaluationId: evaluation.evaluationId,
      authorityId: record.finalAuthorityReview.authorityId,
      finalScore: record.finalScore,
      reason: record.finalAuthorityReview.reason,
      timestamp: record.finalAuthorityReview.timestamp,
    });

    res.json({ review: record, audit: { index: auditRecord.index, recordHash: auditRecord.recordHash } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
