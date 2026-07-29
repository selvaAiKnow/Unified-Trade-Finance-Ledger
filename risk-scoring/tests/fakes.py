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
