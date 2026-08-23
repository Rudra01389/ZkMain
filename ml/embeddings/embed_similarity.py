"""CLI used by the backend to compute semantic similarity between an
extracted student answer and a list of rubric criterion phrases, using
all-MiniLM-L6-v2 (sentence-transformers). This is separate from, and does
NOT modify, the ZK circuit/proof pipeline in ml/circuit/ — its only output
is a similarity vector; the backend thresholds that vector into the same
20-slot hit/miss encoding the existing certified circuit already expects
(see backend/src/services/evaluator.js).

Usage:
    python3 embed_similarity.py '{"studentText": "...", "criteria": ["...", ...]}'

Prints a single JSON object to stdout:
{
  "model": "all-MiniLM-L6-v2",
  "similarities": [0.63, 0.53, ...]   # cosine similarity, one per criterion, in order
}

Each criterion's similarity is the MAX cosine similarity against any one
sentence of the student's answer (not a single whole-document embedding).
A multi-part answer sheet covers many sub-topics; embedding it as one
vector averages all of them together and mutes the signal for any single
short criterion phrase, even ones the answer clearly covers. Comparing
against each sentence individually and keeping the best match avoids that
dilution and is what "did the student cover this concept anywhere in
their answer" actually means.
"""
import json
import re
import sys

from sentence_transformers import SentenceTransformer, util

MODEL_NAME = "all-MiniLM-L6-v2"
_model = None


def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def split_sentences(text):
    chunks = [c.strip() for c in re.split(r"(?<=[.!?])\s+|\n+", text) if len(c.strip()) > 15]
    return chunks or [text]


def run(student_text, criteria):
    model = get_model()
    chunks = split_sentences(student_text)
    chunk_embeddings = model.encode(chunks)
    criteria_embeddings = model.encode(criteria)
    # criteria x chunks similarity matrix; take the best-matching chunk per criterion
    sims = util.cos_sim(criteria_embeddings, chunk_embeddings).max(dim=1).values.tolist()
    result = {"model": MODEL_NAME, "similarities": [round(float(s), 4) for s in sims]}
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    payload = json.loads(sys.argv[1])
    run(payload["studentText"], payload["criteria"])
