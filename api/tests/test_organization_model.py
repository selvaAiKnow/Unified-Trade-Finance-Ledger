from sqlalchemy import select

from app.models.enums import KybStatus
from app.models.organization import Organization


async def test_create_and_fetch_organization(db_session):
    org = Organization(
        name="MedCure Pharma Exports Pvt. Ltd.",
        org_type="EXPORTER",
        country="India",
        industry="Pharmaceuticals",
        tax_id="27AAECM1234B1Z5",
    )
    db_session.add(org)
    await db_session.commit()

    result = await db_session.execute(select(Organization).where(Organization.name == org.name))
    fetched = result.scalar_one()
    assert fetched.org_type == "EXPORTER"
    assert fetched.kyb_status == KybStatus.PENDING.value
    assert fetched.id is not None
