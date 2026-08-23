const { runPythonScript } = require("./pythonBridge");
const { ML_EMBEDDINGS_DIR } = require("./paths");

// Below this cosine similarity, a criterion is treated as "not covered" by
// the student's answer. Calibrated empirically against all-MiniLM-L6-v2:
// a genuinely relevant answer scores several criteria well above this line
// while an off-topic or empty-ish answer scores every criterion near/below
// it (short rubric phrases vs. a full paragraph naturally produce muted
// cosine scores with this model, so 0.5+ is not a realistic bar here).
const SIMILARITY_HIT_THRESHOLD = 0.3;

/** Computes cosine similarity between studentText and each criterion phrase using all-MiniLM-L6-v2. */
function computeSimilarities(studentText, criteria) {
  return runPythonScript(
    "embed_similarity.py",
    { studentText, criteria },
    { timeoutMs: 60000, cwd: ML_EMBEDDINGS_DIR }
  );
}

module.exports = { computeSimilarities, SIMILARITY_HIT_THRESHOLD };
