import { useState } from "react";
import { api } from "../api";

// Deterministic, non-cryptographic stand-in: the backend does not (yet) hash
// or commit the rubric anywhere. Shown for demo completeness only, clearly
// separated from the real checks below.
function mockRubricCommitment(evaluationId) {
  let h = 0;
  const seed = `${evaluationId}|rubric-v1.0`;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return `0x${(h >>> 0).toString(16).padStart(8, "0")}...(demo)`;
}

const STATUS_DISPLAY = {
  AI_EVALUATED: "⚠ Pending Teacher Review",
  TEACHER_ACCEPTED: "✓ Teacher Accepted",
  FINAL_AUTHORITY_PENDING: "⚠ Escalated to Final Authority",
  FINALIZED: "✓ Finalized",
};

const AUDIT_EVENT_LABEL = {
  ai_evaluation: "✓ AI Score + ZK Proof Generated",
  teacher_accepted: "✓ Teacher Accepted AI Score",
  teacher_rejected_escalated: "⚠ Escalated to Final Authority",
  final_authority_finalized: "✓ Final Score Recorded",
};

export default function AuditorDashboard({ initialEvaluationId }) {
  const [evaluationId, setEvaluationId] = useState(initialEvaluationId || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [review, setReview] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [auditChain, setAuditChain] = useState(null);

  const inspect = async (id) => {
    const targetId = (id ?? evaluationId).trim();
    if (!targetId) return;
    setLoading(true);
    setError(null);
    setEvaluation(null);
    setReview(null);
    setVerifyResult(null);
    setAuditChain(null);
    try {
      const [evalData, reviewData, verify] = await Promise.all([
        api.getEvaluation(targetId),
        api.getReview(targetId),
        api.verify(targetId),
      ]);
      setEvaluation(evalData.evaluation);
      setReview(reviewData.review);
      setVerifyResult(verify);
      const chain = await api.auditBatch(evalData.evaluation.batchId);
      setAuditChain(chain.records.filter((r) => r.evaluationId === targetId));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Auditor Dashboard</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Read-only inspection of an evaluation's full record — rubric, AI score, human review history, and
        tamper-evident audit trail — using only public artifacts.
      </p>

      <div className="panel">
        <div className="row">
          <label>
            Evaluation ID
            <input
              value={evaluationId}
              onChange={(e) => setEvaluationId(e.target.value)}
              placeholder="paste evaluation ID"
              style={{ minWidth: 280 }}
            />
          </label>
          <button className="primary" onClick={() => inspect()} disabled={loading || !evaluationId.trim()}>
            {loading ? "Inspecting..." : "Inspect Evaluation"}
          </button>
        </div>
        {loading && (
          <div className="status pending">
            <span className="spinner" /> Loading evaluation, review, and audit records...
          </div>
        )}
        {error && <div className="status fail">✗ {error}</div>}
      </div>

      {evaluation && review && (
        <>
          <div className="panel">
            <h2>A. Evaluation Information</h2>
            <dl>
              <dt>Evaluation ID</dt>
              <dd className="mono small">{evaluation.evaluationId}</dd>
              <dt>Student ID</dt>
              <dd>{evaluation.studentId || evaluation.candidateId}</dd>
              <dt>Exam</dt>
              <dd>{evaluation.examSubject || evaluation.batchId}</dd>
              <dt>Question</dt>
              <dd>{evaluation.question || "—"}</dd>
              <dt>Timestamp</dt>
              <dd>{new Date(evaluation.timestamp).toLocaleString()}</dd>
              <dt>Status</dt>
              <dd>{STATUS_DISPLAY[review.status] || review.status}</dd>
            </dl>
          </div>

          <div className="panel">
            <h2>B. Rubric</h2>
            {evaluation.criteria?.length > 0 ? (
              <ul className="check-list">
                {evaluation.criteria.map((c, i) => (
                  <li key={i} className={evaluation.similarityVector?.[i]?.hit ? "ok" : "fail"}>
                    {evaluation.similarityVector?.[i]?.hit ? "✓" : "✗"} {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No teacher-defined rubric recorded for this evaluation (legacy demo question).</p>
            )}
          </div>

          <div className="panel">
            <h2>C. AI Evaluation</h2>
            <dl>
              <dt>AI Score</dt>
              <dd>
                {review.aiScore} / {review.maxMarks}
              </dd>
              <dt>Model Version</dt>
              <dd>{evaluation.modelVersion || "—"}</dd>
              <dt>Model Commitment</dt>
              <dd className="mono small">{evaluation.modelCommitment}</dd>
              <dt>Rubric Commitment</dt>
              <dd className="mono small">{mockRubricCommitment(evaluation.evaluationId)} (demo placeholder)</dd>
              <dt>Input Commitment</dt>
              <dd className="mono small">{evaluation.inputCommitment}</dd>
              <dt>ZK Proof Status</dt>
              <dd>{verifyResult?.checks?.proofValid ? "✓ VALID" : "✗ INVALID"}</dd>
            </dl>

            {verifyResult && (
              <>
                <ul className="check-list">
                  <li className={verifyResult.checks.modelCommitment ? "ok" : "fail"}>
                    {verifyResult.checks.modelCommitment ? "✓" : "✗"} Model Commitment
                  </li>
                  <li className={verifyResult.checks.inputCommitmentValid ? "ok" : "fail"}>
                    {verifyResult.checks.inputCommitmentValid ? "✓" : "✗"} Input Commitment
                  </li>
                  <li className={verifyResult.checks.scoreValid ? "ok" : "fail"}>
                    {verifyResult.checks.scoreValid ? "✓" : "✗"} AI Score Commitment
                  </li>
                  <li className={verifyResult.checks.proofValid ? "ok" : "fail"}>
                    {verifyResult.checks.proofValid ? "✓" : "✗"} ZK Proof{" "}
                    <span className="check-note">({verifyResult.zkTimingsMs?.verify ?? "n/a"} ms)</span>
                  </li>
                  <li className={verifyResult.checks.auditIntact ? "ok" : "fail"}>
                    {verifyResult.checks.auditIntact ? "✓" : "✗"} Audit Chain Integrity
                  </li>
                </ul>
                {verifyResult.reasons?.length > 0 && (
                  <div className="reasons">
                    {verifyResult.reasons.map((r, i) => (
                      <div key={i}>Reason: {r}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {review.teacherReview && (
            <div className="panel">
              <h2>D. Teacher Review</h2>
              <dl>
                <dt>Teacher ID</dt>
                <dd>{review.teacherReview.teacherId}</dd>
                <dt>Decision</dt>
                <dd>
                  <span className={`decision-badge ${review.teacherReview.decision}`}>
                    {review.teacherReview.decision === "accept" ? "Accepted" : "Rejected"}
                  </span>
                </dd>
                <dt>Proposed Score</dt>
                <dd>
                  {review.teacherReview.proposedScore} / {review.maxMarks}
                </dd>
                <dt>Reason</dt>
                <dd>{review.teacherReview.reason}</dd>
                <dt>Timestamp</dt>
                <dd>{new Date(review.teacherReview.timestamp).toLocaleString()}</dd>
              </dl>
            </div>
          )}

          {review.finalAuthorityReview && (
            <div className="panel">
              <h2>E. Final Authority Review</h2>
              <dl>
                <dt>Final Authority ID</dt>
                <dd>{review.finalAuthorityReview.authorityId}</dd>
                <dt>Final Score</dt>
                <dd>
                  {review.finalAuthorityReview.finalScore} / {review.maxMarks}
                </dd>
                <dt>Reason</dt>
                <dd>{review.finalAuthorityReview.reason}</dd>
                <dt>Timestamp</dt>
                <dd>{new Date(review.finalAuthorityReview.timestamp).toLocaleString()}</dd>
              </dl>
            </div>
          )}

          <div className="panel">
            <h2>F. Audit History</h2>
            {auditChain?.length > 0 ? (
              <ul className="check-list">
                {auditChain.map((r) => (
                  <li key={r.index} className="ok">
                    {AUDIT_EVENT_LABEL[r.type] || "✓ Evaluation Created"}{" "}
                    <span className="check-note">
                      ({new Date(r.timestamp).toLocaleString()} · chain index {r.index} · hash{" "}
                      {r.recordHash?.slice(0, 10)}...)
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No audit records found.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
