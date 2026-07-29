from dataclasses import dataclass

import joblib
import numpy as np
from sklearn.pipeline import Pipeline

from app.lookup_tables import COUNTRY_RISK_TIER, INDUSTRY_RISK_TIER, KYB_STATUS_RISK, PAYMENT_TERM_RISK

FEATURE_ORDER = ["exporterCountry", "buyerCountry", "buyerIndustry", "buyerKybStatus", "orderValueLog", "paymentTerm"]

_DISPLAY_NAMES: dict[str, str] = {"orderValueLog": "orderValue"}

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


class ModelVocabularyMismatchError(RuntimeError):
    """Raised when a fitted model's OneHotEncoder categories no longer match
    the current lookup-table vocabulary (app/lookup_tables.py). This happens
    when someone edits a lookup table without retraining: OneHotEncoder's
    handle_unknown="ignore" would otherwise silently collapse the new,
    unrecognized-by-the-model category to an all-zeros vector, producing a
    systematically wrong score with no error. Refuse to serve such a model
    instead."""


# (column name, lookup table) pairs, in the same order as CATEGORICAL_COLUMNS
# ([0, 1, 2, 3, 5]) in app/training/train_model.py -- i.e. the order the
# fitted OneHotEncoder's categories_ list is in.
_ENCODER_COLUMN_TABLES: list[tuple[str, dict[str, float]]] = [
    ("exporterCountry", COUNTRY_RISK_TIER),
    ("buyerCountry", COUNTRY_RISK_TIER),
    ("buyerIndustry", INDUSTRY_RISK_TIER),
    ("buyerKybStatus", KYB_STATUS_RISK),
    ("paymentTerm", PAYMENT_TERM_RISK),
]


def validate_pipeline_categories(pipeline: Pipeline) -> None:
    """Verify the fitted OneHotEncoder's known categories match the current
    lookup tables exactly. Raises ModelVocabularyMismatchError on any
    mismatch, identifying which column/table is out of sync."""
    encoder = pipeline.named_steps["preprocess"].named_transformers_["cat"]
    for (column_name, lookup_table), fitted_categories in zip(_ENCODER_COLUMN_TABLES, encoder.categories_):
        fitted_set = set(fitted_categories)
        expected_set = set(lookup_table.keys())
        if fitted_set != expected_set:
            missing_from_model = sorted(expected_set - fitted_set)
            stale_in_model = sorted(fitted_set - expected_set)
            raise ModelVocabularyMismatchError(
                f"Trained model's {column_name!r} vocabulary no longer matches its lookup table: "
                f"missing from model={missing_from_model}, stale in model={stale_in_model}. "
                "Retrain the model (python -m app.training.train_model) after changing "
                "app/lookup_tables.py."
            )


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
        return RiskScoreResult(grade=grade, score=round(probability, 4), top_factors=top_factors)

    def _explain(self, row: np.ndarray, actual_probability: float) -> list[FactorContribution]:
        contributions = []
        for i, name in enumerate(FEATURE_ORDER):
            perturbed = row.copy()
            perturbed[0, i] = _BASELINE_VALUES[name]
            perturbed_probability = float(self._pipeline.predict_proba(perturbed)[0, 1])
            contributions.append(
                FactorContribution(
                    factor=_DISPLAY_NAMES.get(name, name),
                    contribution=round(actual_probability - perturbed_probability, 4),
                )
            )
        contributions.sort(key=lambda c: abs(c.contribution), reverse=True)
        return contributions[:3]


def load_risk_model(model_path: str) -> RiskModel:
    pipeline = joblib.load(model_path)
    validate_pipeline_categories(pipeline)
    return RiskModel(pipeline)
