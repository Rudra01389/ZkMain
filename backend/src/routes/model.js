const express = require("express");
const { loadCertification } = require("../services/certification");
const { listEvaluations } = require("../services/store");

const router = express.Router();

// Public certification record: commitment + component hashes. This never
// exposes model weights or the proving key — only hashes of the artifacts.
router.get("/commitment", (req, res) => {
  try {
    res.json(loadCertification());
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get("/evaluations", (req, res) => {
  const evals = listEvaluations().map(
    ({
      evaluationId,
      candidateId,
      batchId,
      question,
      claimedScore,
      displayScore10,
      modelCommitment,
      timestamp,
      sourceType,
      uploadedFileName,
      embeddingModel,
      similarityVector,
    }) => ({
      evaluationId,
      candidateId,
      batchId,
      question,
      claimedScore,
      displayScore10,
      modelCommitment,
      timestamp,
      sourceType,
      uploadedFileName,
      embeddingModel,
      similarityVector,
    })
  );
  res.json({ evaluations: evals });
});

module.exports = router;
