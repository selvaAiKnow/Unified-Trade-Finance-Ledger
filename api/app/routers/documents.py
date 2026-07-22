import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import user_can_access_trade
from app.auth.dependencies import get_current_user
from app.db import get_db
from app.hashing import sha256_hex
from app.models.document import Document
from app.models.trade import Trade
from app.models.user import User
from app.schemas.document import DocumentOut
from app.storage import upload_bytes

router = APIRouter(prefix="/trades/{trade_id}/documents", tags=["documents"])


async def get_accessible_trade(trade_id: uuid.UUID, db: AsyncSession, user: User) -> Trade:
    trade = await db.get(Trade, trade_id)
    if trade is None or not user_can_access_trade(user, trade):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    trade_id: uuid.UUID,
    category: str = Form(...),
    document_type: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentOut:
    trade = await get_accessible_trade(trade_id, db, current_user)
    content = await file.read()
    object_key = f"{trade_id}/{uuid.uuid4()}-{file.filename}"
    upload_bytes(object_key, content, file.content_type or "application/octet-stream")

    document = Document(
        trade_id=trade_id,
        category=category,
        document_type=document_type,
        uploaded_by=current_user.id,
        submitted_to=trade.issuing_bank_org_id,
        off_chain_storage_ref=object_key,
        on_chain_hash=sha256_hex(content),
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentOut]:
    await get_accessible_trade(trade_id, db, current_user)
    result = await db.execute(select(Document).where(Document.trade_id == trade_id))
    return list(result.scalars().all())
