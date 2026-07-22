import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import DocumentVerificationStatus


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trade_id: uuid.UUID
    category: str
    document_type: str
    uploaded_by: uuid.UUID
    submitted_to: uuid.UUID
    off_chain_storage_ref: str
    on_chain_hash: str
    verification_status: DocumentVerificationStatus
    created_at: datetime
