import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { MOCK_EXAMS, RUBRIC_VERSION } from "../constants";

const STEPS = [
  "Answer sheet uploaded",
  "Text extracted",
  "Generating embeddings...",
  "Comparing with rubric...",
  "Generating similarity vector...",
  "Generating ZK proof...",
];

export default function UploadEvaluationPanel({ onViewVerification }) {
  // The candidate never picks these — an exam/question still has to be
  // sent to the existing (unchanged) /evaluate/upload contract, so the
  // first available exam and the certified rubric's first question are
  // used automatically, same defaults this component always initialized
  // to, just no longer exposed as editable fields.
  const [questionId, setQuestionId] = useState("");
  const [candidateId] = useState("SYN-CAND-" + Math.floor(1000 + Math.random() * 9000));
  const [batchId] = useState(MOCK_EXAMS[0].id);
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [result, setResult] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState(null); // null | "checking" | "verified" | "failed"
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    api
      .questions()
      .then((data) => {
        if (data.questions.length > 0) setQuestionId(data.questions[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const acceptFile = (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    setStepIndex(-1);
  };

  const onFileChange = (e) => acceptFile(e.target.files?.[0] || null);

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (processing) return;
    acceptFile(e.dataTransfer.files?.[0] || null);
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    setStepIndex(-1);
  };

  const runEvaluation = async () => {
    if (!file || !questionId) return;
    setProcessing(true);
    setError(null);
    setResult(null);
    setVerifyStatus(null);
    setStepIndex(1); // upload + text extraction happen fast server-side, so both start "done"

    // The backend does upload -> extract -> embed -> proof as one request;
    // this timer just paces the checklist through the real stages while we
    // wait, capping before the final step until the response actually
    // arrives so "Generating ZK proof..." never shows as done prematurely.
    timerRef.current = setInterval(() => {
      setStepIndex((i) => (i < 4 ? i + 1 : i));
    }, 900);

    try {
      const formData = new FormData();
      formData.append("candidateId", candidateId);
      formData.append("batchId", batchId);
      formData.append("questionId", questionId);
      formData.append("answerSheet", file);

      const data = await api.evaluateUpload(formData);
      clearInterval(timerRef.current);
      setStepIndex(5);
      setResult(data);

      setVerifyStatus("checking");
      try {
        const verify = await api.verify(data.evaluation.evaluationId);
        setVerifyStatus(verify.valid ? "verified" : "failed");
      } catch {
        setVerifyStatus("failed");
      }
    } catch (e) {
      clearInterval(timerRef.current);
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setStepIndex(-1);
    setVerifyStatus(null);
  };

  return (
    <section className="panel">
      <h2>Upload Answer Sheet</h2>
      <p className="muted">
        Extracts text from your PDF, compares it to the rubric with a local MiniLM semantic-similarity model, then
        proves the resulting score with a real EZKL zero-knowledge proof.
      </p>
      <span className="badge">Prototype demo evaluator — not a production LLM</span>

      {!result && !file && (
        <div
          className={`dropzone${dragActive ? " active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          <p className="dropzone-hint">Drag & drop your answer sheet</p>
          <p className="dropzone-or">or</p>
          <label className="file-picker-btn" htmlFor="answer-sheet-input">
            Choose PDF
          </label>
          <input
            id="answer-sheet-input"
            type="file"
            accept="application/pdf"
            onChange={onFileChange}
            disabled={processing}
          />
          <p className="dropzone-note">PDF only</p>
        </div>
      )}

      {!result && file && (
        <div className="stacked" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="file-chip">✓ Answer sheet uploaded</div>
          <div className="muted">
            Filename: <span style={{ color: "var(--text)", fontWeight: 600 }}>{file.name}</span>
          </div>
          {!processing && (
            <button onClick={clearFile} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              Choose a different file
            </button>
          )}
        </div>
      )}

      {!result && file && (
        <button
          className="primary"
          onClick={runEvaluation}
          disabled={processing || !questionId}
          style={{ marginTop: 4 }}
        >
          {processing ? "Evaluating..." : "Evaluate Answer Sheet"}
        </button>
      )}

      {(processing || (stepIndex >= 0 && !result && !error)) && (
        <div className="step-list">
          {STEPS.map((label, i) => {
            const isDone = i <= stepIndex;
            const isActive = !isDone && processing && i === stepIndex + 1;
            return (
              <div className={`step-row ${isDone ? "done" : isActive ? "active" : ""}`} key={label}>
                <span className="marker">{isDone ? "✓" : isActive ? "●" : "○"}</span>
                {label}
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="status fail">✗ {error}</div>}

      {result && (
        <div className="result-box">
          <div className="complete-banner">
            <div className="label">✓ Evaluation Complete</div>
            <div className="score-hero" style={{ justifyContent: "center" }}>
              <span className="value">{Math.round(result.evaluation.claimedScore)}</span>
              <span className="of">/ 100</span>
            </div>

            {verifyStatus === "checking" && (
              <div className="status pending" style={{ justifyContent: "center" }}>
                <span className="spinner" /> Verifying ZK proof...
              </div>
            )}
            {verifyStatus === "verified" && <div className="status ok" style={{ justifyContent: "center" }}>✓ ZK Proof Verified</div>}
            {verifyStatus === "failed" && (
              <div className="status fail" style={{ justifyContent: "center" }}>
                ✗ ZK Proof Verification Failed
              </div>
            )}

            <div className="eval-id-hero">
              <div className="label">Evaluation ID</div>
              <div className="value">EVAL-{result.evaluation.evaluationId.slice(0, 6).toUpperCase()}</div>
              <div className="mono small muted" style={{ marginTop: 2 }}>
                {result.evaluation.evaluationId}
              </div>
            </div>

            <button className="primary" onClick={() => onViewVerification?.(result.evaluation.evaluationId)}>
              View Verification
            </button>
          </div>

          <dl>
            <dt>Model Version</dt>
            <dd>{result.evaluation.modelVersion}</dd>
            <dt>Rubric Version</dt>
            <dd>{RUBRIC_VERSION}</dd>
            <dt>Embedding Model</dt>
            <dd>{result.evaluation.embeddingModel}</dd>
            <dt>Concepts matched</dt>
            <dd>
              {result.evaluation.rubricMatchCount}/{result.evaluation.rubricTotal}
            </dd>
          </dl>

          <details className="tech-details">
            <summary>Cryptographic details</summary>
            <dl>
              <dt>Model Commitment</dt>
              <dd className="mono small">{result.evaluation.modelCommitment}</dd>
              <dt>Answer Sheet Commitment</dt>
              <dd className="mono small">{result.evaluation.inputCommitment}</dd>
              <dt>Proof Size</dt>
              <dd>{result.evaluation.proofSizeBytes} bytes</dd>
              <dt>Witness Generation</dt>
              <dd>{result.evaluation.timings_ms.witness_generation} ms</dd>
              <dt>Proof Generation</dt>
              <dd>{result.evaluation.timings_ms.proof_generation} ms</dd>
              <dt>Audit Chain Index</dt>
              <dd>
                #{result.audit.index} in exam batch "{batchId}"
              </dd>
            </dl>
          </details>

          <button onClick={reset} style={{ marginTop: 14 }}>
            Submit Another Answer Sheet
          </button>
        </div>
      )}
    </section>
  );
}
