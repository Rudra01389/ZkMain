const { runPythonScript } = require("./pythonBridge");

/** Generates a real EZKL proof for one candidate's answers. Private: `answers`. */
function generateProof(answers) {
  return runPythonScript("prove_eval.py", { answers }, { timeoutMs: 60000 });
}

/** Independently verifies a proof using only public artifacts (settings, vk, srs). */
function verifyProof(proofPath, claimedScore, expectedInputCommitment) {
  return runPythonScript(
    "verify_eval.py",
    { proof_path: proofPath, claimed_score: claimedScore, expected_input_commitment: expectedInputCommitment },
    { timeoutMs: 30000 }
  );
}

/** Computes what the input commitment WOULD be for a given answer vector, without proving. */
function computeInputCommitment(answers) {
  return runPythonScript("input_commitment.py", { answers }, { timeoutMs: 30000 });
}

module.exports = { generateProof, verifyProof, computeInputCommitment };
