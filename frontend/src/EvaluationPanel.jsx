import { useEffect, useState } from "react";
import { api } from "./api";
import { MOCK_EXAMS, RUBRIC_VERSION } from "./constants";

export default function EvaluationPanel({ onEvaluated }) {
  const [questions, setQuestions] = useState([]);
  const [questionId, setQuestionId] = useState("");
  const [candidateId, setCandidateId] = useState("SYN-CAND-" + Math.floor(1000 + Math.random() * 9000));
  const [batchId, setBatchId] = useState(MOCK_EXAMS[0].id);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState(null); // null | "checking" | "verified" | "failed"

  useEffect(() => {
    api
      .questions()
      .then((data) => {
        setQuestions(data.questions);
        if (data.questions.length > 0) setQuestionId(data.questions[0].id);
      })
      .catch(() => {});
  }, []);

  const runEvaluation = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setVerifyStatus(null);
    try {
      const data = await api.evaluate({ candidateId, batchId, questionId, studentAnswer });
      setResult(data);
      onEvaluated?.(data.evaluation);
      setVerifyStatus("checking");
      try {
        const verify = await api.verify(data.evaluation.evaluationId);
        setVerifyStatus(verify.valid ? "verified" : "failed");
      } catch {
        setVerifyStatus("failed");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>Submit Answer</h2>
      <p className="muted">
        Scored by a lightweight prototype evaluator (deterministic keyword/rubric matching — not an LLM), then proven
        with a real EZKL zero-knowledge proof binding the model commitment, the (private) student answer, and the
        claimed score.
      </p>
      <span className="badge">Prototype demo evaluator — not a production LLM</span>

      <div className="row">
        <label>
          Candidate ID
          <input value={candidateId} onChange={(e) => setCandidateId(e.target.value)} />
        </label>
        <label>
          Select Exam
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {MOCK_EXAMS.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="stacked">
        Question
        <select value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.text}
            </option>
          ))}
        </select>
      </label>

      <label className="stacked">
        Student Answer
        <textarea
          rows={5}
          value={studentAnswer}
          onChange={(e) => setStudentAnswer(e.target.value)}
          placeholder="Type a free-text answer to the question above..."
        />
      </label>

      <button className="primary" onClick={runEvaluation} disabled={loading || !questionId || !studentAnswer.trim()}>
        {loading ? "Evaluating..." : "Submit Answer"}
      </button>

      {loading && (
        <div className="status pending">
          <span className="spinner" /> Running evaluator and generating ZK proof...
        </div>
      )}

      {error && <div className="status fail">✗ {error}</div>}

      {result && (
        <div className="result-box">
          <div className="score-hero">
            <span className="value">{Math.round(result.evaluation.claimedScore)}</span>
            <span className="of">/ 100</span>
          </div>

          {verifyStatus === "checking" && (
            <div className="status pending">
              <span className="spinner" /> Verifying ZK proof...
            </div>
          )}
          {verifyStatus === "verified" && <div className="status ok">✓ ZK Proof Verified</div>}
          {verifyStatus === "failed" && <div className="status fail">✗ ZK Proof Verification Failed</div>}

          <dl>
            <dt>Feedback</dt>
            <dd>{result.evaluation.feedback}</dd>
            <dt>Evaluation ID</dt>
            <dd className="mono">{result.evaluation.evaluationId}</dd>
            <dt>Model Version</dt>
            <dd>{result.evaluation.modelVersion}</dd>
            <dt>Rubric Version</dt>
            <dd>{RUBRIC_VERSION}</dd>
          </dl>

          <details className="tech-details">
            <summary>Cryptographic details</summary>
            <dl>
              <dt>Model Commitment</dt>
              <dd className="mono small">{result.evaluation.modelCommitment}</dd>
              <dt>Student Answer Commitment</dt>
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
        </div>
      )}
    </section>
  );
}
