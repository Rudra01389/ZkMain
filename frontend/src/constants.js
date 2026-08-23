// Demo-only constants. Exams map directly to the real `batchId` field the
// backend already groups evaluations/audit records by — no backend change
// needed. Rubric versioning does not exist in the backend (the evaluator's
// keyword rubric isn't hashed/committed anywhere yet), so it's a display-only
// label here, not a cryptographic claim.
export const MOCK_EXAMS = [
  { id: "exam-2026-general-knowledge", name: "General Knowledge Assessment — 2026" },
  { id: "exam-2026-science-fundamentals", name: "Science Fundamentals — 2026" },
];

export const RUBRIC_VERSION = "Rubric v1.0";
