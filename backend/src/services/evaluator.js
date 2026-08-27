/**
 * Prototype/demo AI evaluator — deterministic keyword & rubric matching.
 * This is NOT an LLM and NOT production-grade NLP. It is intentionally a
 * simple, explainable stand-in so the ZK proof/audit layer (the actual
 * point of this project) stays the focus of the demo.
 *
 * Design note: the certified ZK circuit underneath is still the original
 * "20 slots x 4 options -> score" MLP (see ml/model, ml/circuit) — rebuilding
 * a new circuit/trusted-setup for free text would be by far the most
 * expensive part of this change for zero demo value. Instead, each of the
 * circuit's 20 slots is reinterpreted as one rubric criterion: "did the
 * student's answer hit this key concept?" A hit encodes the slot as the
 * certified/"correct" option, a miss encodes it as a wrong option — so the
 * existing certified model, compiled circuit, and proving/verification key
 * are reused completely unchanged, and the resulting score is still a real
 * number the ZK proof genuinely commits to and verifies.
 */

const RUBRIC_SIZE = 20; // must match ml/model/config.py NUM_QUESTIONS

// The certified answer key ml/model/train.py generated for ANSWER_KEY_SEED=42
// (config.py). This is the one fixed key the certified model was trained
// against; reused here as "which option = a rubric hit" per slot.
const CERTIFIED_ANSWER_KEY = [0, 3, 2, 1, 1, 3, 0, 2, 0, 0, 2, 3, 2, 3, 2, 3, 2, 0, 3, 1];

const QUESTIONS = [
  {
    // First in the list = the default the PDF-upload flow auto-selects
    // (candidates no longer pick a question). Rubric built from the
    // "University AI Assessment 2026 — Computer Networks" sample answer
    // sheet (TCP working, TCP vs UDP, ICMP, connection-oriented vs
    // connectionless), spread across its four sub-answers.
    id: "computer-networks",
    text: "Explain the working of TCP, differentiate between TCP and UDP, describe the purpose of ICMP, and explain connection-oriented versus connectionless communication.",
    keywords: [
      ["TCP", "Transmission Control Protocol"],
      ["connection-oriented", "connection oriented"],
      ["reliable delivery", "reliable and ordered delivery", "reliable communication"],
      ["ordered delivery", "maintains ordering", "sequence numbers"],
      ["three-way handshake", "three way handshake"],
      ["SYN", "SYN-ACK", "SYN packet"],
      ["acknowledgement", "ACK", "acknowledgements"],
      ["retransmission", "retransmit"],
      ["flow control"],
      ["congestion control"],
      ["UDP", "User Datagram Protocol"],
      ["connectionless"],
      ["no guarantee of delivery", "unreliable", "does not guarantee delivery"],
      ["overhead", "lower overhead", "higher overhead"],
      ["DNS", "streaming", "real-time applications"],
      ["ICMP", "Internet Control Message Protocol"],
      ["ping", "echo request", "echo reply"],
      ["destination unreachable", "time exceeded"],
      ["diagnostic information", "error and diagnostic", "error reporting"],
      ["logical connection", "dedicated connection", "establish a connection"],
    ],
  },
  {
    id: "hash-tamper",
    text: "What is a cryptographic hash function, and why is it useful for detecting tampering in stored data?",
    keywords: [
      ["hash function", "hash algorithm"],
      ["fixed-size", "fixed length", "fixed-length output"],
      ["deterministic"],
      ["one-way", "irreversible", "cannot be reversed"],
      ["collision resistant", "collision-resistant", "avoid collisions"],
      ["digest", "output digest"],
      ["sha-256", "sha256", "md5", "sha-1"],
      ["arbitrary length", "any size input", "input of any size"],
      ["unique output", "different output for different input"],
      ["small change", "tiny change", "avalanche effect"],
      ["completely different hash", "different hash value"],
      ["tamper detection", "tamper-evident", "detect tampering"],
      ["integrity", "data integrity"],
      ["compare hashes", "hash comparison", "comparing hashes"],
      ["stored hash", "original hash", "recorded hash"],
      ["mismatch", "does not match", "doesn't match", "won't match"],
      ["altered", "modified", "changed data"],
      ["audit", "audit trail", "audit log"],
      ["verification", "verify"],
      ["cryptographic", "cryptography"],
    ],
  },
  {
    id: "photosynthesis",
    text: "Explain the process of photosynthesis and why it is important for life on Earth.",
    keywords: [
      ["photosynthesis"],
      ["sunlight", "light energy", "solar energy"],
      ["chlorophyll"],
      ["carbon dioxide", "co2"],
      ["water", "h2o"],
      ["glucose", "sugar"],
      ["oxygen", "o2"],
      ["chloroplast", "chloroplasts"],
      ["leaves", "leaf"],
      ["energy conversion", "convert light energy", "convert energy"],
      ["light reaction", "light-dependent reaction"],
      ["calvin cycle", "dark reaction", "light-independent"],
      ["plants", "green plants"],
      ["atmosphere"],
      ["food chain", "food web"],
      ["respiration"],
      ["stomata"],
      ["equation", "chemical equation"],
      ["organic compounds", "organic matter"],
      ["life on earth", "sustain life", "essential for life"],
    ],
  },
];

function getQuestion(questionId) {
  const q = QUESTIONS.find((q) => q.id === questionId);
  if (!q) throw new Error(`unknown questionId: ${questionId}`);
  return q;
}

function listQuestions() {
  return QUESTIONS.map(({ id, text }) => ({ id, text }));
}

// Primary display phrase for each rubric criterion, in slot order. Reused
// as the text embedded/compared against the student answer in the MiniLM
// semantic-similarity pipeline (services/embeddingService.js) — same rubric
// data as the keyword matcher below, just a different "did this land?" test.
function getCriteriaPhrases(questionId) {
  return getQuestion(questionId).keywords.map((g) => g[0]);
}

// Shared encoding: a rubric "hit" (however it was determined — keyword
// match, embedding similarity, ...) becomes the certified/correct option
// for that slot, a "miss" becomes a wrong option. This is what actually
// keeps the existing certified circuit reusable unchanged across different
// evaluators.
function encodeHits(hits) {
  return hits.map((isHit, i) => {
    const correct = CERTIFIED_ANSWER_KEY[i];
    return isHit ? correct : (correct + 1) % 4;
  });
}

function buildFeedback(matchCount, total, missedTerms) {
  const ratio = matchCount / total;
  let verdict;
  if (ratio >= 0.8) verdict = "Strong answer — covers nearly all key concepts.";
  else if (ratio >= 0.5) verdict = "Solid answer — covers most key concepts but misses some.";
  else if (ratio >= 0.25) verdict = "Partial answer — touches on a few key concepts.";
  else verdict = "Weak answer — misses most of the key concepts expected.";

  if (missedTerms.length === 0) return verdict;
  const preview = missedTerms.slice(0, 3).join(", ");
  const more = missedTerms.length > 3 ? ", ..." : "";
  return `${verdict} Missing: ${preview}${more}.`;
}

/**
 * Deterministic keyword/rubric scoring of free-text studentAnswer against
 * the given question's rubric. Returns the 20-slot encoded vector fed to
 * the existing certified circuit, plus human-readable matched/missed terms
 * and feedback for display.
 */
function evaluateAnswer(questionId, studentAnswer) {
  const question = getQuestion(questionId);
  const lower = studentAnswer.toLowerCase();

  const matched = question.keywords.map((group) => group.some((phrase) => lower.includes(phrase.toLowerCase())));

  const encodedAnswers = encodeHits(matched);

  const matchedTerms = question.keywords.filter((_, i) => matched[i]).map((g) => g[0]);
  const missedTerms = question.keywords.filter((_, i) => !matched[i]).map((g) => g[0]);
  const matchCount = matchedTerms.length;

  return {
    encodedAnswers,
    matchCount,
    totalCriteria: RUBRIC_SIZE,
    matchedTerms,
    missedTerms,
    feedback: buildFeedback(matchCount, RUBRIC_SIZE, missedTerms),
  };
}

const MAX_TEACHER_CRITERIA = RUBRIC_SIZE;

// Maps an arbitrary teacher-defined rubric (1..RUBRIC_SIZE criteria) onto the
// certified circuit's fixed 20 slots by cycling through the criteria list.
// Each returned entry is an index into the teacher's criteria array, so every
// criterion gets a roughly equal share of the 20 slots and the existing
// certified model/circuit/proving key are reused completely unchanged.
function buildCriteriaSlotMap(criteriaCount) {
  if (!Number.isInteger(criteriaCount) || criteriaCount < 1 || criteriaCount > MAX_TEACHER_CRITERIA) {
    throw new Error(`rubric must have between 1 and ${MAX_TEACHER_CRITERIA} criteria`);
  }
  return Array.from({ length: RUBRIC_SIZE }, (_, i) => i % criteriaCount);
}

module.exports = {
  RUBRIC_SIZE,
  MAX_TEACHER_CRITERIA,
  CERTIFIED_ANSWER_KEY,
  QUESTIONS,
  getQuestion,
  listQuestions,
  getCriteriaPhrases,
  encodeHits,
  evaluateAnswer,
  buildCriteriaSlotMap,
};
