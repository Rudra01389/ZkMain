"""Lightweight helper: computes the Poseidon input commitment EZKL would
embed as a public instance for a given candidate answer vector, WITHOUT
running the expensive proving step (only gen_witness, ~tens of ms).

Used by the audit/tamper-test layer to check "if the candidate's answers
were actually X, would that match the commitment baked into this specific
proof?" — this is how Test 3 (Modified Candidate Input) is verified for
real, using the same cryptographic hash EZKL uses internally, not a
reimplementation.

Usage:
    python3 input_commitment.py '{"answers": [0,2,1,...]}'
Prints: {"input_commitment": "0x..."}
"""
import asyncio
import inspect
import json
import os
import sys
import uuid

import ezkl
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model"))
from config import NUM_OPTIONS, NUM_QUESTIONS  # noqa: E402
from train import one_hot_answers  # noqa: E402

CIRCUIT_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(CIRCUIT_DIR, "artifacts")
COMPILED_PATH = os.path.join(ARTIFACTS_DIR, "model.compiled")
SRS_PATH = os.path.join(ARTIFACTS_DIR, "kzg.srs")
VK_PATH = os.path.join(ARTIFACTS_DIR, "vk.key")
TMP_DIR = os.path.join(ARTIFACTS_DIR, "tmp")


async def _maybe_await(result):
    if inspect.isawaitable(result):
        return await result
    return result


async def run(answers):
    if len(answers) != NUM_QUESTIONS or any(a < 0 or a >= NUM_OPTIONS for a in answers):
        raise ValueError(f"answers must be {NUM_QUESTIONS} ints in [0,{NUM_OPTIONS - 1}]")

    os.makedirs(TMP_DIR, exist_ok=True)
    tag = uuid.uuid4().hex[:12]
    input_path = os.path.join(TMP_DIR, f"input_{tag}.json")
    witness_path = os.path.join(TMP_DIR, f"witness_{tag}.json")

    vec = one_hot_answers(np.array(answers, dtype=np.int64))
    with open(input_path, "w") as f:
        json.dump({"input_data": [vec.tolist()]}, f)

    witness = await _maybe_await(
        ezkl.gen_witness(input_path, COMPILED_PATH, witness_path, VK_PATH, SRS_PATH)
    )

    with open(witness_path) as f:
        witness_json = json.load(f)
    commitment = witness_json["pretty_elements"]["processed_inputs"][0][0]
    score = float(witness_json["pretty_elements"]["rescaled_outputs"][0][0])

    for p in (input_path, witness_path):
        try:
            os.remove(p)
        except OSError:
            pass

    result = {"input_commitment": commitment, "score": score}
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    payload = json.loads(sys.argv[1])
    asyncio.run(run(payload["answers"]))
