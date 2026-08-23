const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const { loadCertification } = require("../services/certification");
const zkService = require("../services/zkService");
const evaluator = require("../services/evaluator");
const embeddingService = require("../services/embeddingService");
const { extractText } = require("../services/pdfExtract");
const { appendRecord } = require("../services/auditChain");
const { saveEvaluation, savePrivateEvaluation } = require("../services/store");
const { ARTIFACTS_DIR, UPLOADS_DIR } = require("../services/paths");

const router = express.Router();

const MAX_ANSWER_LENGTH = 2000;
const EVALUATION_ID_RE = /^[a-f0-9]{12}$/;

function sha256OfFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("only PDF files are supported"));
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  upload.single("answerSheet")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

// List of demo questions (id + prompt text only — rubric keywords stay
// server-side so the frontend isn't handed the answer key).
router.get("/questions", (req, res) => {
  res.json({ questions: evaluator.listQuestions() });
});

router.post("/", async (req, res) => {
  try {
    const { candidateId, batchId, questionId, studentAnswer } = req.body || {};

    if (typeof candidateId !== "string" || !candidateId.trim()) {
      return res.status(400).json({ error: "candidateId (string) is required" });
    }
    if (typeof batchId !== "string" || !batchId.trim()) {
      return res.status(400).json({ error: "batchId (string) is required" });
    }
    if (typeof questionId !== "string" || !evaluator.QUESTIONS.some((q) => q.id === questionId)) {
      return res.status(400).json({ error: "questionId must be one of the demo question ids" });
    }
    if (typeof studentAnswer !== "string" || !studentAnswer.trim()) {
      return res.status(400).json({ error: "studentAnswer (non-empty string) is required" });
    }
    if (studentAnswer.length > MAX_ANSWER_LENGTH) {
      return res.status(400).json({ error: `studentAnswer must be at most ${MAX_ANSWER_LENGTH} characters` });
    }

    const certification = loadCertification();
    const question = evaluator.getQuestion(questionId);

    // Prototype/demo evaluator: deterministic keyword & rubric matching,
    // NOT an LLM. See services/evaluator.js for how this maps onto the
    // existing certified ZK circuit's 20 answer slots.
    const { encodedAnswers, matchCount, totalCriteria, matchedTerms, missedTerms, feedback } =
      evaluator.evaluateAnswer(questionId, studentAnswer);

    const proofResult = await zkService.generateProof(encodedAnswers);
    if (proofResult.score === null || proofResult.score === undefined) {
      return res.status(500).json({ error: "proof generation did not produce a score" });
    }

    const proofHash = sha256OfFile(proofResult.proof_path);
    const evaluationId = proofResult.run_id;
    const timestamp = new Date().toISOString();
    const displayScore10 = Math.max(0, Math.min(10, Math.round((proofResult.score / 10) * 10) / 10));

    const publicRecord = {
      evaluationId,
      candidateId,
      batchId,
      questionId,
      question: question.text,
      sourceType: "text",
      modelVersion: certification.model_version,
      modelCommitment: certification.commitment,
      inputCommitment: proofResult.input_commitment,
      claimedScore: proofResult.score,
      displayScore10,
      rubricMatchCount: matchCount,
      rubricTotal: totalCriteria,
      feedback,
      matchedTerms,
      missedTerms,
      evaluatorLabel: "Prototype demo evaluator (deterministic keyword/rubric matching) — not an LLM",
      proofFile: path.relative(ARTIFACTS_DIR, proofResult.proof_path),
      proofHash,
      timings_ms: proofResult.timings_ms,
      proofSizeBytes: proofResult.proof_size_bytes,
      timestamp,
    };

    saveEvaluation(publicRecord);
    // Private companion record: raw student answer + the encoded rubric
    // vector actually fed to the circuit. Never served by any public API
    // endpoint — only used internally by the tamper-test suite to
    // demonstrate what happens if the candidate's real input diverges from
    // what the proof commits to.
    savePrivateEvaluation(evaluationId, { evaluationId, questionId, studentAnswer, answers: encodedAnswers });

    const auditRecord = appendRecord(batchId, {
      evaluationId,
      candidateId,
      modelCommitment: certification.commitment,
      inputCommitment: proofResult.input_commitment,
      claimedScore: proofResult.score,
      proofHash,
      timestamp,
    });

    res.json({
      evaluation: publicRecord,
      audit: { index: auditRecord.index, recordHash: auditRecord.recordHash, prevHash: auditRecord.prevHash },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// New candidate flow: upload a PDF answer sheet instead of typing an
// answer. Text is extracted, compared against the question's rubric via
// MiniLM semantic similarity, thresholded into the SAME hit/miss encoding
// the keyword evaluator above already uses, and proven with the exact same
// (unmodified) ZK pipeline call as the "/" route above.
router.post("/upload", handleUpload, async (req, res) => {
  try {
    const { candidateId, batchId, questionId } = req.body || {};

    if (typeof candidateId !== "string" || !candidateId.trim()) {
      return res.status(400).json({ error: "candidateId (string) is required" });
    }
    if (typeof batchId !== "string" || !batchId.trim()) {
      return res.status(400).json({ error: "batchId (string) is required" });
    }
    if (typeof questionId !== "string" || !evaluator.QUESTIONS.some((q) => q.id === questionId)) {
      return res.status(400).json({ error: "questionId must be one of the demo question ids" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "answerSheet PDF file is required" });
    }

    const extractedText = await extractText(req.file.buffer);
    if (!extractedText) {
      return res.status(400).json({ error: "could not extract any text from the uploaded PDF" });
    }

    const certification = loadCertification();
    const question = evaluator.getQuestion(questionId);
    const criteria = evaluator.getCriteriaPhrases(questionId);

    // MiniLM semantic similarity — separate from, and does not touch, the
    // ZK circuit. Only its output (a similarity vector) is used, purely to
    // decide each slot's hit/miss the same way the keyword evaluator does.
    const { similarities, model: embeddingModel } = await embeddingService.computeSimilarities(extractedText, criteria);
    const hits = similarities.map((s) => s >= embeddingService.SIMILARITY_HIT_THRESHOLD);
    const encodedAnswers = evaluator.encodeHits(hits);

    // Existing, unmodified ZK proof pipeline — identical call to the "/" route above.
    const proofResult = await zkService.generateProof(encodedAnswers);
    if (proofResult.score === null || proofResult.score === undefined) {
      return res.status(500).json({ error: "proof generation did not produce a score" });
    }

    const proofHash = sha256OfFile(proofResult.proof_path);
    const evaluationId = proofResult.run_id;
    const timestamp = new Date().toISOString();
    const displayScore10 = Math.max(0, Math.min(10, Math.round((proofResult.score / 10) * 10) / 10));

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, `${evaluationId}.pdf`), req.file.buffer);

    const similarityVector = criteria.map((criterion, i) => ({
      criterion,
      similarity: similarities[i],
      hit: hits[i],
    }));

    const publicRecord = {
      evaluationId,
      candidateId,
      batchId,
      questionId,
      question: question.text,
      sourceType: "pdf-upload",
      uploadedFileName: req.file.originalname,
      embeddingModel,
      similarityVector,
      modelVersion: certification.model_version,
      modelCommitment: certification.commitment,
      inputCommitment: proofResult.input_commitment,
      claimedScore: proofResult.score,
      displayScore10,
      rubricMatchCount: hits.filter(Boolean).length,
      rubricTotal: evaluator.RUBRIC_SIZE,
      evaluatorLabel: `Prototype demo evaluator (MiniLM ${embeddingModel} semantic similarity, hit threshold ${embeddingService.SIMILARITY_HIT_THRESHOLD}) — not an LLM`,
      proofFile: path.relative(ARTIFACTS_DIR, proofResult.proof_path),
      proofHash,
      timings_ms: proofResult.timings_ms,
      proofSizeBytes: proofResult.proof_size_bytes,
      timestamp,
    };

    saveEvaluation(publicRecord);
    // Private companion record: extracted answer text + the encoded rubric
    // vector actually fed to the circuit. Never served by any public API
    // endpoint, same privacy pattern as the text-based route above.
    savePrivateEvaluation(evaluationId, { evaluationId, questionId, extractedText, answers: encodedAnswers });

    const auditRecord = appendRecord(batchId, {
      evaluationId,
      candidateId,
      modelCommitment: certification.commitment,
      inputCommitment: proofResult.input_commitment,
      claimedScore: proofResult.score,
      proofHash,
      timestamp,
    });

    res.json({
      evaluation: publicRecord,
      audit: { index: auditRecord.index, recordHash: auditRecord.recordHash, prevHash: auditRecord.prevHash },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serves back the raw uploaded PDF for a given evaluation (Examiner "view
// uploaded answer sheet"). Public — same trust level as the rest of the
// evaluation record; the file is not sensitive private witness material.
router.get("/upload/:evaluationId/file", (req, res) => {
  const { evaluationId } = req.params;
  if (!EVALUATION_ID_RE.test(evaluationId)) {
    return res.status(400).json({ error: "invalid evaluationId" });
  }
  const filePath = path.join(UPLOADS_DIR, `${evaluationId}.pdf`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "no uploaded file found for this evaluation" });
  }
  res.setHeader("Content-Type", "application/pdf");
  res.sendFile(filePath);
});

module.exports = router;
