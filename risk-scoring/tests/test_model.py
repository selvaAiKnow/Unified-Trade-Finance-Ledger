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
