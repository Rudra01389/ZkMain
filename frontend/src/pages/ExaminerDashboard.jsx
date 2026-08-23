import { useEffect, useState } from "react";
import { api } from "../api";
import { RUBRIC_VERSION } from "../constants";

const MOCK_CRITERIA = ["Concept Coverage", "Terminology Accuracy", "Relevance to Question", "Clarity & Structure", "Completeness"];

// Deterministic per-evaluation jitter so the same row always renders the
// same mock breakdown. Not a real per-criterion score — the backend has no
// endpoint exposing rubric-level detail for a stored evaluation, only the
// aggregate claimedScore. Kept clearly labeled as sample data.
function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 1 | h) + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 7), 61 | h);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), 61 | t))) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mockCriteriaBreakdown(evaluationId, score) {
  const rand = seededRandom(evaluationId);
  return MOCK_CRITERIA.map((name) => {
    const jitter = (rand() - 0.5) * 24;
    const pct = Math.max(0, Math.min(100, Math.round(score + jitter)));
    return { name, pct };
  });
}

function scoreBand(score) {
  if (score >= 70) return "";
  if (score >= 40) return "mid";
  return "low";
}

export default function ExaminerDashboard() {
  const [evaluations, setEvaluations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [proofStatus, setProofStatus] = useState({}); // evaluationId -> "checking" | result

  useEffect(() => {
    api
      .evaluations()
      .then((data) => setEvaluations(data.evaluations))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingList(false));
  }, []);

  const selectRow = async (evaluationId) => {
    setSelectedId(evaluationId);
    if (proofStatus[evaluationId]) return;
    setProofStatus((prev) => ({ ...prev, [evaluationId]: "checking" }));
    try {
      const result = await api.verify(evaluationId);
      setProofStatus((prev) => ({ ...prev, [evaluationId]: result }));
    } catch (e) {
      setProofStatus((prev) => ({ ...prev, [evaluationId]: { valid: false, error: e.message } }));
    }
  };

  const total = evaluations.length;
  const avgScore = total > 0 ? Math.round(evaluations.reduce((s, e) => s + (e.claimedScore || 0), 0) / total) : 0;
  const candidates = new Set(evaluations.map((e) => e.candidateId)).size;
  const batches = new Set(evaluations.map((e) => e.batchId)).size;

  const selected = evaluations.find((e) => e.evaluationId === selectedId);
  const selectedProof = selectedId ? proofStatus[selectedId] : null;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Examiner Dashboard</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Review AI evaluations submitted by candidates across all exams.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Evaluations</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Average AI Score</div>
          <div className="stat-value">{avgScore}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Candidates</div>
          <div className="stat-value">{candidates}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Exams</div>
          <div className="stat-value">{batches}</div>
        </div>
      </div>

      {error && <div className="status fail">✗ {error}</div>}

      <div className="examiner-layout">
        <div className="panel">
          <h2>Evaluations</h2>
          {loadingList && <p className="muted">Loading...</p>}
          {!loadingList && total === 0 && (
            <div className="empty-state">No evaluations yet. Submit one from the Candidate dashboard.</div>
          )}
          {total > 0 && (
            <table className="eval-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Exam</th>
                  <th>Question</th>
                  <th>AI Score</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((e) => (
                  <tr
                    key={e.evaluationId}
                    className={e.evaluationId === selectedId ? "selected" : ""}
                    onClick={() => selectRow(e.evaluationId)}
                  >
                    <td className="mono small">{e.candidateId}</td>
                    <td>{e.batchId}</td>
                    <td>{e.question ? `${e.question.slice(0, 40)}${e.question.length > 40 ? "..." : ""}` : "—"}</td>
                    <td>
                      <span className={`score-pill ${scoreBand(e.claimedScore || 0)}`}>
                        {Math.round(e.claimedScore || 0)}/100
                      </span>
                    </td>
                    <td className="muted">{new Date(e.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h2>Evaluation Detail</h2>
          {!selected && <p className="muted">Select an evaluation from the table to view details.</p>}
          {selected && (
            <div>
              <div className="score-hero">
                <span className="value">{Math.round(selected.claimedScore || 0)}</span>
                <span className="of">/ 100</span>
              </div>

              {selectedProof === "checking" && (
                <div className="status pending">
                  <span className="spinner" /> Checking ZK proof...
                </div>
              )}
              {selectedProof && selectedProof !== "checking" && (
                <div className={`status ${selectedProof.valid ? "ok" : "fail"}`}>
                  {selectedProof.valid ? "✓ ZK Proof Valid" : "✗ ZK Proof Invalid"}
                </div>
              )}

              <dl>
                <dt>Evaluation ID</dt>
                <dd className="mono small">{selected.evaluationId}</dd>
                <dt>Candidate</dt>
                <dd>{selected.candidateId}</dd>
                <dt>Model</dt>
                <dd className="mono small">{selected.modelCommitment?.slice(0, 24)}...</dd>
                <dt>Rubric</dt>
                <dd>{RUBRIC_VERSION}</dd>
                <dt>Timestamp</dt>
                <dd>{new Date(selected.timestamp).toLocaleString()}</dd>
                {selected.sourceType === "pdf-upload" && (
                  <>
                    <dt>Answer Sheet</dt>
                    <dd>
                      {selected.uploadedFileName}{" "}
                      <a className="pdf-link" href={api.uploadedFileUrl(selected.evaluationId)} target="_blank" rel="noreferrer">
                        View PDF ↗
                      </a>
                    </dd>
                  </>
                )}
              </dl>

              <h3 style={{ fontSize: "0.85rem", margin: "16px 0 8px" }}>Criterion-Level Similarity</h3>
              {selected.similarityVector?.length > 0 ? (
                <>
                  <div className="criteria-list">
                    {selected.similarityVector.map((c) => (
                      <div className="criteria-row" key={c.criterion}>
                        <span className="name">{c.criterion}</span>
                        <span className="criteria-bar">
                          <span style={{ width: `${Math.round(Math.max(0, c.similarity) * 100)}%` }} />
                        </span>
                        <span className="pct">{c.similarity.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mock-note" style={{ color: "var(--ok)", background: "var(--ok-tint)" }}>
                    Real cosine similarity from {selected.embeddingModel} between the extracted answer sheet text and each
                    rubric criterion.
                  </div>
                </>
              ) : (
                <>
                  <div className="criteria-list">
                    {mockCriteriaBreakdown(selected.evaluationId, selected.claimedScore || 0).map((c) => (
                      <div className="criteria-row" key={c.name}>
                        <span className="name">{c.name}</span>
                        <span className="criteria-bar">
                          <span style={{ width: `${c.pct}%` }} />
                        </span>
                        <span className="pct">{c.pct}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="mock-note">
                    Sample criterion breakdown for demo purposes — this evaluation predates the MiniLM similarity
                    pipeline, so no real per-criterion data was recorded for it.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
