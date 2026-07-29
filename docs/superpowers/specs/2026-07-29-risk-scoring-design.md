# risk-scoring: ML-Based Composite Risk Grading — Design

**Phase:** 5 (Scale) sub-project 3 of 3 — the final Phase 5 sub-project.
Sub-projects 1-2 (multi-bank onboarding, Bank Guarantee) are already built
and merged. This completes Phase 5.

## Purpose

`risk-scoring` implements Component 4 from `docs/claude_code_build_prompt.md`
Section 1: "Risk Scoring Service — Computes composite country and
counterparty credit risk grade. Outputs: Risk grade A–E." It's a
standalone FastAPI service (matching `sanctions-adapter`/
`ledger-monitoring`'s shape) backed by a real trained `scikit-learn`
model — not a lookup table, not a hand-tuned formula scored live at
request time.

## The missing-data problem, and how this slice resolves it

Phase 2 ("rules-based risk scoring") was skipped earlier in this project's
build-out, and more fundamentally: **no historical trade outcome data
exists anywhere in this platform** — no record of which trades actually
defaulted, were repaid late, or performed as expected. A genuinely
supervised model needs labels, and there are none to train on honestly.

Resolution: a synthetic-data generator encodes the actual risk domain
knowledge (country risk tiers, industry risk tiers, KYB status, deal size,
payment tenor) as a hand-authored latent-risk formula, adds noise, and
derives synthetic labels from it. A real `scikit-learn` pipeline is then
trained to recover that mapping from noisy, correlated features — the
model has to learn the relationship, not just echo the formula back. This
is honestly a synthetic-data exercise, not real historical bank-loss data,
but it is a genuine trained-model pipeline: the formula lives only in the
generator, and the served model's behavior is what training produced, not
what was written by hand.

## Scope Decisions (from brainstorming)

- **Data access:** the caller supplies every feature directly in the
  request body — no database coupling. Matches `sanctions-adapter`'s and
  every other sub-project's standalone, deferred-integration pattern.
- **Model:** `scikit-learn` `LogisticRegression` inside a `Pipeline`
  (`OneHotEncoder` + `StandardScaler`), trained once via an offline
  script — not gradient boosting. Simple, minimal dependencies
  (`scikit-learn`/`numpy`/`joblib` only), and linear coefficients give a
  cheap, honest per-prediction factor explanation with no extra library.
- **Scope boundary:** standalone service only. No `api`/`web` wiring —
  matches every other sub-project this session.

## Explicitly out of scope for this slice

- Wiring `api`/`web` to call this service.
- Training on real historical outcome data (none exists).
- Any change to `api`'s `Trade`/`Organization` models (e.g. no new
  `risk_grade` column) — this service is standalone and read-only with
  respect to the rest of the platform.
- Model retraining infrastructure, model versioning, A/B testing, or a
  feature store — one model, trained once, loaded at startup.
- Gradient boosting or any heavier ML dependency.

## Architecture

**Features**, drawn directly from `api`'s real `Organization`/`Trade`
fields, per the spec's "composite country and counterparty" framing:
`exporter_country`, `buyer_country` (country risk dimension),
`buyer_industry`, `buyer_kyb_status` (counterparty risk dimension,
`buyer_kyb_status` matching `api`'s existing `KybStatus` enum values),
`order_value` (log-scaled — exposure size), `payment_term` (tenor risk —
sight vs. usance terms carry different risk).

**Synthetic data generator** (`app/training/generate_data.py`): produces N
synthetic trades with randomized-but-realistic feature values (drawn from
fixed country-risk-tier and industry-risk-tier lookup tables), computes a
latent "true" risk score via a hand-authored weighted formula over those
tiers plus KYB status weight, log-scaled order value, and payment-term
weight, adds Gaussian noise, and thresholds the noisy latent score into a
binary synthetic label (`high_risk: bool`). This formula is the one place
domain knowledge is hand-encoded; everywhere else the model must learn the
feature-to-label mapping itself.

**Model** (`app/training/train_model.py`, run once, offline): a
`scikit-learn` `Pipeline` (`OneHotEncoder` for categoricals +
`StandardScaler` for numerics + `LogisticRegression`) trained on the
generated dataset, serialized via `joblib` to `model/risk_model.joblib`.
This artifact is **gitignored and regenerated locally** — like a build
output, not a committed binary — with the one-time training step
documented in `README.md`.

**Serving** (`app/model.py`): loads the joblib artifact once at startup.
`POST /risk-score` runs it, converts `predict_proba`'s risk-class
probability into a discrete grade:

```
A: score < 0.20   B: 0.20-0.40   C: 0.40-0.60   D: 0.60-0.80   E: >= 0.80
```

## API Design

```
POST /risk-score
{
  "exporterCountry": "IN",
  "buyerCountry": "NG",
  "buyerIndustry": "commodities",
  "buyerKybStatus": "APPROVED",
  "orderValue": 250000.00,
  "currency": "USD",
  "paymentTerm": "USANCE_90"
}
  -> 200
{
  "grade": "C",
  "score": 0.47,
  "topFactors": [
    { "factor": "buyerCountry", "contribution": 0.18 },
    { "factor": "orderValue", "contribution": 0.11 },
    { "factor": "paymentTerm", "contribution": -0.04 }
  ]
}
```

`exporterCountry`/`buyerCountry`/`buyerIndustry`/`paymentTerm` values are
validated against the same fixed lookup tables the training generator
uses — an unrecognized value returns `400`, not a silent default (a wrong
grade from an unrecognized input is worse than an explicit rejection).
`topFactors` is derived from `LogisticRegression`'s coefficients applied
to this specific request's (scaled/encoded) feature values — a genuine,
per-prediction explanation, not a static feature-importance ranking.
`GET /health` matches the sibling services' convention.

## Error Handling

`400` for unrecognized category values or malformed request bodies (FastAPI's
standard pydantic validation, plus the explicit lookup-table checks above).
`503` if the model artifact hasn't been trained/loaded yet (a clear,
actionable error rather than a crash) — this is the one case where the
service itself, not the caller, is in a bad state.

## Testing

Unit tests for the FastAPI routes against a fake/injected model (request
validation, grading-threshold boundaries at each A-E cutoff, factor-list
shape, the unrecognized-category 400 path) — fast, no training run needed,
matching the existing `sanctions-adapter`/`ledger-monitoring` route-test
convention.

The one thing that needs a different kind of proof than "does it run":
whether the trained model is actually any good, not just structurally
present. `train_model.py`'s own test holds out a synthetic validation
split and asserts the trained model's AUC clears a floor (e.g. > 0.75) on
it — proving the pipeline produces a model that genuinely discriminates
high/low risk against the generator's own ground truth, not just one that
loads without crashing. This is this sub-project's equivalent of
`blockchain-layer`'s live-Docker integration test: the one test that
proves the core claim, not just the plumbing around it.
