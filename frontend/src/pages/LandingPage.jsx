const ROLES = [
  {
    id: "candidate",
    icon: "👨‍🎓",
    title: "Candidate",
    description: "Submit answers & view results",
  },
  {
    id: "examiner",
    icon: "🏛",
    title: "Examiner",
    description: "View AI evaluations",
  },
  {
    id: "auditor",
    icon: "🔍",
    title: "Auditor",
    description: "Verify evaluation proofs",
  },
];

export default function LandingPage({ onSelectRole }) {
  return (
    <div className="landing">
      <h1>Cryptographically Verifiable AI-Based Evaluation</h1>
      <p className="subtitle">
        A zero-knowledge proof pipeline (EZKL / Halo2) proves every AI-generated score without revealing model
        weights or a candidate's raw answer, backed by a tamper-evident audit trail.
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
