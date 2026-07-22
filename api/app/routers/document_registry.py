from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.document_registry import DocumentRegistryEntry
from app.schemas.document_registry import DocumentRegistryEntryOut

router = APIRouter(prefix="/document-registry", tags=["document-registry"])


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
    return list(result.scalars().all())
