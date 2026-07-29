import pytest

import app.dependency as dependency_module
from app.dependency import get_risk_model
from app.model import RiskModel


@pytest.fixture(autouse=True)
def _clear_lru_cache():
    """get_risk_model is an lru_cache(maxsize=1); clear it before and after
    every test in this file so tests don't leak state into each other.
    Route-level tests in tests/test_risk_score.py use FastAPI's
    dependency_overrides instead, which bypasses this cache entirely, so
    this reset is scoped to this file's direct calls."""
    get_risk_model.cache_clear()
    yield
    get_risk_model.cache_clear()


def test_get_risk_model_returns_a_working_model_when_the_artifact_exists(monkeypatch):
    monkeypatch.setattr(dependency_module.settings, "risk_model_path", "model/risk_model.joblib")

    model = get_risk_model()

    assert isinstance(model, RiskModel)
    result = model.score(
        exporter_country="IN",
        buyer_country="NG",
        buyer_industry="commodities",
        buyer_kyb_status="PENDING",
        order_value=250_000.0,
        payment_term="USANCE_90",
    )
    assert result.grade in {"A", "B", "C", "D", "E"}


def test_get_risk_model_returns_none_when_the_artifact_is_missing(monkeypatch):
    monkeypatch.setattr(dependency_module.settings, "risk_model_path", "model/does-not-exist.joblib")

    model = get_risk_model()

    assert model is None


def test_get_risk_model_caches_the_result_across_calls(monkeypatch):
    monkeypatch.setattr(dependency_module.settings, "risk_model_path", "model/risk_model.joblib")

    first = get_risk_model()
    second = get_risk_model()

    assert first is second
