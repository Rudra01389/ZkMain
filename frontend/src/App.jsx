import { useEffect, useState } from "react";
import { api } from "./api";
import LandingPage from "./pages/LandingPage";
import CandidateDashboard from "./pages/CandidateDashboard";
import ExaminerDashboard from "./pages/ExaminerDashboard";
import AuditorDashboard from "./pages/AuditorDashboard";
import "./App.css";

const ROLE_LABEL = { candidate: "Student / Candidate", examiner: "Teacher / Examiner", auditor: "Auditor" };

function App() {
  const [view, setView] = useState("landing");
  const [apiUp, setApiUp] = useState(null);

  useEffect(() => {
    api.health().then(() => setApiUp(true)).catch(() => setApiUp(false));
  }, []);

  if (view === "landing") {
    return (
      <div className="app">
        <LandingPage onSelectRole={setView} />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-title">CertiProof</span>
          <span className="topbar-role">{ROLE_LABEL[view]} view</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className={`status inline ${apiUp ? "ok" : "fail"}`}>{apiUp ? "Backend online" : "Backend offline"}</span>
          <button className="back-link" onClick={() => setView("landing")}>
            ← Back to role selection
          </button>
        </div>
      </div>

      <main className="main">
        {view === "candidate" && <CandidateDashboard />}
        {view === "examiner" && <ExaminerDashboard />}
        {view === "auditor" && <AuditorDashboard />}
      </main>
    </div>
  );
}

export default App;
