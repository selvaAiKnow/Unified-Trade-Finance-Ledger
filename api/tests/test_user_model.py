from sqlalchemy import select

from app.auth.security import hash_password, verify_password
from app.models.organization import Organization
from app.models.user import User


async def test_create_user_with_hashed_password(db_session):
    org = Organization(name="MedCure Pharma Exports", org_type="EXPORTER", country="India", industry="Pharmaceuticals", tax_id="27AAECM1234B1Z5")
    db_session.add(org)
    await db_session.flush()

    user = User(
        org_id=org.id,
        name="Priya Shah",
        email="priya@medcurepharma.example",
        password_hash=hash_password("correct horse battery staple"),
        role="EXPORTER_ADMIN",
        status="ACTIVE",
    )
    db_session.add(user)
    await db_session.commit()

    result = await db_session.execute(select(User).where(User.email == "priya@medcurepharma.example"))
    fetched = result.scalar_one()
    assert verify_password("correct horse battery staple", fetched.password_hash)
    assert not verify_password("wrong password", fetched.password_hash)
    assert fetched.org_id == org.id
