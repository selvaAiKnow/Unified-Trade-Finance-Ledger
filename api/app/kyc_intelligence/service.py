import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.kyc_intelligence.checker import KybDocumentChecker
from app.models.enums import KybCheckStatus
from app.models.kyb_check import KybCheck

logger = logging.getLogger(__name__)


async def run_kyb_document_check(
    check_id: uuid.UUID,
    content: bytes,
    org_name: str,
    session_factory: async_sessionmaker,
    checker: KybDocumentChecker,
    media_type: str,
) -> None:
    try:
        result = await checker.check(content, org_name, media_type)
    except Exception:
        logger.exception("KYB document AI check failed for check %s", check_id)
        result = None

    async with session_factory() as db:
        check = await db.get(KybCheck, check_id)
        if result is None:
            check.status = KybCheckStatus.FLAGGED.value
            check.ai_summary = "AI check could not be completed automatically. Manual review required."
        elif result.verified:
            check.status = KybCheckStatus.PASSED.value
            check.ai_summary = result.summary
        else:
            check.status = KybCheckStatus.FLAGGED.value
            check.ai_summary = result.summary
        check.checked_at = datetime.now(timezone.utc)
        await db.commit()
