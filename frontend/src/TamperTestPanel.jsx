import { useState } from "react";
import { api } from "./api";

const SCENARIOS = [
  { key: "valid", label: "Valid Evaluation", expect: "VALID" },
  { key: "modified-model", label: "Modified Model", expect: "INVALID" },
  { key: "modified-input", label: "Modified Answer", expect: "INVALID" },
  { key: "modified-score", label: "Modified Score", expect: "INVALID" },
  { key: "modified-proof", label: "Modified Proof", expect: "INVALID" },
  { key: "modified-audit-record", label: "Modified Audit Record", expect: "TAMPERED" },
  { key: "wrong-batch", label: "Wrong Batch", expect: "INVALID" },
];

export default function TamperTestPanel() {
  const [running, setRunning] = useState(null);
  const [results, setResults] = useState({});

  const runScenario = async (key) => {
    setRunning(key);
    try {
      const data = await api.tamper(key);
      setResults((prev) => ({ ...prev, [key]: data }));
    } catch (e) {
      setResults((prev) => ({ ...prev, [key]: { error: e.message, valid: false } }));
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="panel">
      <h2>3. Adversarial / Tamper Tests</h2>
      <p className="muted">
        Each button runs a real evaluation, then real cryptographic/audit re-verification against a tampered
        artifact. Nothing here is hard-coded — every result comes from the actual proof/audit checks.
      </p>

      <div className="scenario-list">
        {SCENARIOS.map((s) => {
          const r = results[s.key];
          const pass = r && (s.expect === "VALID" ? r.valid === true : r.valid === false);
          return (
            <div className="scenario-row" key={s.key}>
              <button onClick={() => runScenario(s.key)} disabled={running === s.key}>
                {running === s.key ? "Running..." : `Run: ${s.label}`}
              </button>
              <span className="expect">expected: {s.expect}</span>
              {r && (
                <span className={`status inline ${pass ? "ok" : "fail"}`}>
                  {r.error
                    ? `✗ error: ${r.error}`
                    : r.valid
                    ? "✓ VERIFIED"
                    : `✗ ${s.expect === "TAMPERED" ? "TAMPER DETECTED" : "VERIFICATION FAILED"}`}
                </span>
              )}
              {r?.reasons?.length > 0 && <div className="reasons small">{r.reasons.join(" | ")}</div>}
              {r?.afterTamper && (
                <div className="reasons small">Audit intact after tamper: {String(r.afterTamper.intact)} — {r.afterTamper.reason}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
