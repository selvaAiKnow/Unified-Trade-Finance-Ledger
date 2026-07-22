import uuid

from pydantic import BaseModel, ConfigDict


class DocumentRegistryEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    industry: str
    instrument_type: str
    document_type: str
    category: str
    mandatory: bool
    lc_required: bool
