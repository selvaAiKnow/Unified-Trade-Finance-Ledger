import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.access import trades_query_for_user, user_can_access_trade
from app.auth.dependencies import get_current_user
from app.db import get_db
from app.models.trade import Trade
from app.models.user import User
from app.schemas.trade import TradeCreate, TradeOut

router = APIRouter(prefix="/trades", tags=["trades"])


@router.post("", response_model=TradeOut, status_code=status.HTTP_201_CREATED)
async def create_trade(
    payload: TradeCreate,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TradeOut:
    trade = Trade(**payload.model_dump())
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    return trade


@router.get("", response_model=list[TradeOut])
async def list_trades(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TradeOut]:
    result = await db.execute(trades_query_for_user(current_user))
    return list(result.scalars().all())


@router.get("/{trade_id}", response_model=TradeOut)
async def get_trade(
    trade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TradeOut:
    trade = await db.get(Trade, trade_id)
    if trade is None or not user_can_access_trade(current_user, trade):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    return trade
