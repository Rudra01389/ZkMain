import { useState } from "react";
import { api } from "./api";

const CHECK_LABELS = {
  modelCommitment: "Model Commitment",
  proofFileIntact: "Proof File Integrity",
  proofValid: "ZK Proof",
  scoreValid: "Claimed Score",
  inputCommitmentValid: "Candidate Input Commitment",
  auditIntact: "Audit Chain",
  auditRecordPresent: "Audit Record Present",
};

export default function VerificationPanel({ lastEvaluationId }) {
  const [evaluationId, setEvaluationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runVerify = async (id) => {
    const targetId = id || evaluationId;
    if (!targetId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.verify(targetId);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>2. Independent Verification</h2>
      <p className="muted">
        Verifies an evaluation using only public artifacts (verification key, settings, SRS, audit chain) — never
        the model's private weights or the candidate's raw answers.
      </p>

      <div className="row">
        <label>
          Evaluation ID
          <input value={evaluationId} onChange={(e) => setEvaluationId(e.target.value)} placeholder="paste evaluation ID" />
        </label>
        {lastEvaluationId && (
          <button type="button" onClick={() => { setEvaluationId(lastEvaluationId); runVerify(lastEvaluationId); }}>
            Use last evaluation
          </button>
        )}
      </div>

      <button className="primary" onClick={() => runVerify()} disabled={loading}>
        {loading ? "Verifying..." : "Verify Evaluation"}
      </button>

      {error && <div className="status fail">✗ {error}</div>}

      {result && (
        <div className="result-box">
          <div className={`status ${result.valid ? "ok" : "fail"}`}>
            {result.valid ? "✓ CRYPTOGRAPHICALLY VERIFIED" : "✗ VERIFICATION FAILED"}
          </div>
          <ul className="check-list">
            {Object.entries(result.checks).map(([key, ok]) => (
              <li key={key} className={ok ? "ok" : "fail"}>
                {ok ? "✓" : "✗"} {CHECK_LABELS[key] || key}
              </li>
            ))}
          </ul>
          {result.reasons?.length > 0 && (
            <div className="reasons">
              {result.reasons.map((r, i) => <div key={i}>Reason: {r}</div>)}
            </div>
          )}
          <dl>
            <dt>Claimed Score</dt><dd>{result.claimedScore?.toFixed?.(2) ?? result.claimedScore}</dd>
            <dt>ZK Verify Time</dt><dd>{result.zkTimingsMs?.verify ?? "n/a"} ms</dd>
            <dt>Audit Chain Length</dt><dd>{result.auditValidationSummary?.length}</dd>
            <dt>Batch Root Hash</dt><dd className="mono small">{result.auditValidationSummary?.batchRootHash}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
