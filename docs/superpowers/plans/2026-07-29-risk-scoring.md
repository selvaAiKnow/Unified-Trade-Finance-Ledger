# Risk Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `risk-scoring`, a standalone FastAPI service that computes a
composite country/counterparty credit risk grade (A-E) via a real
`scikit-learn` model trained on a synthetic dataset whose generator encodes
the actual risk domain knowledge — completing Phase 5.

**Architecture:** A synthetic-data generator (`app/training/generate_data.py`)
encodes country/industry/KYB/payment-term risk tiers plus deal size into a
hand-authored latent-risk formula with injected noise, producing labeled
training examples. `app/training/train_model.py` trains a
`scikit-learn` `Pipeline` (one-hot encoding + scaling + logistic regression)
on that data once, offline, and serializes it. The service
(`app/model.py`/`app/main.py`) loads the artifact at startup and serves
`POST /risk-score`, converting the model's probability into a grade plus a
per-request factor explanation via baseline perturbation.

**Tech Stack:** Python 3.12, FastAPI 0.115, `scikit-learn`, `numpy`,
`joblib` — matching `sanctions-adapter`/`ledger-monitoring`'s stack exactly,
plus the ML libraries this slice specifically needs.

## Global Constraints

- **No database, no `api`/`web` wiring.** Caller supplies every feature
  directly in the request body. Standalone service, matching every other
  sub-project this session.
- **The trained model artifact (`model/risk_model.joblib`) is gitignored**,
  not committed — regenerated locally via a one-time training step,
  documented in the README, same as a build output.
- **Unrecognized category values return 400**, never a silent default.
- **Grade thresholds:** `A: <0.20`, `B: 0.20-0.40`, `C: 0.40-0.60`,
  `D: 0.60-0.80`, `E: >=0.80`, applied to the model's predicted probability
  of the high-risk class.
- **`buyerKybStatus` values** are `CLEAR`, `PENDING`, `REVIEW`, `BLOCK`,
  matching `api`'s existing `KybStatus` enum exactly (not `APPROVED` —
  correcting the design spec's illustrative example, which used the wrong
  value; the spec's actual requirements text never depended on it).
- **The training pipeline's own test must assert a real AUC floor
  (> 0.75)** on a held-out synthetic split — this is the one thing that
  proves the model is genuinely learning the risk relationship, not just
  loading without error.

---

### Task 1: Project scaffold — health endpoint

**Files:**
- Create: `risk-scoring/README.md` (placeholder, filled in Task 6)
- Create: `risk-scoring/requirements.txt`
- Create: `risk-scoring/requirements-dev.txt`
- Create: `risk-scoring/pytest.ini`
- Create: `risk-scoring/app/__init__.py`
- Create: `risk-scoring/app/config.py`
- Create: `risk-scoring/app/main.py`
- Test: `risk-scoring/tests/__init__.py`
- Test: `risk-scoring/tests/test_health.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `app.main.app` (the FastAPI instance) — consumed by every
  later task's routes and tests. `app.config.settings.model_path` —
  consumed by Task 3 (where the artifact is written) and Task 5's
  dependency wiring.

- [ ] **Step 1: Write `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
httpx==0.27.2
pydantic==2.9.2
pydantic-settings==2.5.2
scikit-learn==1.5.2
numpy==1.26.4
joblib==1.4.2
```

- [ ] **Step 2: Write `requirements-dev.txt`**

```
-r requirements.txt
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Write `pytest.ini`**

```ini
[pytest]
pythonpath = .
asyncio_mode = auto
```

- [ ] **Step 4: Write `app/config.py`**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_path: str = "model/risk_model.joblib"

    class Config:
        env_file = ".env"


settings = Settings()
```

- [ ] **Step 5: Write the failing test**

Create `risk-scoring/tests/__init__.py` (empty file) and
`risk-scoring/tests/test_health.py`:

```python
from httpx import ASGITransport, AsyncClient

from app.main import app


async def test_health_returns_ok():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd risk-scoring && pytest tests/test_health.py -v`
Expected: FAIL with "No module named 'app.main'" or similar import error.

- [ ] **Step 7: Write `app/__init__.py` (empty) and `app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="UTFL Risk Scoring")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd risk-scoring && pytest tests/test_health.py -v`
Expected: PASS

- [ ] **Step 9: Write a placeholder README**

```markdown
# risk-scoring

Placeholder — filled in by the final task of this plan.
```

- [ ] **Step 10: Commit**

```bash
git add risk-scoring/README.md risk-scoring/requirements.txt risk-scoring/requirements-dev.txt \
        risk-scoring/pytest.ini risk-scoring/app/__init__.py risk-scoring/app/config.py \
        risk-scoring/app/main.py risk-scoring/tests/__init__.py risk-scoring/tests/test_health.py
git commit -m "Scaffold risk-scoring with a health endpoint"
```

---

### Task 2: Lookup tables and synthetic data generator

**Files:**
- Create: `risk-scoring/app/lookup_tables.py`
- Create: `risk-scoring/app/training/__init__.py`
- Create: `risk-scoring/app/training/generate_data.py`
- Test: `risk-scoring/tests/training/__init__.py`
- Test: `risk-scoring/tests/training/test_generate_data.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `COUNTRY_RISK_TIER`, `INDUSTRY_RISK_TIER`, `PAYMENT_TERM_RISK`,
  `KYB_STATUS_RISK` (all `dict[str, float]`) — consumed by Task 4's
  `RiskModel` validation. `generate_synthetic_dataset(n: int, seed: int)
  -> tuple[np.ndarray, np.ndarray]` — consumed by Task 3's training script
  and Task 4's tests.

- [ ] **Step 1: Write `app/lookup_tables.py`**

```python
COUNTRY_RISK_TIER: dict[str, float] = {
    "US": 0.05,
    "GB": 0.05,
    "DE": 0.05,
    "JP": 0.05,
    "FR": 0.08,
    "SG": 0.08,
    "KR": 0.10,
    "AE": 0.15,
    "IN": 0.15,
    "CN": 0.20,
    "MX": 0.25,
    "BR": 0.25,
    "ZA": 0.25,
    "ID": 0.30,
    "VN": 0.30,
    "TR": 0.35,
    "EG": 0.40,
    "PK": 0.40,
    "NG": 0.45,
    "RU": 0.55,
}

INDUSTRY_RISK_TIER: dict[str, float] = {
    "electronics": 0.15,
    "pharmaceuticals": 0.15,
    "automotive": 0.20,
    "textiles": 0.25,
    "agriculture": 0.30,
    "chemicals": 0.35,
    "construction": 0.35,
    "commodities": 0.45,
    "oil_gas": 0.45,
    "mining": 0.50,
}

PAYMENT_TERM_RISK: dict[str, float] = {
    "SIGHT": 0.05,
    "USANCE_30": 0.15,
    "USANCE_60": 0.25,
    "USANCE_90": 0.35,
    "USANCE_180": 0.50,
}

KYB_STATUS_RISK: dict[str, float] = {
    "CLEAR": 0.05,
    "PENDING": 0.30,
    "REVIEW": 0.50,
    "BLOCK": 0.90,
}
```

- [ ] **Step 2: Write `app/training/generate_data.py`**

```python
import numpy as np

from app.lookup_tables import COUNTRY_RISK_TIER, INDUSTRY_RISK_TIER, KYB_STATUS_RISK, PAYMENT_TERM_RISK

COUNTRIES = list(COUNTRY_RISK_TIER.keys())
INDUSTRIES = list(INDUSTRY_RISK_TIER.keys())
PAYMENT_TERMS = list(PAYMENT_TERM_RISK.keys())
KYB_STATUSES = list(KYB_STATUS_RISK.keys())

# Column order: exporterCountry, buyerCountry, buyerIndustry, buyerKybStatus,
# orderValueLog, paymentTerm -- matches app.model.FEATURE_ORDER exactly.
HIGH_RISK_THRESHOLD = 0.45


def generate_synthetic_dataset(n: int, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)

    rows = []
    labels = []
    for _ in range(n):
        exporter_country = rng.choice(COUNTRIES)
        buyer_country = rng.choice(COUNTRIES)
        buyer_industry = rng.choice(INDUSTRIES)
        buyer_kyb_status = rng.choice(KYB_STATUSES)
        payment_term = rng.choice(PAYMENT_TERMS)
        order_value = rng.lognormal(mean=11.5, sigma=1.2)
        order_value_log = float(np.log1p(order_value))

        latent_risk = (
            0.35 * COUNTRY_RISK_TIER[buyer_country]
            + 0.10 * COUNTRY_RISK_TIER[exporter_country]
            + 0.20 * INDUSTRY_RISK_TIER[buyer_industry]
            + 0.20 * KYB_STATUS_RISK[buyer_kyb_status]
            + 0.10 * PAYMENT_TERM_RISK[payment_term]
            + 0.05 * min(order_value / 2_000_000, 1.0)
        )
        noisy_risk = latent_risk + rng.normal(0, 0.12)
        high_risk = noisy_risk >= HIGH_RISK_THRESHOLD

        rows.append(
            [exporter_country, buyer_country, buyer_industry, buyer_kyb_status, order_value_log, payment_term]
        )
        labels.append(1 if high_risk else 0)

    X = np.array(rows, dtype=object)
    y = np.array(labels, dtype=int)
    return X, y
```

- [ ] **Step 3: Write the tests**

Create `risk-scoring/tests/training/__init__.py` (empty file) and
`risk-scoring/tests/training/test_generate_data.py`:

```python
import numpy as np

from app.lookup_tables import COUNTRY_RISK_TIER
from app.training.generate_data import generate_synthetic_dataset


def test_generate_synthetic_dataset_shapes():
    X, y = generate_synthetic_dataset(n=100, seed=1)
    assert X.shape == (100, 6)
    assert y.shape == (100,)
    assert set(np.unique(y)).issubset({0, 1})


def test_labels_are_not_all_one_class():
    _, y = generate_synthetic_dataset(n=2000, seed=1)
    high_risk_rate = y.mean()
    assert 0.05 < high_risk_rate < 0.95


def test_worse_buyer_country_correlates_with_higher_risk_rate():
    """The generator's formula must actually drive the labels: a buyer in the
    worst-tier country should show a higher mean high-risk rate than a buyer
    in the best-tier country, despite the noise and the other randomized
    features -- this is what proves the synthetic ground truth is real
    signal, not just noise with a coin flip attached."""
    X, y = generate_synthetic_dataset(n=6000, seed=1)
    buyer_country_column = X[:, 1]

    worst_country = max(COUNTRY_RISK_TIER, key=lambda country: COUNTRY_RISK_TIER[country])
    best_country = min(COUNTRY_RISK_TIER, key=lambda country: COUNTRY_RISK_TIER[country])

    worst_rate = y[buyer_country_column == worst_country].mean()
    best_rate = y[buyer_country_column == best_country].mean()

    assert worst_rate > best_rate
```

- [ ] **Step 4: Run the tests**

Run: `cd risk-scoring && pytest tests/training/test_generate_data.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add risk-scoring/app/lookup_tables.py risk-scoring/app/training/__init__.py \
        risk-scoring/app/training/generate_data.py risk-scoring/tests/training/__init__.py \
        risk-scoring/tests/training/test_generate_data.py
git commit -m "Add risk lookup tables and synthetic data generator"
```

---

### Task 3: Model training script

**Files:**
- Create: `risk-scoring/app/training/train_model.py`
- Test: `risk-scoring/tests/training/test_train_model.py`
- Modify: `.gitignore` (root)

**Interfaces:**
- Consumes: `generate_synthetic_dataset` (Task 2).
- Produces: `build_pipeline() -> Pipeline`, `train(n_samples: int, seed:
  int) -> tuple[Pipeline, float]` — `build_pipeline` consumed by Task 4's
  tests (to train a small real pipeline without file I/O); running
  `python -m app.training.train_model` produces
  `risk-scoring/model/risk_model.joblib`, consumed by Task 5's
  `get_risk_model()` dependency at runtime.

- [ ] **Step 1: Write the failing test**

Create `risk-scoring/tests/training/test_train_model.py`:

```python
from app.training.train_model import train


def test_trained_model_clears_the_auc_floor():
    """The one test that proves the model is genuinely learning the risk
    relationship from noisy features, not just loading without error --
    this project's equivalent of a live-network integration test for this
    service's actual core claim."""
    _, auc = train(n_samples=5000, seed=1)
    assert auc > 0.75
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd risk-scoring && pytest tests/training/test_train_model.py -v`
Expected: FAIL with "No module named 'app.training.train_model'".

- [ ] **Step 3: Write `app/training/train_model.py`**

```python
import sys
from pathlib import Path

import joblib
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.training.generate_data import generate_synthetic_dataset

# Column indices into the (n, 6) array generate_synthetic_dataset returns:
# 0=exporterCountry, 1=buyerCountry, 2=buyerIndustry, 3=buyerKybStatus (categorical),
# 4=orderValueLog (numeric), 5=paymentTerm (categorical).
CATEGORICAL_COLUMNS = [0, 1, 2, 3, 5]
NUMERIC_COLUMNS = [4]

AUC_FLOOR = 0.75


def build_pipeline() -> Pipeline:
    preprocessor = ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_COLUMNS),
            ("num", StandardScaler(), NUMERIC_COLUMNS),
        ]
    )
    return Pipeline(
        [
            ("preprocess", preprocessor),
            ("classify", LogisticRegression(max_iter=1000)),
        ]
    )


def train(n_samples: int = 20_000, seed: int = 42) -> tuple[Pipeline, float]:
    X, y = generate_synthetic_dataset(n_samples, seed=seed)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=seed, stratify=y
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    y_pred_proba = pipeline.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, y_pred_proba)
    return pipeline, auc


def main() -> None:
    pipeline, auc = train()
    print(f"Validation AUC: {auc:.4f}")
    if auc < AUC_FLOOR:
        print(f"AUC below the {AUC_FLOOR} floor -- refusing to save a weak model.", file=sys.stderr)
        sys.exit(1)

    model_dir = Path("model")
    model_dir.mkdir(exist_ok=True)
    model_path = model_dir / "risk_model.joblib"
    joblib.dump(pipeline, model_path)
    print(f"Model saved to {model_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd risk-scoring && pytest tests/training/test_train_model.py -v`
Expected: PASS. Note the printed AUC in the test output — it should be
comfortably above 0.75 given the generator's signal-to-noise ratio (the
0.75 floor is a regression guard, not a tight target).

- [ ] **Step 5: Gitignore the model artifact**

Add this line to the root `.gitignore`, alongside the existing `.env`
entries:

```
risk-scoring/model/
```

- [ ] **Step 6: Actually run the training script once**

```bash
cd risk-scoring
python -m app.training.train_model
```

Expected: prints a validation AUC above 0.75, then
`Model saved to model/risk_model.joblib`. This produces the artifact
Task 5's service loads at runtime — do this now so the service is
runnable after this task, even though the file itself isn't committed.

- [ ] **Step 7: Commit**

```bash
git add risk-scoring/app/training/train_model.py risk-scoring/tests/training/test_train_model.py .gitignore
git commit -m "Add model training script with an AUC-floor test"
```

---

### Task 4: RiskModel — scoring, grading, and factor explanation

**Files:**
- Create: `risk-scoring/app/model.py`
- Test: `risk-scoring/tests/test_model.py`

**Interfaces:**
- Consumes: `COUNTRY_RISK_TIER`, `INDUSTRY_RISK_TIER`, `PAYMENT_TERM_RISK`,
  `KYB_STATUS_RISK` (Task 2); `build_pipeline` (Task 3, test-only, to train
  a small real pipeline without file I/O).
- Produces: `RiskModel`, `load_risk_model(model_path: str) -> RiskModel`,
  `UnknownCategoryError`, `grade_for_score(score: float) -> str`,
  `FactorContribution`, `RiskScoreResult`, `FEATURE_ORDER` — consumed by
  Task 5's dependency wiring and routes.

`RiskModel` takes an already-fitted `Pipeline` via its constructor (not a
file path) specifically so this task's tests can inject a small,
fast-to-train real pipeline instead of needing Task 3's on-disk artifact —
`load_risk_model` is the thin wrapper that does the `joblib.load` for
production use (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `risk-scoring/tests/test_model.py`:

```python
import pytest

from app.model import RiskModel, UnknownCategoryError, grade_for_score
from app.training.train_model import build_pipeline
from app.training.generate_data import generate_synthetic_dataset


@pytest.fixture(scope="module")
def risk_model() -> RiskModel:
    """A small, fast-to-train real pipeline -- proves RiskModel's own logic
    (grading, validation, explanation) against genuine model output, without
    needing Task 3's full on-disk training artifact."""
    X, y = generate_synthetic_dataset(n=1500, seed=7)
    pipeline = build_pipeline()
    pipeline.fit(X, y)
    return RiskModel(pipeline)


def test_grade_for_score_boundaries():
    assert grade_for_score(0.0) == "A"
    assert grade_for_score(0.19) == "A"
    assert grade_for_score(0.20) == "B"
    assert grade_for_score(0.39) == "B"
    assert grade_for_score(0.40) == "C"
    assert grade_for_score(0.59) == "C"
    assert grade_for_score(0.60) == "D"
    assert grade_for_score(0.79) == "D"
    assert grade_for_score(0.80) == "E"
    assert grade_for_score(1.0) == "E"


def test_score_with_known_categories_returns_a_valid_result(risk_model: RiskModel):
    result = risk_model.score(
        exporter_country="IN",
        buyer_country="NG",
        buyer_industry="commodities",
        buyer_kyb_status="PENDING",
        order_value=250_000.0,
        payment_term="USANCE_90",
    )
    assert result.grade in {"A", "B", "C", "D", "E"}
    assert 0.0 <= result.score <= 1.0
    assert len(result.top_factors) == 3


def test_score_with_unknown_country_raises(risk_model: RiskModel):
    with pytest.raises(UnknownCategoryError):
        risk_model.score(
            exporter_country="ZZ",
            buyer_country="NG",
            buyer_industry="commodities",
            buyer_kyb_status="PENDING",
            order_value=250_000.0,
            payment_term="USANCE_90",
        )


def test_top_factors_are_sorted_by_absolute_contribution_descending(risk_model: RiskModel):
    result = risk_model.score(
        exporter_country="IN",
        buyer_country="RU",
        buyer_industry="mining",
        buyer_kyb_status="BLOCK",
        order_value=1_800_000.0,
        payment_term="USANCE_180",
    )
    magnitudes = [abs(factor.contribution) for factor in result.top_factors]
    assert magnitudes == sorted(magnitudes, reverse=True)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd risk-scoring && pytest tests/test_model.py -v`
Expected: FAIL with "No module named 'app.model'".

- [ ] **Step 3: Write `app/model.py`**

```python
from dataclasses import dataclass

import joblib
import numpy as np
from sklearn.pipeline import Pipeline

from app.lookup_tables import COUNTRY_RISK_TIER, INDUSTRY_RISK_TIER, KYB_STATUS_RISK, PAYMENT_TERM_RISK

FEATURE_ORDER = ["exporterCountry", "buyerCountry", "buyerIndustry", "buyerKybStatus", "orderValueLog", "paymentTerm"]

_BASELINE_VALUES: dict[str, object] = {
    "exporterCountry": "US",
    "buyerCountry": "US",
    "buyerIndustry": "electronics",
    "buyerKybStatus": "CLEAR",
    "orderValueLog": float(np.log1p(50_000.0)),
    "paymentTerm": "SIGHT",
}


class UnknownCategoryError(ValueError):
    pass


@dataclass
class FactorContribution:
    factor: str
    contribution: float


@dataclass
class RiskScoreResult:
    grade: str
    score: float
    top_factors: list[FactorContribution]


def grade_for_score(score: float) -> str:
    if score < 0.20:
        return "A"
    if score < 0.40:
        return "B"
    if score < 0.60:
        return "C"
    if score < 0.80:
        return "D"
    return "E"


class RiskModel:
    def __init__(self, pipeline: Pipeline):
        self._pipeline = pipeline

    def score(
        self,
        exporter_country: str,
        buyer_country: str,
        buyer_industry: str,
        buyer_kyb_status: str,
        order_value: float,
        payment_term: str,
    ) -> RiskScoreResult:
        for value, table, name in [
            (exporter_country, COUNTRY_RISK_TIER, "exporterCountry"),
            (buyer_country, COUNTRY_RISK_TIER, "buyerCountry"),
            (buyer_industry, INDUSTRY_RISK_TIER, "buyerIndustry"),
            (buyer_kyb_status, KYB_STATUS_RISK, "buyerKybStatus"),
            (payment_term, PAYMENT_TERM_RISK, "paymentTerm"),
        ]:
            if value not in table:
                raise UnknownCategoryError(f"Unrecognized {name}: {value}")

        order_value_log = float(np.log1p(order_value))
        row = np.array(
            [[exporter_country, buyer_country, buyer_industry, buyer_kyb_status, order_value_log, payment_term]],
            dtype=object,
        )

        probability = float(self._pipeline.predict_proba(row)[0, 1])
        grade = grade_for_score(probability)
        top_factors = self._explain(row, probability)
        return RiskScoreResult(grade=grade, score=probability, top_factors=top_factors)

    def _explain(self, row: np.ndarray, actual_probability: float) -> list[FactorContribution]:
        contributions = []
        for i, name in enumerate(FEATURE_ORDER):
            perturbed = row.copy()
            perturbed[0, i] = _BASELINE_VALUES[name]
            perturbed_probability = float(self._pipeline.predict_proba(perturbed)[0, 1])
            contributions.append(
                FactorContribution(factor=name, contribution=round(actual_probability - perturbed_probability, 4))
            )
        contributions.sort(key=lambda c: abs(c.contribution), reverse=True)
        return contributions[:3]


def load_risk_model(model_path: str) -> RiskModel:
    pipeline = joblib.load(model_path)
    return RiskModel(pipeline)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd risk-scoring && pytest tests/test_model.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add risk-scoring/app/model.py risk-scoring/tests/test_model.py
git commit -m "Add RiskModel: scoring, grading, and factor explanation"
```

---

### Task 5: POST /risk-score route

**Files:**
- Create: `risk-scoring/app/schemas.py`
- Create: `risk-scoring/app/dependency.py`
- Modify: `risk-scoring/app/main.py`
- Test: `risk-scoring/tests/fakes.py`
- Test: `risk-scoring/tests/test_risk_score.py`

**Interfaces:**
- Consumes: `RiskModel`, `load_risk_model`, `UnknownCategoryError` (Task 4);
  `settings.model_path` (Task 1).
- Produces: live `POST /risk-score` — this is the plan's externally-visible
  deliverable; nothing later in this plan consumes it programmatically
  (Task 6 is documentation only).

- [ ] **Step 1: Write `app/schemas.py`**

```python
from pydantic import BaseModel, ConfigDict, Field


class RiskScoreRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    exporter_country: str = Field(alias="exporterCountry")
    buyer_country: str = Field(alias="buyerCountry")
    buyer_industry: str = Field(alias="buyerIndustry")
    buyer_kyb_status: str = Field(alias="buyerKybStatus")
    order_value: float = Field(alias="orderValue")
    payment_term: str = Field(alias="paymentTerm")


class FactorContributionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    factor: str
    contribution: float


class RiskScoreResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    grade: str
    score: float
    top_factors: list[FactorContributionResponse] = Field(alias="topFactors")
```

- [ ] **Step 2: Write `app/dependency.py`**

Loading the model artifact means deserializing a fitted pipeline from
disk — unlike `ledger-monitoring`'s `get_blockchain_layer_client()` (a
cheap HTTP client constructed fresh per call), this is expensive enough to
cache once at first use rather than reconstruct per request:

```python
from app.config import settings
from app.model import RiskModel, load_risk_model

_risk_model: RiskModel | None = None
_load_attempted = False


def get_risk_model() -> RiskModel | None:
    global _risk_model, _load_attempted
    if not _load_attempted:
        _load_attempted = True
        try:
            _risk_model = load_risk_model(settings.model_path)
        except FileNotFoundError:
            _risk_model = None
    return _risk_model
```

- [ ] **Step 3: Write the failing tests**

Create `risk-scoring/tests/fakes.py`:

```python
from app.model import FactorContribution, RiskScoreResult


class FakeRiskModel:
    def __init__(self) -> None:
        self.result_to_return: RiskScoreResult | None = None
        self.error_to_raise: Exception | None = None
        self.last_args: dict | None = None

    def score(
        self,
        exporter_country: str,
        buyer_country: str,
        buyer_industry: str,
        buyer_kyb_status: str,
        order_value: float,
        payment_term: str,
    ) -> RiskScoreResult:
        self.last_args = {
            "exporter_country": exporter_country,
            "buyer_country": buyer_country,
            "buyer_industry": buyer_industry,
            "buyer_kyb_status": buyer_kyb_status,
            "order_value": order_value,
            "payment_term": payment_term,
        }
        if self.error_to_raise:
            raise self.error_to_raise
        return self.result_to_return or RiskScoreResult(
            grade="C",
            score=0.5,
            top_factors=[FactorContribution(factor="buyerCountry", contribution=0.1)],
        )
```

Create `risk-scoring/tests/test_risk_score.py`:

```python
from httpx import ASGITransport, AsyncClient

from app.dependency import get_risk_model
from app.main import app
from app.model import RiskScoreResult, FactorContribution, UnknownCategoryError
from tests.fakes import FakeRiskModel


async def _post(json_body: dict, fake_model: FakeRiskModel | None):
    app.dependency_overrides[get_risk_model] = lambda: fake_model
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/risk-score", json=json_body)
    finally:
        app.dependency_overrides.clear()


_VALID_BODY = {
    "exporterCountry": "IN",
    "buyerCountry": "NG",
    "buyerIndustry": "commodities",
    "buyerKybStatus": "PENDING",
    "orderValue": 250000.0,
    "paymentTerm": "USANCE_90",
}


async def test_risk_score_calls_the_model_and_returns_the_result():
    fake_model = FakeRiskModel()
    fake_model.result_to_return = RiskScoreResult(
        grade="D",
        score=0.72,
        top_factors=[
            FactorContribution(factor="buyerCountry", contribution=0.18),
            FactorContribution(factor="orderValueLog", contribution=0.11),
            FactorContribution(factor="paymentTerm", contribution=-0.04),
        ],
    )

    response = await _post(_VALID_BODY, fake_model)

    assert response.status_code == 200
    assert response.json() == {
        "grade": "D",
        "score": 0.72,
        "topFactors": [
            {"factor": "buyerCountry", "contribution": 0.18},
            {"factor": "orderValueLog", "contribution": 0.11},
            {"factor": "paymentTerm", "contribution": -0.04},
        ],
    }
    assert fake_model.last_args == {
        "exporter_country": "IN",
        "buyer_country": "NG",
        "buyer_industry": "commodities",
        "buyer_kyb_status": "PENDING",
        "order_value": 250000.0,
        "payment_term": "USANCE_90",
    }


async def test_risk_score_returns_400_for_unknown_category():
    fake_model = FakeRiskModel()
    fake_model.error_to_raise = UnknownCategoryError("Unrecognized buyerCountry: ZZ")

    response = await _post(_VALID_BODY, fake_model)

    assert response.status_code == 400
    assert response.json() == {"detail": "Unrecognized buyerCountry: ZZ"}


async def test_risk_score_returns_503_when_model_not_loaded():
    response = await _post(_VALID_BODY, None)

    assert response.status_code == 503
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd risk-scoring && pytest tests/test_risk_score.py -v`
Expected: FAIL — `/risk-score` doesn't exist yet (404s, or an import error
for `app.dependency`/`app.schemas` if those files aren't created yet in
your working order).

- [ ] **Step 5: Update `app/main.py`**

Replace the full contents of `app/main.py`:

```python
from fastapi import Depends, FastAPI, HTTPException

from app.dependency import get_risk_model
from app.model import RiskModel, UnknownCategoryError
from app.schemas import FactorContributionResponse, RiskScoreRequest, RiskScoreResponse

app = FastAPI(title="UTFL Risk Scoring")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/risk-score", response_model=RiskScoreResponse)
async def risk_score(
    payload: RiskScoreRequest,
    model: RiskModel | None = Depends(get_risk_model),
) -> RiskScoreResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="Risk model not loaded -- run training first")

    try:
        result = model.score(
            exporter_country=payload.exporter_country,
            buyer_country=payload.buyer_country,
            buyer_industry=payload.buyer_industry,
            buyer_kyb_status=payload.buyer_kyb_status,
            order_value=payload.order_value,
            payment_term=payload.payment_term,
        )
    except UnknownCategoryError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return RiskScoreResponse(
        grade=result.grade,
        score=result.score,
        top_factors=[
            FactorContributionResponse(factor=f.factor, contribution=f.contribution) for f in result.top_factors
        ],
    )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd risk-scoring && pytest tests/test_risk_score.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Run the full test suite**

Run: `cd risk-scoring && pytest -v`
Expected: PASS, all tests green (health, generator, training, model,
route tests).

- [ ] **Step 8: Commit**

```bash
git add risk-scoring/app/schemas.py risk-scoring/app/dependency.py risk-scoring/app/main.py \
        risk-scoring/tests/fakes.py risk-scoring/tests/test_risk_score.py
git commit -m "Add POST /risk-score with model-loading dependency and error handling"
```

---

### Task 6: README

**Files:**
- Modify: `risk-scoring/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by other tasks — documentation only, final
  task of this plan.

- [ ] **Step 1: Write `README.md`**

Replace the full contents of `risk-scoring/README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add risk-scoring/README.md
git commit -m "Document risk-scoring"
```
