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

The model is loaded once at startup (via a `lifespan` hook), not lazily on
first request — a corrupt or incompatible model artifact fails fast at
boot instead of surfacing as a `500` on the first real request. If
`model/risk_model.joblib` doesn't exist yet, the service still starts, but
`/risk-score` returns `503` until you run the training step above.

## Example

```bash
curl -X POST http://localhost:8002/risk-score \
  -H 'Content-Type: application/json' \
  -d '{"exporterCountry":"IN","buyerCountry":"NG","buyerIndustry":"commodities","buyerKybStatus":"PENDING","orderValue":250000,"paymentTerm":"USANCE_90"}'
# => {"grade":"A","score":0.1685,"topFactors":[{"factor":"buyerCountry","contribution":0.1398},{"factor":"buyerKybStatus","contribution":0.0711},{"factor":"buyerIndustry","contribution":0.0636}]}
```

(Output captured against the real trained artifact, `model/risk_model.joblib`
— not a hand-written fake.)

`buyerKybStatus` must be one of `CLEAR`/`PENDING`/`REVIEW`/`BLOCK`
(matching `api`'s `KybStatus` enum). `exporterCountry`/`buyerCountry`,
`buyerIndustry`, and `paymentTerm` must be one of the values in
`app/lookup_tables.py` — an unrecognized value returns `400`, not a
silent default. `orderValue` must be a positive number — zero or negative
values return `422`.

Most synthetic trades score low-risk (grade A) against the current A-E
thresholds — that's a known, deliberate characteristic of the synthetic
population given the generator's `HIGH_RISK_THRESHOLD` in
`app/training/generate_data.py`, not a bug; the thresholds themselves are
unchanged and correct.

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
