"""Computes and certifies the cryptographic identity of the evaluation
pipeline: a single SHA-256 commitment over the exact bytes of

  answer_scorer.onnx + settings.json + model.compiled + vk.key

This is the "Certified Model Commitment" referenced throughout the system.
It is NOT a filename, version string, or database ID — it is a hash over
the actual artifacts that determine circuit behavior. If any of the four
inputs changes by even one bit (different weights, different
quantization/visibility settings, different compiled circuit, or a
different verification key), the commitment changes completely.

`certify` writes certification.json (the public certification record).
`current_commitment` recomputes the commitment from the artifacts on disk
right now, so callers can detect drift from the certified value.
"""
import hashlib
import json
import os
import sys
import time

CIRCUIT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(CIRCUIT_DIR, "..", "model")
ARTIFACTS_DIR = os.path.join(CIRCUIT_DIR, "artifacts")

ONNX_PATH = os.path.join(MODEL_DIR, "answer_scorer.onnx")
SETTINGS_PATH = os.path.join(ARTIFACTS_DIR, "settings.json")
COMPILED_PATH = os.path.join(ARTIFACTS_DIR, "model.compiled")
VK_PATH = os.path.join(ARTIFACTS_DIR, "vk.key")
CERTIFICATION_PATH = os.path.join(ARTIFACTS_DIR, "certification.json")


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def current_commitment():
    """Recompute the commitment from artifacts currently on disk."""
    parts = []
    for path in [ONNX_PATH, SETTINGS_PATH, COMPILED_PATH, VK_PATH]:
        if not os.path.exists(path):
            raise FileNotFoundError(f"required artifact missing: {path}")
        parts.append(_sha256_file(path))

    combined = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return {
        "commitment": f"sha256:{combined}",
        "component_hashes": {
            "onnx": parts[0],
            "settings": parts[1],
            "compiled_circuit": parts[2],
            "verification_key": parts[3],
        },
    }


def certify(model_version):
    info = current_commitment()
    record = {
        "model_version": model_version,
        "commitment": info["commitment"],
        "component_hashes": info["component_hashes"],
        "certified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with open(CERTIFICATION_PATH, "w") as f:
        json.dump(record, f, indent=2)
    return record


def load_certification():
    if not os.path.exists(CERTIFICATION_PATH):
        raise FileNotFoundError("model not yet certified; run `python3 model_commitment.py certify <version>`")
    with open(CERTIFICATION_PATH) as f:
        return json.load(f)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "certify":
        version = sys.argv[2] if len(sys.argv) > 2 else "omr-scorer-v1"
        record = certify(version)
        print(json.dumps(record, indent=2))
    else:
        print(json.dumps(current_commitment(), indent=2))
