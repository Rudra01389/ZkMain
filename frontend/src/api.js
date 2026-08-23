const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000/api";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request to ${path} failed with ${res.status}`);
  }
  return data;
}

export const api = {
  health: () => request("/health"),
  modelCommitment: () => request("/model/commitment"),
  evaluations: () => request("/model/evaluations"),
  questions: () => request("/evaluate/questions"),
  evaluate: (payload) => request("/evaluate", { method: "POST", body: JSON.stringify(payload) }),
  evaluateUpload: async (formData) => {
    const res = await fetch(`${API_BASE}/evaluate/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Upload failed with ${res.status}`);
    return data;
  },
  uploadedFileUrl: (evaluationId) => `${API_BASE}/evaluate/upload/${evaluationId}/file`,
  verify: (evaluationId) => request("/verify", { method: "POST", body: JSON.stringify({ evaluationId }) }),
  auditBatch: (batchId) => request(`/audit/${batchId}`),
  validateAudit: (batchId) => request(`/audit/${batchId}/validate`, { method: "POST" }),
  tamper: (scenario) => request(`/tamper/${scenario}`, { method: "POST", body: JSON.stringify({}) }),
};
