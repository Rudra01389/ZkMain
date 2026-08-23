const fs = require("fs");
const path = require("path");
const { ARTIFACTS_DIR } = require("./paths");
const { runPythonScript } = require("./pythonBridge");

const CERTIFICATION_PATH = path.join(ARTIFACTS_DIR, "certification.json");

/** The one fixed, previously-certified commitment. Never recomputed on the fly. */
function loadCertification() {
  if (!fs.existsSync(CERTIFICATION_PATH)) {
    throw new Error("Model has not been certified yet. Run ml/circuit/model_commitment.py certify.");
  }
  return JSON.parse(fs.readFileSync(CERTIFICATION_PATH, "utf8"));
}

/** Recomputes the commitment from whatever artifacts are on disk right now. */
async function currentCommitment() {
  return runPythonScript("model_commitment.py", {});
}

module.exports = { loadCertification, currentCommitment };
