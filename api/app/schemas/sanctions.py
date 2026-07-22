import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.enums import SanctionsStatus


class SanctionsScreeningTrigger(BaseModel):
    party_screened: str


class SanctionsScreeningOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trade_id: uuid.UUID
    party_screened: str
    status: SanctionsStatus
    raw_response: dict[str, Any]
    checked_at: datetime
