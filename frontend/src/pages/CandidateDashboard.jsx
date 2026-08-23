import UploadEvaluationPanel from "./UploadEvaluationPanel";

export default function CandidateDashboard({ onViewVerification }) {
  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Candidate Dashboard</h2>
      <p className="muted" style={{ marginBottom: 20 }}>
        Select an exam, upload your answer sheet as a PDF, and submit for AI evaluation with a cryptographic proof of
        the result.
      </p>
      <UploadEvaluationPanel onViewVerification={onViewVerification} />
    </div>
  );
}
