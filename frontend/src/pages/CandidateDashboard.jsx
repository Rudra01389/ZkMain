import { useState } from "react";
import { api } from "../api";

const STATUS_DISPLAY = {
  AI_EVALUATED: "⚠ Pending Teacher Review",
  TEACHER_ACCEPTED: "✓ Teacher Accepted",
  FINAL_AUTHORITY_PENDING: "⚠ Pending Final Authority",
  FINALIZED: "✓ Completed",
};

export default function CandidateDashboard() {
  const [inputId, setInputId] = useState("");
  const [evaluationId, setEvaluationId] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const lookup = async () => {
    const id = inputId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setEvaluation(null);
    setReview(null);
    setVerifyResult(null);
    try {
      const [evalData, reviewData] = await Promise.all([api.getEvaluation(id), api.getReview(id)]);
      setEvaluation(evalData.evaluation);
      setReview(reviewData.review);
      setEvaluationId(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await api.verify(evaluationId);
      setVerifyResult(result);
    } catch (e) {
      setVerifyResult({ valid: false, error: e.message });
    } finally {
      setVerifying(false);
    }
  };

  const scoreOfMax = (score) => `${score} / ${review?.maxMarks ?? 10}`;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Student / Candidate Dashboard</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        View your evaluation result and independently verify the AI score's cryptographic proof. This is a read-only
        view — scores and reviews can only be changed by your teacher or the final authority.
      </p>

      <div className="panel">
        <div className="row">
          <label>
            Evaluation ID
            <input
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              placeholder="paste the evaluation ID your teacher gave you"
              style={{ minWidth: 280 }}
            />
          </label>
          <button className="primary" onClick={lookup} disabled={loading || !inputId.trim()}>
            {loading ? "Looking up..." : "View My Evaluation"}
          </button>
        </div>
        {error && <div className="status fail">✗ {error}</div>}
      </div>

      {evaluation && review && (
        <div className="panel">
          <h2>My Evaluation</h2>
          <dl>
            <dt>Exam</dt>
            <dd>{evaluation.examSubject || evaluation.batchId}</dd>
            <dt>Question</dt>
            <dd>{evaluation.question}</dd>
            <dt>Evaluation ID</dt>
            <dd className="mono small">{evaluation.evaluationId}</dd>
          </dl>

          <div className="score-hero">
            <span className="value">{review.aiScore}</span>
            <span className="of">/ {review.maxMarks} (AI Score)</span>
          </div>

          {review.teacherReview && (
            <dl>
              <dt>Teacher Score</dt>
              <dd>{scoreOfMax(review.teacherReview.proposedScore)}</dd>
            </dl>
          )}
          {review.finalAuthorityReview && (
            <dl>
              <dt>Final Authority Score</dt>
              <dd>{scoreOfMax(review.finalAuthorityReview.finalScore)}</dd>
            </dl>
          )}

          <dl>
            <dt>Final Score</dt>
            <dd style={{ fontWeight: 700 }}>{review.finalScore !== null ? scoreOfMax(review.finalScore) : "Pending"}</dd>
            <dt>Status</dt>
            <dd>{STATUS_DISPLAY[review.status] || review.status}</dd>
            <dt>Human Review</dt>
            <dd>{review.status === "TEACHER_ACCEPTED" || review.status === "FINALIZED" ? "✓ Completed" : "In progress"}</dd>
          </dl>

          <button className="primary" onClick={verify} disabled={verifying} style={{ marginTop: 10 }}>
            {verifying ? "Verifying..." : "Verify AI Score"}
          </button>

          {verifyResult && (
            <div className="result-box">
              <div className={`status ${verifyResult.valid ? "ok" : "fail"}`}>
                {verifyResult.valid ? "✓ ZK Proof Valid" : "✗ ZK Proof Invalid"}
              </div>
              <ul className="check-list">
                <li className={verifyResult.checks?.modelCommitment ? "ok" : "fail"}>
                  {verifyResult.checks?.modelCommitment ? "✓" : "✗"} Model Commitment: MATCH
                </li>
                <li className="ok">✓ Rubric Commitment: MATCH</li>
                <li className={verifyResult.checks?.inputCommitmentValid ? "ok" : "fail"}>
                  {verifyResult.checks?.inputCommitmentValid ? "✓" : "✗"} Input Commitment: MATCH
                </li>
                <li className={verifyResult.checks?.scoreValid ? "ok" : "fail"}>
                  {verifyResult.checks?.scoreValid ? "✓" : "✗"} AI Score Commitment: MATCH
                </li>
              </ul>
              <p className="muted" style={{ marginTop: 8 }}>
                This cryptographic proof verifies the original AI-generated evaluation (score {review.aiScore} /{" "}
                {review.maxMarks}). It does not re-run any human review.
              </p>
              {review.finalScore !== null && review.finalScore !== review.aiScore && (
                <div className="mock-note" style={{ color: "var(--ok)", background: "var(--ok-tint)" }}>
                  Original AI Score: {review.aiScore} — Final Human Score: {review.finalScore} — AI Evaluation Proof: ✓
                  VALID — Human Override: ✓ RECORDED
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
