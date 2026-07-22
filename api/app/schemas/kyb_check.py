import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import KybCheckStatus, KybCheckType


class KybCheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    check_type: KybCheckType
    status: KybCheckStatus
    detail: str | None
    checked_at: datetime
