import { useEffect, useState } from "react";
import { api } from "./api";

const STATUS_BADGE = {
  AI_EVALUATED: { label: "⚠ PENDING REVIEW", cls: "pending" },
  TEACHER_ACCEPTED: { label: "✓ ACCEPTED", cls: "ok" },
  FINAL_AUTHORITY_PENDING: { label: "⚠ ESCALATED", cls: "pending" },
  FINALIZED: { label: "✓ FINALIZED", cls: "ok" },
};

export default function ReviewPanel({ evaluation, proofStatus }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [teacherId, setTeacherId] = useState("");
  const [reason, setReason] = useState("");
  const [showRejectFields, setShowRejectFields] = useState(false);
  const [proposedScore, setProposedScore] = useState("");
  const [submitting, setSubmitting] = useState(null);

  const [authorityId, setAuthorityId] = useState("");
  const [finalScore, setFinalScore] = useState("");
  const [authorityReason, setAuthorityReason] = useState("");

  const evaluationId = evaluation.evaluationId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTeacherId("");
    setReason("");
    setShowRejectFields(false);
    setAuthorityId("");
    setAuthorityReason("");
    api
      .getReview(evaluationId)
      .then((data) => {
        if (cancelled) return;
        setReview(data.review);
        setProposedScore(String(data.review.aiScore));
        setFinalScore(data.review.teacherReview ? String(data.review.teacherReview.proposedScore) : String(data.review.aiScore));
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluationId]);

  const accept = async () => {
    if (!teacherId.trim()) return setError("Teacher ID is required.");
    setError(null);
    setSubmitting("accept");
    try {
      const data = await api.acceptReview(evaluationId, { teacherId: teacherId.trim(), reason });
      setReview(data.review);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(null);
    }
  };

  const rejectAndEscalate = async () => {
    if (!teacherId.trim()) return setError("Teacher ID is required.");
    const scoreNum = Number(proposedScore);
    if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > review.maxMarks) {
      return setError(`Proposed score must be between 0 and ${review.maxMarks}.`);
    }
    if (!reason.trim()) return setError("A reason is required when rejecting.");
    setError(null);
    setSubmitting("reject");
    try {
      const data = await api.rejectReview(evaluationId, { teacherId: teacherId.trim(), proposedScore: scoreNum, reason: reason.trim() });
      setReview(data.review);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(null);
    }
  };

  const finalize = async () => {
    if (!authorityId.trim()) return setError("Final Authority ID is required.");
    const scoreNum = Number(finalScore);
    if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > review.maxMarks) {
      return setError(`Final score must be between 0 and ${review.maxMarks}.`);
    }
    if (!authorityReason.trim()) return setError("A final authority reason is required.");
    setError(null);
    setSubmitting("finalize");
    try {
      const data = await api.finalizeReview(evaluationId, {
        authorityId: authorityId.trim(),
        finalScore: scoreNum,
        reason: authorityReason.trim(),
      });
      setReview(data.review);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) return <p className="muted">Loading review status...</p>;
  if (!review) return null;

  const escalated = review.status === "FINAL_AUTHORITY_PENDING" || review.status === "FINALIZED";
  const steps = [
    { key: "ai", label: "AI Evaluation", done: true, active: false },
    { key: "score", label: "AI Score + ZK Proof", done: true, active: false },
    { key: "teacher", label: "Teacher Review", done: !!review.teacherReview, active: review.status === "AI_EVALUATED" },
  ];
  if (escalated) {
    steps.push({ key: "authority", label: "Final Authority Review", done: !!review.finalAuthorityReview, active: review.status === "FINAL_AUTHORITY_PENDING" });
  }
  steps.push({ key: "final", label: "Final Score", done: review.status === "TEACHER_ACCEPTED" || review.status === "FINALIZED", active: false });

  const badge = STATUS_BADGE[review.status];

  return (
    <div className="panel">
      <h2>Teacher Review &amp; Escalation</h2>

      <dl style={{ marginBottom: 14 }}>
        <dt>Evaluation ID</dt>
        <dd className="mono small">{evaluation.evaluationId}</dd>
        <dt>AI Score</dt>
        <dd>
          {review.aiScore} / {review.maxMarks}
        </dd>
        <dt>ZK Proof</dt>
        <dd>
          {proofStatus === "checking" && "checking..."}
          {proofStatus && proofStatus !== "checking" && (proofStatus.valid ? "✓ Valid" : "✗ Invalid")}
          {!proofStatus && "not checked"}
        </dd>
        <dt>Review Status</dt>
        <dd>
          <span className={`status inline ${badge.cls}`}>{badge.label}</span>
        </dd>
      </dl>

      <div className="step-list">
        {steps.map((s) => (
          <div className={`step-row ${s.done ? "done" : s.active ? "active" : ""}`} key={s.key}>
            <span className="marker">{s.done ? "✓" : s.active ? "●" : "○"}</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {review.teacherReview && (
        <div className="review-history" style={{ marginTop: 14 }}>
          <div className="review-history-item">
            <div className="review-history-head">
              <span className={`decision-badge ${review.teacherReview.decision}`}>
                {review.teacherReview.decision === "accept" ? "Teacher Accepted" : "Teacher Rejected"}
              </span>
              <span className="muted small">
                {review.teacherReview.teacherId} · {new Date(review.teacherReview.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="review-history-body">
              <span>Score: {review.teacherReview.proposedScore} / {review.maxMarks}</span>
              {review.teacherReview.reason && <span className="muted"> — {review.teacherReview.reason}</span>}
            </div>
          </div>
        </div>
      )}

      {review.finalAuthorityReview && (
        <div className="review-history">
          <div className="review-history-item">
            <div className="review-history-head">
              <span className="decision-badge accept">Final Authority Decision</span>
              <span className="muted small">
                {review.finalAuthorityReview.authorityId} · {new Date(review.finalAuthorityReview.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="review-history-body">
              <span>Final Score: {review.finalAuthorityReview.finalScore} / {review.maxMarks}</span>
              {review.finalAuthorityReview.reason && <span className="muted"> — {review.finalAuthorityReview.reason}</span>}
            </div>
          </div>
        </div>
      )}

      {error && <div className="status fail">✗ {error}</div>}

      {review.status === "AI_EVALUATED" && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: "0.85rem", margin: "0 0 8px" }}>Teacher Decision</h3>
          <div className="row">
            <label>
              Teacher ID
              <input value={teacherId} onChange={(e) => setTeacherId(e.target.value)} placeholder="e.g. T-Rao" />
            </label>
          </div>

          {!showRejectFields && (
            <>
              <label className="stacked">
                Reason (optional)
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you accept this score?" />
              </label>
              <p className="muted" style={{ margin: "4px 0 10px" }}>Do you accept the AI score?</p>
              <div className="row">
                <button className="primary" disabled={!!submitting} onClick={accept}>
                  {submitting === "accept" ? "Submitting..." : "✓ Accept AI Score"}
                </button>
                <button disabled={!!submitting} onClick={() => setShowRejectFields(true)}>
                  ✕ Reject / Escalate
                </button>
              </div>
            </>
          )}

          {showRejectFields && (
            <>
              <div className="row">
                <label>
                  Teacher Proposed Score (0-{review.maxMarks})
                  <input type="number" min="0" max={review.maxMarks} value={proposedScore} onChange={(e) => setProposedScore(e.target.value)} />
                </label>
              </div>
              <label className="stacked">
                Reason / Feedback
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why you disagree with the AI score" />
              </label>
              <div className="row">
                <button className="primary" disabled={!!submitting} onClick={rejectAndEscalate}>
                  {submitting === "reject" ? "Submitting..." : "Submit & Escalate to Final Authority"}
                </button>
                <button disabled={!!submitting} onClick={() => setShowRejectFields(false)}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {review.status === "FINAL_AUTHORITY_PENDING" && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: "0.85rem", margin: "0 0 8px" }}>Final Authority Review</h3>
          <div className="row">
            <label>
              Final Authority ID
              <input value={authorityId} onChange={(e) => setAuthorityId(e.target.value)} placeholder="e.g. Dean-Sharma" />
            </label>
            <label>
              Final Score (0-{review.maxMarks})
              <input type="number" min="0" max={review.maxMarks} value={finalScore} onChange={(e) => setFinalScore(e.target.value)} />
            </label>
          </div>
          <label className="stacked">
            Final Authority Reason
            <textarea rows={2} value={authorityReason} onChange={(e) => setAuthorityReason(e.target.value)} placeholder="Final assessment..." />
          </label>
          <button className="primary" disabled={!!submitting} onClick={finalize}>
            {submitting === "finalize" ? "Submitting..." : "Confirm Final Score"}
          </button>
        </div>
      )}

      {(review.status === "TEACHER_ACCEPTED" || review.status === "FINALIZED") && (
        <div className="status ok" style={{ marginTop: 16 }}>
          ✓ Case closed — Final Score {review.finalScore} / {review.maxMarks}
          {review.status === "FINALIZED" ? " (decided by Final Authority)" : " (Teacher accepted the AI score)"}
        </div>
      )}
    </div>
  );
}
