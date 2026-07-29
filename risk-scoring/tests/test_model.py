import pytest

from app.lookup_tables import COUNTRY_RISK_TIER
from app.model import (
    FEATURE_ORDER,
    ModelVocabularyMismatchError,
    RiskModel,
    UnknownCategoryError,
    _DISPLAY_NAMES,
    grade_for_score,
    validate_pipeline_categories,
)
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


def test_score_is_rounded_to_four_decimal_places(risk_model: RiskModel):
    result = risk_model.score(
        exporter_country="IN",
        buyer_country="NG",
        buyer_industry="commodities",
        buyer_kyb_status="PENDING",
        order_value=250_000.0,
        payment_term="USANCE_90",
    )
    assert result.score == round(result.score, 4)


def test_display_names_map_internal_order_value_log_to_order_value():
    """orderValueLog is the internal, transformed column name used for
    column-index mapping (FEATURE_ORDER); callers should only ever see the
    field name they actually sent, orderValue, in topFactors output."""
    assert "orderValueLog" in FEATURE_ORDER
    assert _DISPLAY_NAMES["orderValueLog"] == "orderValue"


def test_top_factors_never_expose_the_internal_order_value_log_name(risk_model: RiskModel):
    result = risk_model.score(
        exporter_country="IN",
        buyer_country="RU",
        buyer_industry="mining",
        buyer_kyb_status="BLOCK",
        order_value=1_800_000.0,
        payment_term="USANCE_180",
    )
    factor_names = {factor.factor for factor in result.top_factors}
    assert "orderValueLog" not in factor_names


def test_validate_pipeline_categories_passes_for_a_freshly_trained_pipeline():
    X, y = generate_synthetic_dataset(n=1500, seed=7)
    pipeline = build_pipeline()
    pipeline.fit(X, y)

    validate_pipeline_categories(pipeline)  # should not raise


def test_validate_pipeline_categories_raises_when_training_data_is_missing_a_category():
    """Simulates someone adding an entry to a lookup table without
    retraining: fit a pipeline on data that never saw "RU" as a
    buyerCountry, and confirm validation refuses to accept the resulting
    model rather than letting it silently mis-score "RU" requests."""
    assert "RU" in COUNTRY_RISK_TIER

    X, y = generate_synthetic_dataset(n=3000, seed=11)
    mask = X[:, 1] != "RU"  # buyerCountry column
    X_filtered, y_filtered = X[mask], y[mask]
    assert "RU" not in X_filtered[:, 1]

    pipeline = build_pipeline()
    pipeline.fit(X_filtered, y_filtered)

    with pytest.raises(ModelVocabularyMismatchError, match="buyerCountry"):
        validate_pipeline_categories(pipeline)
