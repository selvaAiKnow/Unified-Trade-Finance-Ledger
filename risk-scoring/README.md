# risk-scoring

A standalone FastAPI service computing a composite country/counterparty
credit risk grade (A-E), backed by a real `scikit-learn` model trained on
a synthetic dataset. See
`docs/superpowers/specs/2026-07-29-risk-scoring-design.md` for the design,
including why the training data is synthetic (no historical trade outcome
data exists anywhere in this platform) and how the synthetic-label
generator is built so the model has to genuinely learn the risk
relationship, not just echo a formula back.

This is a standalone service in this phase: nothing in `api`/`web` calls
it yet, matching every other Phase 3-5 sub-project's deferred-integration
pattern.

## Requirements

- Python 3.12

## Setup

```bash
cd risk-scoring
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements-dev.txt
```

## Train the model (one-time, required before running the service)

```bash
python -m app.training.train_model
```

Prints the validation AUC (expect comfortably above the 0.75 floor the
training script enforces) and writes `model/risk_model.joblib` —
gitignored, regenerated locally like a build output. Rerun this any time
`app/lookup_tables.py` or `app/training/generate_data.py` change.

## Run

```bash
uvicorn app.main:app --port 8002
```

If `model/risk_model.joblib` doesn't exist yet, the service still starts,
but `/risk-score` returns `503` until you run the training step above.

## Example

```bash
curl -X POST http://localhost:8002/risk-score \
  -H 'Content-Type: application/json' \
  -d '{"exporterCountry":"IN","buyerCountry":"NG","buyerIndustry":"commodities","buyerKybStatus":"PENDING","orderValue":250000,"paymentTerm":"USANCE_90"}'
# => {"grade":"D","score":0.72,"topFactors":[...]}
```

`buyerKybStatus` must be one of `CLEAR`/`PENDING`/`REVIEW`/`BLOCK`
(matching `api`'s `KybStatus` enum). `exporterCountry`/`buyerCountry`,
`buyerIndustry`, and `paymentTerm` must be one of the values in
`app/lookup_tables.py` — an unrecognized value returns `400`, not a
silent default.

## Build and test

```bash
pytest -v
```

Fast — no Docker, no live network. `tests/training/` covers the synthetic
generator's correctness (including that the risk formula's direction
actually shows up in the labels) and the trained model's AUC floor.
`tests/test_model.py` covers `RiskModel`'s own logic (grading thresholds,
category validation, factor explanation) against a small real pipeline
trained ad-hoc in the test — not the full on-disk artifact.
`tests/test_risk_score.py` covers the route against a hand-written fake.

## Module layout

- `app/lookup_tables.py` — the country/industry/KYB/payment-term risk
  tiers, shared by the synthetic generator and by `RiskModel`'s input
  validation.
- `app/training/` — `generate_data.py` (synthetic dataset generator),
  `train_model.py` (builds and trains the `scikit-learn` pipeline, run
  once offline via `python -m app.training.train_model`).
- `app/model.py` — `RiskModel` (scoring, A-E grading, per-request factor
  explanation via baseline perturbation), `load_risk_model` (loads the
  joblib artifact for production use).
- `app/dependency.py` — `get_risk_model()`, cached after first successful
  load (unlike a cheap-per-call HTTP client, deserializing the model is
  expensive enough to do once).

## Not in scope for this service (see the design spec)

- Wiring `api`/`web` to call this service.
- Training on real historical trade outcome data (none exists on this
  platform).
- Model retraining infrastructure, versioning, or a feature store.
