from pydantic import BaseModel, ConfigDict, Field


class ShipmentConfirmedRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    linear_id: str = Field(alias="linearId")
    document_id: str = Field(alias="documentId")
    document_type: str = Field(alias="documentType")
    on_chain_hash: str = Field(alias="onChainHash")


class PaymentConfirmedRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    linear_id: str = Field(alias="linearId")
    document_id: str = Field(alias="documentId")
    document_type: str = Field(alias="documentType")
    on_chain_hash: str = Field(alias="onChainHash")
