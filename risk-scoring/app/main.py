from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException

from app.dependency import get_risk_model
from app.model import RiskModel, UnknownCategoryError
from app.schemas import FactorContributionResponse, RiskScoreRequest, RiskScoreResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_risk_model()
    yield


app = FastAPI(title="UTFL Risk Scoring", lifespan=lifespan)


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
        raise HTTPException(status_code=400, detail=str(e)) from e

    return RiskScoreResponse(
        grade=result.grade,
        score=result.score,
        top_factors=[
            FactorContributionResponse(factor=f.factor, contribution=f.contribution) for f in result.top_factors
        ],
    )
