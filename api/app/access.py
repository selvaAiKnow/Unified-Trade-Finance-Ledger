from sqlalchemy import Select, or_, select

from app.models.trade import Trade
from app.models.user import User


def user_can_access_trade(user: User, trade: Trade) -> bool:
    return user.org_id in {
        trade.exporter_org_id,
        trade.buyer_org_id,
        trade.issuing_bank_org_id,
        trade.advising_bank_org_id,
    }


def trades_query_for_user(user: User) -> Select:
    return select(Trade).where(
        or_(
            Trade.exporter_org_id == user.org_id,
            Trade.buyer_org_id == user.org_id,
            Trade.issuing_bank_org_id == user.org_id,
            Trade.advising_bank_org_id == user.org_id,
        )
    )
