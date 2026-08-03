import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.document_registry import DocumentRegistryEntry
from app.schemas.document_registry import DocumentRegistryEntryOut

router = APIRouter(prefix="/document-registry", tags=["document-registry"])

GENERIC_FALLBACK_DOCUMENT_TYPES = ["Commercial Invoice", "Packing List", "Certificate of Origin", "Bill of Lading"]
GENERIC_FALLBACK_NAMESPACE = uuid.UUID("6f2b7e8a-6b6b-4b1e-9f7f-2f1a6f7c9d10")


def _generic_fallback_checklist(industry: str, instrument_type: str) -> list[DocumentRegistryEntryOut]:
    return [
        DocumentRegistryEntryOut(
            id=uuid.uuid5(GENERIC_FALLBACK_NAMESPACE, f"{industry}/{instrument_type}/{document_type}"),
            industry=industry,
            instrument_type=instrument_type,
            document_type=document_type,
            category="Trade Documents",
            mandatory=True,
            lc_required=instrument_type == "Letter of Credit",
        )
        for document_type in GENERIC_FALLBACK_DOCUMENT_TYPES
    ]


@router.get("", response_model=list[DocumentRegistryEntryOut], dependencies=[Depends(get_current_user)])
async def list_document_registry(
    industry: str,
    instrument_type: str,
    db: AsyncSession = Depends(get_db),
) -> list[DocumentRegistryEntryOut]:
    result = await db.execute(
        select(DocumentRegistryEntry).where(
            DocumentRegistryEntry.industry == industry,
            DocumentRegistryEntry.instrument_type == instrument_type,
        )
    )
    entries = list(result.scalars().all())
    if entries:
        return entries
    return _generic_fallback_checklist(industry, instrument_type)
