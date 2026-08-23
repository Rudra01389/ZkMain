"""CLI used by the backend to generate a real EZKL proof for one candidate
evaluation.

Usage (from Node via child_process, or directly):
    python3 prove_eval.py '{"answers": [0,2,1,3, ... 20 ints in [0,3]]}'

Prints a single JSON object to stdout:
{
  "score": 85.0,
  "input_commitment": "0x...",     # poseidon hash of the private input (hex)
  "proof_path": "...",              # where proof.json was written
  "witness_path": "...",
  "timings_ms": {"witness": .., "proof": ..},
  "proof_size_bytes": ...
}

Nothing about the raw candidate answers is written to stdout beyond what
the caller already passed in (they are only used locally to build the
witness file, which stays private / server-side).
"""
import asyncio
import inspect
import json
import os
import sys
import time
import uuid

import ezkl

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model"))
from config import INPUT_DIM, NUM_OPTIONS, NUM_QUESTIONS  # noqa: E402
from train import one_hot_answers  # noqa: E402

CIRCUIT_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(CIRCUIT_DIR, "artifacts")
COMPILED_PATH = os.path.join(ARTIFACTS_DIR, "model.compiled")
SRS_PATH = os.path.join(ARTIFACTS_DIR, "kzg.srs")
VK_PATH = os.path.join(ARTIFACTS_DIR, "vk.key")
PK_PATH = os.path.join(ARTIFACTS_DIR, "pk.key")

PROOFS_DIR = os.path.join(ARTIFACTS_DIR, "proofs")


async def _maybe_await(result):
    if inspect.isawaitable(result):
        return await result
    return result


async def run(answers):
    if len(answers) != NUM_QUESTIONS or any(a < 0 or a >= NUM_OPTIONS for a in answers):
        raise ValueError(f"answers must be {NUM_QUESTIONS} ints in [0,{NUM_OPTIONS - 1}]")

    import numpy as np

    os.makedirs(PROOFS_DIR, exist_ok=True)
    run_id = uuid.uuid4().hex[:12]
    input_path = os.path.join(PROOFS_DIR, f"input_{run_id}.json")
    witness_path = os.path.join(PROOFS_DIR, f"witness_{run_id}.json")
    proof_path = os.path.join(PROOFS_DIR, f"proof_{run_id}.json")

    vec = one_hot_answers(np.array(answers, dtype=np.int64))
    with open(input_path, "w") as f:
        json.dump({"input_data": [vec.tolist()]}, f)

    t0 = time.time()
    witness = await _maybe_await(
        ezkl.gen_witness(input_path, COMPILED_PATH, witness_path, VK_PATH, SRS_PATH)
    )
    t1 = time.time()

    ok = await _maybe_await(ezkl.prove(witness_path, COMPILED_PATH, PK_PATH, proof_path, SRS_PATH))
    t2 = time.time()
    if not ok:
        raise RuntimeError("ezkl.prove returned falsy")

    with open(proof_path) as f:
        proof_json = json.load(f)

    # public instances: [input_commitment_hash..., score]
    # ezkl encodes public instances as field elements; decode the score
    # (last public output) back to float using the circuit's output scale.
    with open(os.path.join(ARTIFACTS_DIR, "settings.json")) as f:
        settings = json.load(f)
    output_scale = settings["model_output_scales"][0]

    pretty_public = proof_json.get("pretty_public_inputs", {})
    rescaled_outputs = pretty_public.get("rescaled_outputs", [[]])
    score = float(rescaled_outputs[0][0]) if rescaled_outputs and rescaled_outputs[0] else None

    input_commitment_felts = pretty_public.get("processed_inputs", [[]])
    input_commitment = input_commitment_felts[0][0] if input_commitment_felts and input_commitment_felts[0] else None

    proof_size = os.path.getsize(proof_path)

    result = {
        "run_id": run_id,
        "score": score,
        "input_commitment": input_commitment,
        "proof_path": proof_path,
        "witness_path": witness_path,
        "input_path": input_path,
        "timings_ms": {
            "witness_generation": round((t1 - t0) * 1000, 2),
            "proof_generation": round((t2 - t1) * 1000, 2),
        },
        "proof_size_bytes": proof_size,
    }
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    payload = json.loads(sys.argv[1])
    asyncio.run(run(payload["answers"]))
