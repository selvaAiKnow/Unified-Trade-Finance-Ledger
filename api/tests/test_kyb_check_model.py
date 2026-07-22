from sqlalchemy import select

from app.models.enums import KybCheckStatus, KybCheckType
from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.sanctions.fake import FakeSanctionsClient


async def test_create_kyb_check_rows(db_session):
    org = Organization(name="MedCure Pharma Exports", org_type="EXPORTER", country="India", industry="Pharmaceuticals", tax_id="27AAECM1234B1Z5")
    db_session.add(org)
    await db_session.flush()

    db_session.add_all(
        [
            KybCheck(org_id=org.id, check_type=KybCheckType.BUSINESS_REGISTRATION.value, status=KybCheckStatus.PASSED.value),
            KybCheck(org_id=org.id, check_type=KybCheckType.SANCTIONS_SCREENING.value, status=KybCheckStatus.PASSED.value, detail="fake:CLEAR"),
            KybCheck(org_id=org.id, check_type=KybCheckType.BANK_ACCOUNT.value, status=KybCheckStatus.PASSED.value),
        ]
    )
    await db_session.commit()

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org.id))).scalars().all()
    assert len(rows) == 3
    assert {r.check_type for r in rows} == {"BUSINESS_REGISTRATION", "SANCTIONS_SCREENING", "BANK_ACCOUNT"}


async def test_fake_sanctions_client_returns_clear():
    client = FakeSanctionsClient()
    result = await client.screen(name="MedCure Pharma Exports", country="India")
    assert result["status"] == "CLEAR"
    assert result["matches"] == []
