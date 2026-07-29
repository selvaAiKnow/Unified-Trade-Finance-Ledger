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
