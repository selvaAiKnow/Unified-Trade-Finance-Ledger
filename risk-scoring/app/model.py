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
