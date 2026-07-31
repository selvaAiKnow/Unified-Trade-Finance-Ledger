import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.document_intelligence.checker import DocumentChecker
from app.models.document import Document
from app.models.organization import Organization
from app.models.trade import Trade

logger = logging.getLogger(__name__)


async def build_trade_terms(trade: Trade, db: AsyncSession) -> dict[str, str]:
    exporter = await db.get(Organization, trade.exporter_org_id)
    buyer = await db.get(Organization, trade.buyer_org_id)
    return {
        "lc_reference": trade.lc_reference,
        "exporter": exporter.name if exporter else str(trade.exporter_org_id),
        "buyer": buyer.name if buyer else str(trade.buyer_org_id),
        "product_description": trade.product_description,
        "order_value": str(trade.order_value),
        "currency": trade.currency,
        "incoterm": trade.incoterm,
        "payment_term": trade.payment_term,
    }


async def run_document_check(
    document_id: uuid.UUID,
    content: bytes,
    trade_terms: dict[str, str],
    session_factory: async_sessionmaker,
    checker: DocumentChecker,
) -> None:
    try:
        result = await checker.check(content, trade_terms)
    except Exception:
        logger.exception("Document AI check failed for document %s", document_id)
        return

    async with session_factory() as db:
        document = await db.get(Document, document_id)
        document.verification_status = "VERIFIED" if result.compliant else "DISCREPANCY"
        document.ai_summary = result.summary
        document.ai_discrepancies = result.discrepancies
        document.ai_checked_at = datetime.now(timezone.utc)
        await db.commit()
