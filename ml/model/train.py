"""Trains the certified OMR (Optical Mark Recognition) answer-evaluation model.

Input:  80-dim float vector = 20 questions x 4 options, one-hot encoded
         per question (1.0 = bubble marked, 0.0 = not marked).
Output: single float = score out of 100, i.e. (correct_answers / 20) * 100.

The model is a small 2-layer MLP trained by regression against a fixed,
synthetic "certified answer key" (see config.ANSWER_KEY_SEED). It is
intentionally tiny (80 -> 16 -> 1, ~1.3k parameters) so it can be exported
to ONNX and compiled into a ZK circuit with EZKL.

Only synthetic data is used. No real candidate or examination data.
"""
import json
import os

import numpy as np
import torch
import torch.nn as nn

from config import ANSWER_KEY_SEED, INPUT_DIM, MODEL_VERSION, NUM_OPTIONS, NUM_QUESTIONS

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
torch.manual_seed(7)


def generate_answer_key(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, NUM_OPTIONS, size=NUM_QUESTIONS)


def one_hot_answers(choices: np.ndarray) -> np.ndarray:
    """choices: int array of shape (NUM_QUESTIONS,) with values in [0, NUM_OPTIONS)."""
    vec = np.zeros((NUM_QUESTIONS, NUM_OPTIONS), dtype=np.float32)
    vec[np.arange(NUM_QUESTIONS), choices] = 1.0
    return vec.reshape(-1)


def synthetic_dataset(answer_key: np.ndarray, n_samples: int, seed: int):
    rng = np.random.default_rng(seed)
    xs, ys = [], []
    for _ in range(n_samples):
        # Each candidate answers each question independently: with
        # probability p (varied per-sample) they pick the correct option,
        # otherwise a uniformly random option. This produces a spread of
        # scores from ~0 to 100 across the synthetic population.
        p_correct = rng.uniform(0.0, 1.0)
        choices = np.empty(NUM_QUESTIONS, dtype=np.int64)
        for i in range(NUM_QUESTIONS):
            if rng.random() < p_correct:
                choices[i] = answer_key[i]
            else:
                choices[i] = rng.integers(0, NUM_OPTIONS)
        score = float(np.sum(choices == answer_key)) / NUM_QUESTIONS * 100.0
        xs.append(one_hot_answers(choices))
        ys.append(score)
    return np.stack(xs).astype(np.float32), np.array(ys, dtype=np.float32).reshape(-1, 1)


class AnswerScorer(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(INPUT_DIM, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
        )

    def forward(self, x):
        return self.net(x)


def train():
    answer_key = generate_answer_key(ANSWER_KEY_SEED)
    x_train, y_train = synthetic_dataset(answer_key, n_samples=4000, seed=1)
    x_val, y_val = synthetic_dataset(answer_key, n_samples=400, seed=2)

    x_train_t = torch.from_numpy(x_train)
    y_train_t = torch.from_numpy(y_train)
    x_val_t = torch.from_numpy(x_val)
    y_val_t = torch.from_numpy(y_val)

    model = AnswerScorer()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    loss_fn = nn.MSELoss()

    for epoch in range(300):
        model.train()
        optimizer.zero_grad()
        pred = model(x_train_t)
        loss = loss_fn(pred, y_train_t)
        loss.backward()
        optimizer.step()
        if epoch % 50 == 0 or epoch == 299:
            model.eval()
            with torch.no_grad():
                val_loss = loss_fn(model(x_val_t), y_val_t).item()
                val_mae = torch.mean(torch.abs(model(x_val_t) - y_val_t)).item()
            print(f"epoch {epoch:3d}  train_mse={loss.item():7.3f}  val_mse={val_loss:7.3f}  val_mae={val_mae:6.3f}")

    model.eval()
    torch.save(model.state_dict(), os.path.join(OUT_DIR, "answer_scorer.pt"))
    np.save(os.path.join(OUT_DIR, "answer_key.npy"), answer_key)

    with open(os.path.join(OUT_DIR, "model_metadata.json"), "w") as f:
        json.dump(
            {
                "model_version": MODEL_VERSION,
                "architecture": "Linear(80,16) -> ReLU -> Linear(16,1)",
                "input_format": "80-float vector: 20 questions x 4 one-hot options (A/B/C/D)",
                "output_format": "single float, score out of 100",
                "num_questions": NUM_QUESTIONS,
                "num_options": NUM_OPTIONS,
                "training_samples": 4000,
                "validation_samples": 400,
                "note": "Trained on synthetic data only. No real candidate data was used.",
            },
            f,
            indent=2,
        )

    # Sanity check: a candidate who answers everything correctly should score ~100.
    perfect = one_hot_answers(answer_key)
    with torch.no_grad():
        pred_perfect = model(torch.from_numpy(perfect).unsqueeze(0)).item()
    print(f"\nSanity check — all-correct candidate predicted score: {pred_perfect:.2f} (expected ~100)")

    zero_key = (answer_key + 1) % NUM_OPTIONS  # every answer wrong
    wrong = one_hot_answers(zero_key)
    with torch.no_grad():
        pred_wrong = model(torch.from_numpy(wrong).unsqueeze(0)).item()
    print(f"Sanity check — all-wrong candidate predicted score:   {pred_wrong:.2f} (expected ~0)")

    print(f"\nSaved model weights -> {os.path.join(OUT_DIR, 'answer_scorer.pt')}")
    print(f"Saved answer key      -> {os.path.join(OUT_DIR, 'answer_key.npy')}")
    print(f"Saved metadata         -> {os.path.join(OUT_DIR, 'model_metadata.json')}")


if __name__ == "__main__":
    train()
