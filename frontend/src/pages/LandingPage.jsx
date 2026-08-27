const ROLES = [
  {
    id: "examiner",
    icon: "👨‍🏫",
    title: "Teacher / Examiner",
    description: "Create evaluations, generate AI scores and review AI results.",
  },
  {
    id: "candidate",
    icon: "👨‍🎓",
    title: "Student / Candidate",
    description: "View and independently verify your evaluation.",
  },
  {
    id: "auditor",
    icon: "🔍",
    title: "Auditor",
    description: "Inspect the complete evaluation and audit history.",
  },
];

export default function LandingPage({ onSelectRole }) {
  return (
    <div className="landing">
      <h1>AI Evaluation Portal</h1>
      <p className="subtitle">
        A zero-knowledge proof pipeline (EZKL / Halo2) proves every AI-generated score without revealing model
        weights or a student's raw answer, backed by a 2-level human review and a tamper-evident audit trail.
      </p>
      <p className="subtitle" style={{ marginTop: -32, fontWeight: 600 }}>
        Choose your role
      </p>

      <div className="role-grid">
        {ROLES.map((role) => (
          <div key={role.id} className="role-card" onClick={() => onSelectRole(role.id)}>
            <div className="role-icon">{role.icon}</div>
            <h3>{role.title}</h3>
            <p>{role.description}</p>
          </div>
        ))}
      </div>

      <p className="landing-footnote">Smart India Hackathon demo prototype — not a production system.</p>
    </div>
  );
}
