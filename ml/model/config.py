"""Shared constants for the OMR evaluation model.

This is the ONLY place NUM_QUESTIONS / NUM_OPTIONS are defined; every other
script imports them so the input shape can never drift between training,
ONNX export, and the ZK circuit.
"""

NUM_QUESTIONS = 20
NUM_OPTIONS = 4
INPUT_DIM = NUM_QUESTIONS * NUM_OPTIONS  # 80 one-hot features
MODEL_VERSION = "omr-scorer-v1"

# Fixed synthetic "certified answer key" for this model version.
# Index i is the correct option (0=A, 1=B, 2=C, 3=D) for question i.
# This is PUBLIC in the sense that the trained model's weights encode it,
# but it is not read directly by any API endpoint.
ANSWER_KEY_SEED = 42
