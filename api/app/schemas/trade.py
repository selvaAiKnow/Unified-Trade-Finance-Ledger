import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import TradeStatus


class TradeCreate(BaseModel):
    lc_reference: str
    industry: str
    instrument_type: str
    exporter_org_id: uuid.UUID
    buyer_org_id: uuid.UUID
    issuing_bank_org_id: uuid.UUID
    advising_bank_org_id: uuid.UUID
    product_description: str
    order_value: Decimal
    currency: str
    incoterm: str
    payment_term: str


class TradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lc_reference: str
    industry: str
    instrument_type: str
    exporter_org_id: uuid.UUID
    buyer_org_id: uuid.UUID
    issuing_bank_org_id: uuid.UUID
    advising_bank_org_id: uuid.UUID
    product_description: str
    order_value: Decimal
    currency: str
    incoterm: str
    payment_term: str
    status: TradeStatus
    created_at: datetime
    updated_at: datetime
