import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.sanctions_screening import SanctionsScreening
from app.models.user import User
from app.routers.documents import get_accessible_trade
from app.sanctions.client import SanctionsClient
from app.sanctions.dependency import get_sanctions_client
from app.schemas.sanctions import SanctionsScreeningOut, SanctionsScreeningTrigger

router = APIRouter(prefix="/trades/{trade_id}/sanctions-screening", tags=["sanctions-screening"])


@router.post("", response_model=SanctionsScreeningOut, status_code=status.HTTP_201_CREATED)
async def trigger_sanctions_screening(
    trade_id: uuid.UUID,
    payload: SanctionsScreeningTrigger,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    sanctions_client: SanctionsClient = Depends(get_sanctions_client),
) -> SanctionsScreeningOut:
    trade = await get_accessible_trade(trade_id, db, current_user)
    result = await sanctions_client.screen(name=payload.party_screened, country=trade.industry)

    screening = SanctionsScreening(
        trade_id=trade_id,
        party_screened=payload.party_screened,
        status=result["status"],
        raw_response=dict(result),
    )
    db.add(screening)
    await db.commit()
    await db.refresh(screening)
    return screening


@router.get("", response_model=list[SanctionsScreeningOut])
async def list_sanctions_screenings(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SanctionsScreeningOut]:
    await get_accessible_trade(trade_id, db, current_user)
    result = await db.execute(select(SanctionsScreening).where(SanctionsScreening.trade_id == trade_id))
    return list(result.scalars().all())
