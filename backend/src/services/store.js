const fs = require("fs");
const path = require("path");
const { EVALUATIONS_DIR, AUDIT_DIR } = require("./paths");

function ensureDirs() {
  fs.mkdirSync(EVALUATIONS_DIR, { recursive: true });
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function evaluationPath(evaluationId) {
  return path.join(EVALUATIONS_DIR, `${evaluationId}.json`);
}

function privateEvaluationPath(evaluationId) {
  return path.join(EVALUATIONS_DIR, `${evaluationId}.private.json`);
}

function batchAuditPath(batchId) {
  return path.join(AUDIT_DIR, `${batchId}.json`);
}

function saveEvaluation(record) {
  ensureDirs();
  writeJson(evaluationPath(record.evaluationId), record);
}

function savePrivateEvaluation(evaluationId, privateData) {
  ensureDirs();
  writeJson(privateEvaluationPath(evaluationId), privateData);
}

function loadEvaluation(evaluationId) {
  return readJson(evaluationPath(evaluationId));
}

function loadPrivateEvaluation(evaluationId) {
  return readJson(privateEvaluationPath(evaluationId));
}

function listEvaluations() {
  ensureDirs();
  return fs
    .readdirSync(EVALUATIONS_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".private.json"))
    .map((f) => readJson(path.join(EVALUATIONS_DIR, f)))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

function loadAuditChain(batchId) {
  return readJson(batchAuditPath(batchId), []);
}

function saveAuditChain(batchId, chain) {
  ensureDirs();
  writeJson(batchAuditPath(batchId), chain);
}

function listBatches() {
  ensureDirs();
  return fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}

module.exports = {
  ensureDirs,
  readJson,
  writeJson,
  saveEvaluation,
  savePrivateEvaluation,
  loadEvaluation,
  loadPrivateEvaluation,
  listEvaluations,
  loadAuditChain,
  saveAuditChain,
  listBatches,
  evaluationPath,
  privateEvaluationPath,
  batchAuditPath,
};
