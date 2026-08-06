from sqlalchemy.ext.asyncio import async_sessionmaker

from app.kyc_intelligence.checker import KybDocumentCheckResult
from app.kyc_intelligence.service import run_kyb_document_check
from app.models.enums import KybCheckStatus, KybCheckType
from app.models.kyb_check import KybCheck
from app.models.organization import Organization


class StubVerifiedChecker:
    async def check(self, content, org_name, media_type):
        return KybDocumentCheckResult(verified=True, summary="Looks genuine.")


class StubUnverifiedChecker:
    async def check(self, content, org_name, media_type):
        return KybDocumentCheckResult(verified=False, summary="Org name does not match.")


class StubNoneChecker:
    async def check(self, content, org_name, media_type):
        return None


class StubFailingChecker:
    async def check(self, content, org_name, media_type):
        raise RuntimeError("boom")


async def _make_check(db_session) -> KybCheck:
    org = Organization(name="Test Org", org_type="EXPORTER", country="India", industry="Pharmaceuticals", tax_id="TAX-SVC-1")
    db_session.add(org)
    await db_session.flush()
    check = KybCheck(org_id=org.id, check_type=KybCheckType.BUSINESS_REGISTRATION.value, status=KybCheckStatus.PENDING.value)
    db_session.add(check)
    await db_session.commit()
    return check


def _session_factory_for(db_session) -> async_sessionmaker:
    return async_sessionmaker(bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint")


async def test_run_kyb_document_check_passes_when_verified(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubVerifiedChecker(), "application/pdf")

    await db_session.refresh(check)
    assert check.status == "PASSED"
    assert check.ai_summary == "Looks genuine."
    assert check.checked_at is not None


async def test_run_kyb_document_check_flags_when_unverified(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubUnverifiedChecker(), "application/pdf")

    await db_session.refresh(check)
    assert check.status == "FLAGGED"
    assert check.ai_summary == "Org name does not match."


async def test_run_kyb_document_check_flags_when_result_is_none(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubNoneChecker(), "application/pdf")

    await db_session.refresh(check)
    assert check.status == "FLAGGED"
    assert check.ai_summary == "AI check could not be completed automatically. Manual review required."


async def test_run_kyb_document_check_flags_when_checker_raises(db_session):
    check = await _make_check(db_session)
    session_factory = _session_factory_for(db_session)

    await run_kyb_document_check(check.id, b"bytes", "Test Org", session_factory, StubFailingChecker(), "application/pdf")

    await db_session.refresh(check)
    assert check.status == "FLAGGED"
