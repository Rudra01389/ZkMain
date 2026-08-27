import { useRef, useState } from "react";
import { api } from "./api";

const STEPS = [
  "Answer sheet uploaded",
  "Text extracted",
  "Generating MiniLM embeddings...",
  "Comparing with rubric criteria...",
  "Generating ZK proof...",
];

export default function CreateEvaluationPanel({ onCreated }) {
  const [examSubject, setExamSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [maxMarks, setMaxMarks] = useState(10);
  const [studentId, setStudentId] = useState("");
  const [criteria, setCriteria] = useState([""]);
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const updateCriterion = (i, value) => setCriteria((c) => c.map((v, idx) => (idx === i ? value : v)));
  const addCriterion = () => setCriteria((c) => (c.length < 20 ? [...c, ""] : c));
  const removeCriterion = (i) => setCriteria((c) => (c.length > 1 ? c.filter((_, idx) => idx !== i) : c));

  const acceptFile = (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setFile(f);
    setError(null);
  };
  const onFileChange = (e) => acceptFile(e.target.files?.[0] || null);
  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (processing) return;
    acceptFile(e.dataTransfer.files?.[0] || null);
  };

  const validCriteria = criteria.map((c) => c.trim()).filter(Boolean);
  const canSubmit =
    examSubject.trim() && question.trim() && Number(maxMarks) > 0 && studentId.trim() && validCriteria.length > 0 && file;

  const reset = () => {
    setExamSubject("");
    setQuestion("");
    setMaxMarks(10);
    setStudentId("");
    setCriteria([""]);
    setFile(null);
    setResult(null);
    setError(null);
    setStepIndex(-1);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setProcessing(true);
    setError(null);
    setResult(null);
    setStepIndex(1);

    timerRef.current = setInterval(() => {
      setStepIndex((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 800);

    try {
      const formData = new FormData();
      formData.append("examSubject", examSubject.trim());
      formData.append("question", question.trim());
      formData.append("maxMarks", String(maxMarks));
      formData.append("studentId", studentId.trim());
      formData.append("criteria", JSON.stringify(validCriteria));
      formData.append("answerSheet", file);

      const data = await api.createTeacherEvaluation(formData);
      clearInterval(timerRef.current);
      setStepIndex(STEPS.length);
      setResult(data.evaluation);
      onCreated?.(data.evaluation);
    } catch (e) {
      clearInterval(timerRef.current);
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="panel">
      <h2>Create Evaluation</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Define the rubric, upload the student&apos;s answer sheet, and generate an AI score with a ZK proof.
      </p>

      {!result && (
        <>
          <div className="row">
            <label>
              Exam / Subject
              <input value={examSubject} onChange={(e) => setExamSubject(e.target.value)} placeholder="e.g. Computer Networks" style={{ minWidth: 220 }} />
            </label>
            <label>
              Maximum Marks
              <input type="number" min="1" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} style={{ width: 110 }} />
            </label>
            <label>
              Student ID
              <input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. STU-101" style={{ minWidth: 160 }} />
            </label>
          </div>

          <label className="stacked">
            Question
            <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Explain the TCP three-way handshake" />
          </label>

          <label className="stacked" style={{ marginBottom: 6 }}>Rubric Criteria</label>
          <div className="criteria-builder">
            {criteria.map((c, i) => (
              <div className="criteria-input-row" key={i}>
                <input
                  value={c}
                  onChange={(e) => updateCriterion(i, e.target.value)}
                  placeholder={`Criterion ${i + 1} — e.g. Explain the SYN request`}
                />
                <button type="button" className="remove-criterion-btn" onClick={() => removeCriterion(i)} disabled={criteria.length <= 1}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addCriterion} disabled={criteria.length >= 20} style={{ marginBottom: 16 }}>
            + Add Criterion
          </button>

          {!file && (
            <div
              className={`dropzone${dragActive ? " active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
            >
              <p className="dropzone-hint">Drag & drop the student&apos;s answer sheet</p>
              <p className="dropzone-or">or</p>
              <label className="file-picker-btn" htmlFor="teacher-answer-sheet-input">
                Choose PDF
              </label>
              <input id="teacher-answer-sheet-input" type="file" accept="application/pdf" onChange={onFileChange} disabled={processing} />
              <p className="dropzone-note">PDF only — student answer sheet</p>
            </div>
          )}

          {file && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "10px 0" }}>
              <div className="file-chip">✓ {file.name}</div>
              {!processing && (
                <button onClick={() => setFile(null)} style={{ alignSelf: "flex-start" }}>
                  Choose a different file
                </button>
              )}
            </div>
          )}

          <button className="primary" onClick={submit} disabled={!canSubmit || processing} style={{ marginTop: 4 }}>
            {processing ? "Evaluating..." : "Evaluate Answer"}
          </button>

          {(processing || (stepIndex >= 0 && !error)) && (
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
        </>
      )}

      {result && (
        <div className="result-box">
          <div className="status ok">✓ AI evaluation complete</div>
          <div className="score-hero">
            <span className="value">{result.displayScore}</span>
            <span className="of">/ {result.maxMarks}</span>
          </div>
          <dl>
            <dt>Evaluation ID</dt>
            <dd className="mono small">{result.evaluationId}</dd>
            <dt>ZK Proof</dt>
            <dd>✓ Generated</dd>
            <dt>Model</dt>
            <dd className="mono small">{result.modelCommitment?.slice(0, 24)}...</dd>
            <dt>Rubric</dt>
            <dd>{result.rubricTotal} teacher-defined criteria ({result.rubricMatchCount} matched)</dd>
          </dl>
          <button className="primary" onClick={reset} style={{ marginTop: 14 }}>
            Create Another Evaluation
          </button>
          <p className="muted" style={{ marginTop: 10 }}>
            Scroll down to review this evaluation and record the teacher decision.
          </p>
        </div>
      )}
    </div>
  );
}
