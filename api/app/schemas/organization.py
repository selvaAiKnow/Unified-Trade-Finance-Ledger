import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import KybStatus, OrgType


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    org_type: OrgType
    country: str
    industry: str
    tax_id: str
    kyb_status: KybStatus
    created_at: datetime
