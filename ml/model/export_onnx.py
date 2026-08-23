"""Exports the trained AnswerScorer to ONNX with a fixed opset and static
input shape, so the graph is deterministic and stable for ZK circuit
compilation.
"""
import os

import onnx
import torch

from config import INPUT_DIM
from train import AnswerScorer

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def export():
    model = AnswerScorer()
    model.load_state_dict(torch.load(os.path.join(OUT_DIR, "answer_scorer.pt")))
    model.eval()

    dummy_input = torch.zeros(1, INPUT_DIM, dtype=torch.float32)
    onnx_path = os.path.join(OUT_DIR, "answer_scorer.onnx")

    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        input_names=["candidate_answers"],
        output_names=["score"],
        opset_version=13,
        dynamic_axes=None,  # static shape: exactly one candidate per proof
        dynamo=False,  # use the legacy TorchScript-based exporter (no onnxscript dependency)
    )

    onnx_model = onnx.load(onnx_path)
    onnx.checker.check_model(onnx_model)
    print(f"ONNX model exported and validated -> {onnx_path}")
    print(f"  inputs:  {[(i.name, [d.dim_value for d in i.type.tensor_type.shape.dim]) for i in onnx_model.graph.input]}")
    print(f"  outputs: {[(o.name, [d.dim_value for d in o.type.tensor_type.shape.dim]) for o in onnx_model.graph.output]}")


if __name__ == "__main__":
    export()
