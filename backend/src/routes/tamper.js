const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { loadCertification } = require("../services/certification");
const zkService = require("../services/zkService");
const { CERTIFIED_ANSWER_KEY } = require("../services/evaluator");
const { appendRecord, validateChain } = require("../services/auditChain");
const {
  saveEvaluation,
  loadEvaluation,
  loadPrivateEvaluation,
  loadAuditChain,
  saveAuditChain,
} = require("../services/store");
const { ARTIFACTS_DIR, ML_MODEL_DIR } = require("../services/paths");

const router = express.Router();

function sha256OfFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function sha256OfBuffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// Verification logic shared with routes/verify.js, factored out so tamper
// tests exercise the exact same real checks a normal /api/verify call does.
async function verifyRecord(record) {
  const checks = {};
  const reasons = [];

  const certification = loadCertification();
  checks.modelCommitment = record.modelCommitment === certification.commitment;
  if (!checks.modelCommitment) reasons.push("Model commitment mismatch: evaluation was not produced by the certified pipeline");

  const proofAbsPath = path.join(ARTIFACTS_DIR, record.proofFile);
  let proofFileIntact = false;
  if (fs.existsSync(proofAbsPath)) {
    proofFileIntact = sha256OfFile(proofAbsPath) === record.proofHash;
  }
  checks.proofFileIntact = proofFileIntact;
  if (!proofFileIntact) reasons.push("Proof file hash mismatch: stored proof file differs from the one recorded at evaluation time");

  let zk = { proof_valid: false, score_matches_proof: false, input_commitment_matches: false };
  if (proofFileIntact) {
    zk = await zkService.verifyProof(proofAbsPath, record.claimedScore, record.inputCommitment);
  }
  checks.proofValid = !!zk.proof_valid;
  checks.scoreValid = !!zk.score_matches_proof;
  checks.inputCommitmentValid = !!zk.input_commitment_matches;
  if (!checks.proofValid) reasons.push(zk.error ? `Invalid proof: ${zk.error}` : "Invalid proof: cryptographic verification failed");
  if (checks.proofValid && !checks.scoreValid) reasons.push(`Claimed score mismatch: record says ${record.claimedScore}, proof's public output is ${zk.public_score}`);
  if (checks.proofValid && !checks.inputCommitmentValid) reasons.push("Candidate input commitment mismatch");

  const audit = validateChain(record.batchId);
  checks.auditIntact = audit.intact;
  if (!audit.intact) reasons.push(`Audit chain tampered at record index ${audit.firstBrokenIndex}: ${audit.reason}`);

  const auditEntry = audit.records.find((r) => r.evaluationId === record.evaluationId);
  checks.auditRecordPresent = !!auditEntry;
  if (!auditEntry) reasons.push("No matching audit record found for this evaluation in its declared batch");

  const valid = Object.values(checks).every(Boolean);
  return { valid, checks, reasons, zk };
}

// Reuse the same certified answer key the demo evaluator maps rubric hits
// onto (services/evaluator.js) — this is the "every rubric criterion hit"
// encoding, i.e. a synthetic perfect answer, for these adversarial tests.
const CERTIFIED_ANSWERS = CERTIFIED_ANSWER_KEY;

async function makeEvaluation(candidateId, batchId, answers) {
  const certification = loadCertification();
  const proofResult = await zkService.generateProof(answers);
  const proofHash = sha256OfFile(proofResult.proof_path);
  const evaluationId = proofResult.run_id;
  const timestamp = new Date().toISOString();
  const record = {
    evaluationId,
    candidateId,
    batchId,
    modelVersion: certification.model_version,
    modelCommitment: certification.commitment,
    inputCommitment: proofResult.input_commitment,
    claimedScore: proofResult.score,
    proofFile: path.relative(ARTIFACTS_DIR, proofResult.proof_path),
    proofHash,
    timings_ms: proofResult.timings_ms,
    proofSizeBytes: proofResult.proof_size_bytes,
    timestamp,
  };
  saveEvaluation(record);
  require("../services/store").savePrivateEvaluation(evaluationId, { evaluationId, answers });
  appendRecord(batchId, {
    evaluationId,
    candidateId,
    modelCommitment: certification.commitment,
    inputCommitment: proofResult.input_commitment,
    claimedScore: proofResult.score,
    proofHash,
    timestamp,
  });
  return record;
}

// Test 1 — Valid Evaluation: certified model + correct input + correct score -> VALID.
router.post("/valid", async (req, res) => {
  try {
    const batchId = `tamper-test-valid-${Date.now()}`;
    const record = await makeEvaluation("SYN-CAND-001", batchId, CERTIFIED_ANSWERS);
    const result = await verifyRecord(record);
    res.json({ scenario: "valid-evaluation", expected: "VALID", record, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test 2 — Modified Model: evaluation declares a model commitment computed
// from a byte-perturbed copy of the certified ONNX file, instead of the
// real certified commitment. Verification must reject it.
router.post("/modified-model", async (req, res) => {
  try {
    const batchId = `tamper-test-model-${Date.now()}`;
    const record = await makeEvaluation("SYN-CAND-002", batchId, CERTIFIED_ANSWERS);
    const certification = loadCertification();

    // Actually perturb a real copy of the ONNX weights file and hash it —
    // this is a genuine SHA-256 of different model bytes, not a fake string.
    const onnxPath = path.join(ML_MODEL_DIR, "answer_scorer.onnx");
    const bytes = Buffer.from(fs.readFileSync(onnxPath));
    bytes[20] = (bytes[20] + 1) % 256; // flip one byte -> different weight bit pattern
    const modifiedOnnxHash = sha256OfBuffer(bytes);

    const { settings, compiled_circuit, verification_key } = certification.component_hashes;
    const forgedCommitment = "sha256:" + sha256OfBuffer(
      Buffer.from(`${modifiedOnnxHash}|${settings}|${compiled_circuit}|${verification_key}`, "utf8")
    );

    const tampered = { ...record, modelCommitment: forgedCommitment };
    saveEvaluation(tampered); // overwrite public record with the forged model commitment
    const result = await verifyRecord(tampered);
    res.json({
      scenario: "modified-model",
      expected: "INVALID",
      originalCommitment: certification.commitment,
      modifiedModelCommitment: forgedCommitment,
      record: tampered,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test 3 — Modified Candidate Input: after the proof was generated, the
// candidate's answers are (hypothetically) changed. The Poseidon input
// commitment recomputed from the modified answers no longer matches the
// commitment embedded in the already-generated proof.
router.post("/modified-input", async (req, res) => {
  try {
    const batchId = `tamper-test-input-${Date.now()}`;
    const record = await makeEvaluation("SYN-CAND-003", batchId, CERTIFIED_ANSWERS);
    const priv = loadPrivateEvaluation(record.evaluationId);

    const modifiedAnswers = [...priv.answers];
    modifiedAnswers[0] = (modifiedAnswers[0] + 1) % 4; // flip candidate's first answer

    const recomputed = await zkService.computeInputCommitment(modifiedAnswers);

    res.json({
      scenario: "modified-input",
      expected: "INVALID",
      originalInputCommitment: record.inputCommitment,
      recomputedCommitmentForModifiedInput: recomputed.input_commitment,
      commitmentMatches: recomputed.input_commitment === record.inputCommitment,
      valid: recomputed.input_commitment === record.inputCommitment,
      reasons:
        recomputed.input_commitment === record.inputCommitment
          ? []
          : [
              "Candidate input commitment mismatch: the modified answers hash to a different Poseidon commitment than the one embedded in the existing proof — the proof does not cover this input.",
            ],
      record,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test 4 — Modified Score: claimedScore is edited after proof generation.
router.post("/modified-score", async (req, res) => {
  try {
    const batchId = `tamper-test-score-${Date.now()}`;
    const record = await makeEvaluation("SYN-CAND-004", batchId, CERTIFIED_ANSWERS);
    const tampered = { ...record, claimedScore: record.claimedScore + 5 };
    saveEvaluation(tampered);
    const result = await verifyRecord(tampered);
    res.json({ scenario: "modified-score", expected: "INVALID", originalScore: record.claimedScore, tamperedScore: tampered.claimedScore, record: tampered, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test 5 — Modified Proof: proof bytes are corrupted after generation.
// (Its own proofHash is recomputed over the corrupted bytes, so the
// audit/file-integrity layer alone would not catch this — real EZKL
// cryptographic verification is what fails, demonstrating the two layers
// are independent.)
router.post("/modified-proof", async (req, res) => {
  try {
    const batchId = `tamper-test-proof-${Date.now()}`;
    const record = await makeEvaluation("SYN-CAND-005", batchId, CERTIFIED_ANSWERS);

    const origPath = path.join(ARTIFACTS_DIR, record.proofFile);
    const proofJson = JSON.parse(fs.readFileSync(origPath, "utf8"));
    proofJson.proof[10] = (proofJson.proof[10] + 1) % 256; // corrupt one proof byte

    const corruptedFileName = record.proofFile.replace(".json", "_corrupted.json");
    const corruptedPath = path.join(ARTIFACTS_DIR, corruptedFileName);
    fs.writeFileSync(corruptedPath, JSON.stringify(proofJson));
    const corruptedHash = sha256OfFile(corruptedPath);

    const tampered = { ...record, proofFile: corruptedFileName, proofHash: corruptedHash };
    saveEvaluation(tampered);
    const result = await verifyRecord(tampered);
    res.json({ scenario: "modified-proof", expected: "INVALID", record: tampered, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test 6 — Modified Audit Record: a stored audit-chain record's field is
// edited directly on disk (simulating a raw DB/file edit) without
// recomputing its stored hash. Hash-chain validation must detect it.
router.post("/modified-audit-record", async (req, res) => {
  try {
    const batchId = `tamper-test-audit-${Date.now()}`;
    const r1 = await makeEvaluation("SYN-CAND-006A", batchId, CERTIFIED_ANSWERS);
    const modifiedAnswers2 = [...CERTIFIED_ANSWERS];
    modifiedAnswers2[5] = (modifiedAnswers2[5] + 1) % 4;
    const r2 = await makeEvaluation("SYN-CAND-006B", batchId, modifiedAnswers2);

    const before = validateChain(batchId);

    const chain = loadAuditChain(batchId);
    chain[0].claimedScore = chain[0].claimedScore + 17; // direct tamper, hash NOT recomputed
    saveAuditChain(batchId, chain);

    const after = validateChain(batchId);

    res.json({
      scenario: "modified-audit-record",
      expected: "TAMPERED",
      batchId,
      recordsInBatch: [r1.evaluationId, r2.evaluationId],
      beforeTamper: { intact: before.intact },
      afterTamper: { intact: after.intact, firstBrokenIndex: after.firstBrokenIndex, reason: after.reason },
      valid: after.intact,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test 7 — Wrong Batch/Model: a genuinely valid evaluation record is
// re-associated with a batch it was never actually appended to.
router.post("/wrong-batch", async (req, res) => {
  try {
    const realBatchId = `tamper-test-realbatch-${Date.now()}`;
    const otherBatchId = `tamper-test-otherbatch-${Date.now()}`;
    const record = await makeEvaluation("SYN-CAND-007", realBatchId, CERTIFIED_ANSWERS);
    // Create the "other" batch so it exists but never contains this evaluation.
    await makeEvaluation("SYN-CAND-007-DECOY", otherBatchId, CERTIFIED_ANSWERS);

    const tampered = { ...record, batchId: otherBatchId };
    saveEvaluation(tampered);
    const result = await verifyRecord(tampered);
    res.json({ scenario: "wrong-batch", expected: "INVALID", claimedBatch: otherBatchId, actualBatch: realBatchId, record: tampered, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
