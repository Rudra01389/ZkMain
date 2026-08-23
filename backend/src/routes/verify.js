const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { loadCertification } = require("../services/certification");
const zkService = require("../services/zkService");
const { validateChain } = require("../services/auditChain");
const { loadEvaluation } = require("../services/store");
const { ARTIFACTS_DIR } = require("../services/paths");

const router = express.Router();

function sha256OfFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

router.post("/", async (req, res) => {
  try {
    const { evaluationId } = req.body || {};
    if (typeof evaluationId !== "string" || !evaluationId.trim()) {
      return res.status(400).json({ error: "evaluationId (string) is required" });
    }

    const record = loadEvaluation(evaluationId);
    if (!record) {
      return res.status(404).json({ error: `no evaluation record found for id ${evaluationId}` });
    }

    const checks = {};
    const reasons = [];

    // 1. Model commitment: compare the commitment stored on the evaluation
    //    record against the ONE fixed, previously-certified commitment.
    const certification = loadCertification();
    checks.modelCommitment = record.modelCommitment === certification.commitment;
    if (!checks.modelCommitment) reasons.push("Model commitment mismatch: evaluation was not produced by the certified pipeline");

    // 2. Proof file integrity at rest (has the stored proof file been
    //    swapped for different bytes since it was recorded?).
    const proofAbsPath = path.join(ARTIFACTS_DIR, record.proofFile);
    let proofFileIntact = false;
    if (fs.existsSync(proofAbsPath)) {
      proofFileIntact = sha256OfFile(proofAbsPath) === record.proofHash;
    }
    checks.proofFileIntact = proofFileIntact;
    if (!proofFileIntact) reasons.push("Proof file hash mismatch: stored proof file differs from the one recorded at evaluation time");

    // 3. Real cryptographic ZK proof verification (EZKL) + does the public
    //    score/input-commitment embedded in the proof match the record?
    let zk = { proof_valid: false, score_matches_proof: false, input_commitment_matches: false };
    if (proofFileIntact) {
      zk = await zkService.verifyProof(proofAbsPath, record.claimedScore, record.inputCommitment);
    }
    checks.proofValid = !!zk.proof_valid;
    checks.scoreValid = !!zk.score_matches_proof;
    checks.inputCommitmentValid = !!zk.input_commitment_matches;
    if (!checks.proofValid) reasons.push(zk.error ? `Invalid proof: ${zk.error}` : "Invalid proof: cryptographic verification failed");
    if (checks.proofValid && !checks.scoreValid) reasons.push(`Claimed score mismatch: record says ${record.claimedScore}, proof's public output is ${zk.public_score}`);
    if (checks.proofValid && !checks.inputCommitmentValid) reasons.push("Candidate input commitment mismatch: record's input commitment does not match the one embedded in the proof");

    // 4. Tamper-evident audit chain for this evaluation's batch.
    const audit = validateChain(record.batchId);
    checks.auditIntact = audit.intact;
    if (!audit.intact) reasons.push(`Audit chain tampered at record index ${audit.firstBrokenIndex}: ${audit.reason}`);

    const auditEntry = audit.records.find((r) => r.evaluationId === evaluationId);
    checks.auditRecordPresent = !!auditEntry;
    if (!auditEntry) reasons.push("No matching audit record found for this evaluation in its batch");

    const valid = Object.values(checks).every(Boolean);

    res.json({
      evaluationId,
      candidateId: record.candidateId,
      batchId: record.batchId,
      claimedScore: record.claimedScore,
      modelCommitment: record.modelCommitment,
      valid,
      checks,
      reasons,
      zkTimingsMs: zk.timings_ms || null,
      auditValidationSummary: { intact: audit.intact, length: audit.length, batchRootHash: audit.batchRootHash },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
