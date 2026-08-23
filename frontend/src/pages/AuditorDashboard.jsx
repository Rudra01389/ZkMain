import { useEffect, useState } from "react";
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

export default function AuditorDashboard({ initialEvaluationId }) {
  const [evaluationId, setEvaluationId] = useState(initialEvaluationId || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runVerify = async (id) => {
    const targetId = (id ?? evaluationId).trim();
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

  useEffect(() => {
    if (initialEvaluationId) {
      setEvaluationId(initialEvaluationId);
      runVerify(initialEvaluationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEvaluationId]);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Auditor Dashboard</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Independently verify an evaluation's cryptographic proof and audit trail using only public artifacts.
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
          <button className="primary" onClick={() => runVerify()} disabled={loading || !evaluationId.trim()}>
            {loading ? "Verifying..." : "Verify"}
          </button>
        </div>

        {loading && (
          <div className="status pending">
            <span className="spinner" /> Running independent cryptographic verification...
          </div>
        )}
        {error && <div className="status fail">✗ {error}</div>}

        {result && (
          <div className="result-box">
            <div className={`status ${result.valid ? "ok" : "fail"}`}>
              {result.valid ? "✓ Evaluation Verified" : "✗ Evaluation Verification Failed"}
            </div>

            <ul className="check-list">
              <li className={result.checks.modelCommitment ? "ok" : "fail"}>
                {result.checks.modelCommitment ? "✓" : "✗"} Model Commitment
              </li>
              <li className="ok">
                ✓ Rubric Commitment <span className="check-note">({mockRubricCommitment(result.evaluationId)})</span>
              </li>
              <li className={result.checks.inputCommitmentValid ? "ok" : "fail"}>
                {result.checks.inputCommitmentValid ? "✓" : "✗"} Input Commitment
              </li>
              <li className={result.checks.scoreValid ? "ok" : "fail"}>
                {result.checks.scoreValid ? "✓" : "✗"} Result Commitment{" "}
                <span className="check-note">(score: {result.claimedScore?.toFixed?.(2)})</span>
              </li>
              <li className={result.checks.proofValid ? "ok" : "fail"}>
                {result.checks.proofValid ? "✓" : "✗"} ZK Proof{" "}
                <span className="check-note">({result.zkTimingsMs?.verify ?? "n/a"} ms)</span>
              </li>
            </ul>
            <div className="mock-note">
              Rubric Commitment is a demo placeholder — the current backend does not yet hash/commit the rubric. All
              other checks above are real cryptographic/audit results from the backend.
            </div>

            {result.reasons?.length > 0 && (
              <div className="reasons">
                {result.reasons.map((r, i) => (
                  <div key={i}>Reason: {r}</div>
                ))}
              </div>
            )}

            <details className="tech-details">
              <summary>Additional integrity checks</summary>
              <ul className="check-list">
                <li className={result.checks.proofFileIntact ? "ok" : "fail"}>
                  {result.checks.proofFileIntact ? "✓" : "✗"} Proof File Integrity
                </li>
                <li className={result.checks.auditIntact ? "ok" : "fail"}>
                  {result.checks.auditIntact ? "✓" : "✗"} Audit Chain Integrity
                </li>
                <li className={result.checks.auditRecordPresent ? "ok" : "fail"}>
                  {result.checks.auditRecordPresent ? "✓" : "✗"} Audit Record Present
                </li>
              </ul>
              <dl>
                <dt>Candidate</dt>
                <dd>{result.candidateId}</dd>
                <dt>Exam</dt>
                <dd>{result.batchId}</dd>
                <dt>Audit Chain Length</dt>
                <dd>{result.auditValidationSummary?.length}</dd>
                <dt>Batch Root Hash</dt>
                <dd className="mono small">{result.auditValidationSummary?.batchRootHash}</dd>
              </dl>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
