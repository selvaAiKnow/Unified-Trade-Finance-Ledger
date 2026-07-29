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
