import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BankReviewResult


class BankReviewFindingCreate(BaseModel):
    document_id: uuid.UUID
    result: BankReviewResult
    note: str | None = None


class BankReviewFindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trade_id: uuid.UUID
    document_id: uuid.UUID
    result: BankReviewResult
    note: str | None
    reviewed_by: uuid.UUID
    reviewed_at: datetime
