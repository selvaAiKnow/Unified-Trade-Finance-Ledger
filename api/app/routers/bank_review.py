import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_role
from app.db import get_db
from app.models.bank_review_finding import BankReviewFinding
from app.models.enums import UserRole
from app.models.user import User
from app.routers.documents import get_accessible_trade
from app.schemas.bank_review import BankReviewFindingCreate, BankReviewFindingOut

router = APIRouter(prefix="/trades/{trade_id}/bank-review", tags=["bank-review"])


@router.post("", response_model=BankReviewFindingOut, status_code=status.HTTP_201_CREATED)
async def record_bank_review_finding(
    trade_id: uuid.UUID,
    payload: BankReviewFindingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.BANK_REVIEWER.value)),
) -> BankReviewFindingOut:
    await get_accessible_trade(trade_id, db, current_user)

    finding = BankReviewFinding(
        trade_id=trade_id,
        document_id=payload.document_id,
        result=payload.result.value,
        note=payload.note,
        reviewed_by=current_user.id,
    )
    db.add(finding)
    await db.commit()
    await db.refresh(finding)
    return finding


@router.get("", response_model=list[BankReviewFindingOut])
async def list_bank_review_findings(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BankReviewFindingOut]:
    await get_accessible_trade(trade_id, db, current_user)
    result = await db.execute(select(BankReviewFinding).where(BankReviewFinding.trade_id == trade_id))
    return list(result.scalars().all())
